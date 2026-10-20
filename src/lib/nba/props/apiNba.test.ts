import { describe, expect, it } from "vitest";
import { AWAY, envelope, gamePlayerRows, gameTeamRows, HOME, PROBE_GAME_ID, syntheticGames } from "./__fixtures__/apiNbaSynthetic";
import {
  createApiNbaAdapter,
  indexGames,
  isDidNotPlay,
  normalizePlayerStats,
  normalizeTeamStats,
  parseApiNbaMinutes,
  parseEnvelope,
  validators,
  type ApiNbaGame,
  type ApiNbaPlayerStat,
  type ApiNbaTeamStat,
} from "./sources/apiNba";
import { SourceUseNotPermittedError, createPayload, normalizePayloads } from "./sources/ingest";
import { SOURCE_LICENSES } from "./sources/licenses";
import { DATA_USES, type SourceRequest } from "./sources/types";

const games = syntheticGames as ApiNbaGame[];
const RETRIEVED = "2026-10-20T12:00:00.000Z";

describe("API-NBA minutes and DNP parsing", () => {
  it("distinguishes MM:SS, whole minutes, absent and malformed values", () => {
    expect(parseApiNbaMinutes("34:12")).toEqual({ minutes: 34.2, format: "minutes-seconds" });
    expect(parseApiNbaMinutes("35")).toEqual({ minutes: 35, format: "whole-minutes" });
    expect(parseApiNbaMinutes(null)).toEqual({ minutes: null, format: "absent" });
    expect(parseApiNbaMinutes("-")).toEqual({ minutes: null, format: "absent" });
    expect(parseApiNbaMinutes("12:75").format).toBe("unparseable");
    expect(parseApiNbaMinutes("DNP").format).toBe("unparseable");
  });

  it("treats null-minute rows with a comment as did-not-play", () => {
    const rows = gamePlayerRows() as unknown as ApiNbaPlayerStat[];
    expect(rows.filter(isDidNotPlay).map((r) => r.player.id)).toEqual([900020, 900120]);
  });
});

describe("API-NBA envelope and shape validation", () => {
  it("rejects non-JSON, missing response arrays and results/length disagreement", () => {
    expect(parseEnvelope("<html>")).toEqual({ error: "body is not JSON" });
    expect(parseEnvelope('{"response":{}}')).toEqual({ error: "`response` is not an array" });
    expect(parseEnvelope('{"results":2,"response":[1]}')).toEqual({ error: "results=2 but response has 1 item(s)" });
  });

  it("detects schema drift in each response kind", () => {
    expect(validators.games(games)).toBeNull();
    expect(validators.games([{ id: 1, date: { start: "x" }, teams: {} }])).toMatch(/date.start/);
    expect(validators.playerStats(gamePlayerRows())).toBeNull();
    expect(validators.playerStats([{ player: { id: 1 }, team: { id: 2 }, game: { id: 3 }, min: 34 }])).toMatch(/min is not a string/);
    expect(validators.teamStats(gameTeamRows())).toBeNull();
    expect(validators.teamStats([{ team: { id: 1 }, statistics: [] }])).toMatch(/statistics missing/);
    expect(validators.seasons([2023, "2024"])).toMatch(/integers/);
  });
});

describe("API-NBA normalization into the canonical schemas (synthetic only)", () => {
  const { byId, issues } = indexGames(games);

  it("maps only the verified regular-season stage and reports the rest", () => {
    expect([...byId.keys()].sort()).toEqual(["777000", "777001"]);
    expect(issues).toEqual([expect.objectContaining({ code: "unmapped-stage", gameId: "776999" })]);
    expect(byId.get(String(PROBE_GAME_ID))).toMatchObject({ gameDate: "2024-01-15", season: "2023-24", seasonType: "regular" });
  });

  it("produces player rows with decimal minutes and moves DNP rows to postgame availability", () => {
    const result = normalizePlayerStats(gamePlayerRows() as unknown as ApiNbaPlayerStat[], byId, "snap-1", RETRIEVED);
    expect(result.issues).toEqual([]);
    expect(result.playerRows).toHaveLength(16);
    const first = result.playerRows[0];
    expect(first).toMatchObject({ schemaVersion: "nba-player-game-v1", playerId: 900001, teamId: HOME.id, opponentTeamId: AWAY.id, isHome: true, opponentAbbr: "AWY", minutes: 36.5, pts: 20, plusMinus: 5 });
    const homeMinutes = result.playerRows.filter((r) => r.teamId === HOME.id).reduce((s, r) => s + r.minutes, 0);
    expect(homeMinutes).toBe(240);
    expect(result.availability).toEqual([
      expect.objectContaining({ playerId: 900020, status: "dnp", reason: "DNP - Coach's Decision", asOfUtc: RETRIEVED, starter: null }),
      expect.objectContaining({ playerId: 900120, status: "inactive" }),
    ]);
  });

  it("reports rows for unknown games, foreign teams and duplicates as errors", () => {
    const [row] = gamePlayerRows() as unknown as ApiNbaPlayerStat[];
    const result = normalizePlayerStats([row, row, { ...row, game: { id: 1 } }, { ...row, player: { id: 5 }, team: { id: 42 } }], byId, "snap-1", RETRIEVED);
    expect(result.issues.map((i) => i.code)).toEqual(["duplicate-player-game", "game-context-missing", "team-not-in-game"]);
  });

  it("produces team rows with game minutes, result, and score reconciliation", () => {
    const ctx = byId.get(String(PROBE_GAME_ID));
    const result = normalizeTeamStats(gameTeamRows() as unknown as ApiNbaTeamStat[], ctx, "snap-2");
    expect(result.issues).toEqual([]);
    expect(result.teamRows.map((r) => [r.teamId, r.minutes, r.won, r.pts])).toEqual([[HOME.id, 48, true, 110], [AWAY.id, 48, false, 100]]);
    const mismatched = normalizeTeamStats([{ ...gameTeamRows()[0], statistics: [{ ...gameTeamRows()[0].statistics[0], points: 108 }] }] as unknown as ApiNbaTeamStat[], ctx, "snap-2");
    expect(mismatched.issues).toEqual([expect.objectContaining({ code: "team-points-mismatch", severity: "warning" })]);
  });
});

describe("API-NBA license gate", () => {
  const adapter = createApiNbaAdapter(games);
  const request: SourceRequest = { requestKey: `player_games/game=${PROBE_GAME_ID}`, table: "player_games", season: "2023-24", seasonType: "regular", endpoint: "players/statistics", params: {} };
  const payload = createPayload("api-sports-nba", request, { httpStatus: 200, retrievedAtUtc: RETRIEVED, bodyText: envelope("players/statistics", gamePlayerRows()) });

  it("is recorded as unlicensed with no permitted use", () => {
    expect(SOURCE_LICENSES["api-sports-nba"]).toMatchObject({ status: "unlicensed", permittedUses: [] });
  });

  it("refuses ingestion for every use", () => {
    for (const use of DATA_USES) expect(() => normalizePayloads(adapter, [payload], use)).toThrow(SourceUseNotPermittedError);
  });

  it("normalizes a synthetic payload through the adapter (test path only)", () => {
    const snapshot = adapter.normalize(payload);
    expect(snapshot.playerRows).toHaveLength(16);
    expect(snapshot.availability).toHaveLength(2);
    expect(() => adapter.normalize({ ...payload, bodyText: envelope("players/statistics", [{ player: {} }]) })).toThrow(/schema drift/);
  });
});
