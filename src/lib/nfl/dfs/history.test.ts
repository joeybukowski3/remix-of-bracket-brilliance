import { describe, expect, it } from "vitest";
import { adaptDfsFantasyPointsAllowed, resolveDfsHistoryContext } from "./history";
import { buildMetric, buildResearchContext } from "./__fixtures__/researchFactory";
import type { NflYardageHistoryArtifact } from "@/lib/nfl/props/types/yardageHistory";
import { buildIndividualYardageHistory, normalizeIndividualHistoryStatRows } from "../../../../scripts/lib/nfl-individual-yardage-history.mjs";
import { buildGameLookup } from "../../../../scripts/lib/nfl-yardage-history-core.mjs";

const target = { season: 2026, week: 1, asOf: "2026-09-10T12:00:00Z" };
function artifact(): NflYardageHistoryArtifact {
  const teams = new Map([["a", "A"], ["b", "B"]]);
  const games = [{ gameId: "old", season: 2025, week: 1, dateUtc: "2025-09-01T17:00:00Z", homeAbbr: "b", awayAbbr: "a" }];
  const individualContext = buildIndividualYardageHistory({ ...target, requests: [{ playerId: "gsis:p", market: "passing", position: "QB", opponent: "b" }],
    statRows: normalizeIndividualHistoryStatRows([{ season: 2025, season_type: "REG", week: 1, player_id: "p", position: "QB", recent_team: "A", opponent_team: "B", attempts: 20, passing_yards: 100 }], 2025),
    gameLookup: buildGameLookup(games, [{ ...games[0], homeScore: 0, awayScore: 7, winner: "a" }], teams), canonicalToNflverseAbbr: teams, archiveIndex: new Map() });
  return { schemaVersion: "nfl-yardage-history-v2", season: 2026, week: 1, _meta: { generatedAt: target.asOf, season: 2026, week: 1, source: "fixture", notes: [] }, players: {}, teamDefense: {}, individualContext };
}

describe("DFS history adapter", () => {
  it("consumes real producer output with exact target metadata", () => {
    const data = artifact();
    const context = resolveDfsHistoryContext(data, target);
    expect(context).toBe(data.individualContext);
    expect(context.players["gsis:p:passing"][0]).toMatchObject({ actualYards: 100, temporalQuality: "event-time-reconstructed" });
  });
  it("fails closed for missing legacy data, wrong week and earlier/later cutoffs", () => {
    const data = artifact();
    expect(resolveDfsHistoryContext({ ...data, individualContext: undefined }, target)).toBeNull();
    expect(resolveDfsHistoryContext(data, { ...target, week: 2 })).toBeNull();
    expect(resolveDfsHistoryContext(data, { ...target, asOf: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(resolveDfsHistoryContext(data, { ...target, asOf: "2026-09-11T00:00:00Z" })).toBeNull();
  });
  it("rejects target/future rows even in an otherwise matching envelope", () => {
    const data = artifact();
    data.individualContext.players["gsis:p:passing"][0].dateUtc = target.asOf;
    expect(resolveDfsHistoryContext(data, target)).toBeNull();
  });
});

describe("canonical FPA passthrough", () => {
  it("preserves distinct season/L5 values, ranks, games and sample metadata", () => {
    const season = buildMetric({ value: 22, rank: 4, sampleSize: 17, sampleSeason: 2025, games: [{ season: 2025, week: 1 }] });
    const l5 = buildMetric({ value: 18, rank: 9, sampleSize: 5, sampleSeason: 2025, games: [{ season: 2025, week: 17 }] });
    const result = adaptDfsFantasyPointsAllowed({ status: "available", context: buildResearchContext({ opponentFpaSeason: season, opponentFpaLast5: l5 }), matchupEdges: null, matchupGrade: null });
    expect(result.opponentFpaSeason).toBe(season);
    expect(result.opponentFpaLast5).toBe(l5);
  });
  it("does not attach unavailable/mismatched research or substitute reference CSV data", () => {
    expect(adaptDfsFantasyPointsAllowed(null)).toEqual({ opponentFpaSeason: null, opponentFpaLast5: null });
    expect(adaptDfsFantasyPointsAllowed({ status: "position-mismatch", context: buildResearchContext(), matchupEdges: null, matchupGrade: null }).opponentFpaSeason).toBeNull();
  });
});
