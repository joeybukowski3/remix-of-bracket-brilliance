import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildWeek1ShadowTrainingRow } from "./week1Rows";
import type { Week1ShadowCandidate } from "./week1Universe";

function historyRow(overrides: Partial<HistoricalPlayerWeek>): HistoricalPlayerWeek {
  return {
    season: 2025, week: 1, playerId: "gsis:1", playerName: "Test Runner", position: "RB", team: "buf", opponent: "hou",
    externalIds: { gsis: "1", pfr: null, espn: null }, actualFantasyPoints: 10,
    stats: { passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0, rushAttempts: 15, rushingYards: 80, rushingTouchdowns: 1, receptions: 2, targets: 3, receivingYards: 10, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0, receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0, rushingTwoPointConversions: 0, receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0 },
    usage: { offensiveSnaps: 40, snapShare: 0.6, passAttempts: 0, completions: 0, rushAttempts: 15, targets: 3, receptions: 2, receivingAirYards: 20, targetShare: 0.15, airYardsShare: 0.1, routes: null, routeParticipation: null, redZoneTouches: null, goalLineTouches: null, redZoneTargets: null },
    provenance: { source: "nflverse stats_player weekly", sourceSeason: 2025, sourceWeek: 1, scoringVersion: "jkb-full-ppr-v1.0.0", snapSource: null },
    ...overrides,
  };
}

const candidate: Week1ShadowCandidate = {
  playerKey: "pfr:AAAA00", playerId: "gsis:1", playerName: "Test Runner", position: "RB",
  team: "buf", opponent: "nyj", homeAway: "away", rosProjectedPpg: 12.5, rosConsensusRank: 5,
};

describe("buildWeek1ShadowTrainingRow", () => {
  it("produces truthful Week 1 current-season-empty fields alongside populated 2025 prior-season fields", () => {
    const history = [historyRow({}), historyRow({ week: 2, actualFantasyPoints: 14 })];
    const row = buildWeek1ShadowTrainingRow(candidate, history, "2026-08-22T00:00:00.000Z", { generatedAt: "2026-08-22T00:00:00.000Z", sourceManifests: [], scheduleSource: { url: "", retrievedAtUtc: "", sha256: "0".repeat(64) } });

    expect(row.season).toBe(2026);
    expect(row.week).toBe(1);
    expect(row.gamesPlayedPrior).toBe(0);
    expect(row.seasonPpgPrior).toBeNull();
    expect(row.last3PpgPrior).toBeNull();

    expect(row.hasPriorSeason).toBe(true);
    expect(row.priorSeasonGames).toBe(2);
    expect(row.priorSeasonPpg).toBeCloseTo(12, 5);
    expect(row.priorSeasonCarries).toBeCloseTo(15, 5);

    expect(row.team).toBe("buf");
    expect(row.opponent).toBe("nyj");
    expect(row.homeAway).toBe("away");

    expect(row.teamOffensiveEpaPrior).toBeNull();
    expect(row.opponentPositionFpaPrior).toBeNull();
  });

  it("marks a player with no 2025 rows as rookieOrNoPriorHistory with null priorSeasonPpg", () => {
    const rookieCandidate: Week1ShadowCandidate = { ...candidate, playerId: "gsis:rookie" };
    const row = buildWeek1ShadowTrainingRow(rookieCandidate, [], "2026-08-22T00:00:00.000Z", { generatedAt: "2026-08-22T00:00:00.000Z", sourceManifests: [], scheduleSource: { url: "", retrievedAtUtc: "", sha256: "0".repeat(64) } });
    expect(row.rookieOrNoPriorHistory).toBe(true);
    expect(row.priorSeasonPpg).toBeNull();
    expect(row.gamesPlayedPrior).toBe(0);
  });
});
