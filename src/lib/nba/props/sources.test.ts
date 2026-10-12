import { describe, expect, it } from "vitest";
import { buildDataset } from "./dataset";
import { buildTeamGameDates, computePregameFeatures } from "./features";
import { BASELINE_V0_PUBLIC_PARAMS, projectBaseline } from "./projection";
import { applyPlayerCrosswalk, buildSourceDataset, createPayload, normalizePayloads, sha256, SourceUseNotPermittedError } from "./sources/ingest";
import { SOURCE_LICENSES } from "./sources/licenses";
import { statsNbaAdapter, statsNbaMetaV1ToV2 } from "./sources/statsNbaAdapter";
import { DATA_USES } from "./sources/types";
import { syntheticPayload, syntheticSourceAdapter, type SyntheticPlayerRow, type SyntheticTeamRow } from "./__fixtures__/syntheticSource";
import { playerResultSet, rawPlayerRow } from "./__fixtures__/synthetic";
import type { RawSnapshotMeta } from "./types";

const SEASON = "2041-42";
const stats = (pts: number) => ({ pts, reb: 6, oreb: 2, dreb: 4, ast: 3, fgm: 5, fga: 10, fg3m: 1, fg3a: 3, ftm: 2, fta: 2, stl: 1, blk: 0, tov: 2, pf: 2, plus_minus: 4 });
const game = (id: number, date: string) => ({ id, date, season: SEASON, type: "regular" });
const A = { id: 70, abbr: "SYA" };
const B = { id: 71, abbr: "SYB" };

function playerRow(gameId: number, date: string, playerId: number, team = A, opponent = B, minutes = 29, pts = 3): SyntheticPlayerRow {
  // 29:60 exercises the minutes+seconds conversion (= 30.0 decimal minutes).
  return { game: game(gameId, date), player: { id: playerId, name: `Synthetic ${playerId}` }, team, opponent, home: team === A, minutes, seconds: 60, stats: stats(pts) };
}

function teamRow(gameId: number, date: string, team = A, opponent = B, pts = 24): SyntheticTeamRow {
  return { game: game(gameId, date), team, opponent, home: team === A, team_minutes: 240, won: team === A, stats: stats(pts) };
}

const dates = ["2041-10-20", "2041-10-22", "2041-10-24"];
// Eight players per team at 30 minutes (= 240 player-minutes) scoring 3 each (= 24 team points), so both reconciliations hold.
const ROSTER = [1, 2, 3, 4, 5, 6, 7, 8];
const playerRows = dates.flatMap((date, g) => ROSTER.flatMap((p) => [playerRow(500 + g, date, 9000 + p), playerRow(500 + g, date, 9100 + p, B, A)]));
const teamRows = dates.flatMap((date, g) => [teamRow(500 + g, date), teamRow(500 + g, date, B, A)]);

describe("provider-neutral ingestion with a synthetic commercial-style source", () => {
  const payloads = [
    syntheticPayload("player_games", SEASON, "regular", playerRows),
    syntheticPayload("team_games", SEASON, "regular", teamRows),
    syntheticPayload("availability", SEASON, "regular", [
      { game: game(503, "2041-10-26"), player: { id: 9001 }, team: { id: 70 }, status: "OUT", reason: "Ankle", starter: null, as_of: "2041-10-26T16:00:00Z" },
      { game: game(503, "2041-10-26"), player: { id: 9002 }, team: { id: 70 }, status: "ACTIVE", reason: null, starter: true, as_of: "2041-10-26T22:30:00Z" },
    ], "2041-10-26T23:00:00.000Z", "2041-10-26T22:30:00Z"),
  ];

  it("builds the existing canonical dataset from a differently shaped provider", () => {
    const { dataset, availability, sourceId } = buildSourceDataset(syntheticSourceAdapter, payloads, "model-development");
    expect(sourceId).toBe("synthetic");
    expect(dataset.issues.map((i) => i.code)).toEqual([]);
    expect(dataset.games).toHaveLength(3);
    expect(dataset.teamGames.every((row) => row.minutes === 48)).toBe(true);
    expect(dataset.playerGames[0].minutes).toBeCloseTo(30);
    expect(dataset.playerGames.find((row) => row.playerId === 9101)?.opponentTeamId).toBe(70);
    expect(dataset.coverage[0]).toMatchObject({ season: SEASON, games: 3, playerGames: 48, pointsReconciliationFailures: 0, minutesReconciliationWarnings: 0 });
    expect(availability.map((r) => [r.playerId, r.status, r.starter])).toEqual([[9001, "out", null], [9002, "active", true]]);
  });

  it("feeds the unchanged v0 feature and projection code", () => {
    const { dataset } = buildSourceDataset(syntheticSourceAdapter, payloads, "model-development");
    const history = dataset.playerGames.filter((row) => row.playerId === 9001);
    const target = { gameId: "503", cutoffDate: "2041-10-26", season: SEASON, teamId: 70 };
    const features = computePregameFeatures(history, target, buildTeamGameDates(dataset.teamGames));
    expect(features.priorGames).toBe(3);
    const { minutesShrinkGames: k, newPlayerMinutes: prior } = BASELINE_V0_PUBLIC_PARAMS;
    // Three 30-minute games, shrunk toward the new-player prior by k games (v0 formula).
    expect(projectBaseline(features, { leagueRate: { pts: 0.4, reb: 0.2, ast: 0.1 } }, BASELINE_V0_PUBLIC_PARAMS).minutes).toBeCloseTo((3 * 30 + k * prior) / (3 + k));
  });

  it("verifies integrity and source identity before normalizing", () => {
    const tampered = { ...payloads[0], bodyText: payloads[0].bodyText.replace('"pts":3', '"pts":4') };
    expect(() => normalizePayloads(syntheticSourceAdapter, [tampered], "model-development")).toThrow(/integrity/);
    const wrongSource = { ...payloads[0], meta: { ...payloads[0].meta, sourceId: "balldontlie" as const } };
    expect(() => normalizePayloads(syntheticSourceAdapter, [wrongSource], "model-development")).toThrow(/not synthetic/);
    expect(payloads[0].meta.bodySha256).toBe(sha256(payloads[0].bodyText));
  });

  it("refuses to merge sources whose ids are not comparable", () => {
    const synthetic = normalizePayloads(syntheticSourceAdapter, payloads.slice(0, 2), "model-development");
    const other = { ...synthetic[0], meta: { ...synthetic[0].meta, sourceId: "sportsdataio" } };
    expect(() => buildDataset([...synthetic, other])).toThrow(/multiple sources/);
  });

  it("requires an as-of timestamp for availability snapshots", () => {
    expect(() => syntheticPayload("availability", SEASON, "regular", [], "2041-10-26T23:00:00.000Z", null)).toThrow(/asOfUtc/);
  });

  it("reports schema drift, season mismatches, bad stats and unknown statuses", () => {
    const drift = createPayload("synthetic", syntheticSourceAdapter.planRequests({ seasons: [SEASON], seasonTypes: ["regular"], tables: ["player_games"] })[0], { httpStatus: 200, retrievedAtUtc: "2042-01-01T00:00:00Z", bodyText: "{\"data\":[]}" });
    expect(() => syntheticSourceAdapter.normalize(drift)).toThrow(/schema drift/);
    const mixed = syntheticPayload("player_games", SEASON, "regular", [
      { ...playerRow(600, "2041-11-01", 1), game: { ...game(600, "2041-11-01"), type: "playoffs" } },
      { ...playerRow(601, "2041-11-02", 2), stats: { ...stats(5), pts: -1 } },
    ]);
    expect(syntheticSourceAdapter.normalize(mixed).issues.map((i) => i.code)).toEqual(["season_type_mismatch", "invalid_stat"]);
    const odd = syntheticPayload("availability", SEASON, "regular", [{ game: game(600, "2041-11-01"), player: { id: 1 }, team: { id: 70 }, status: "SUSPENDED", reason: null, starter: null, as_of: "2041-11-01T12:00:00Z" }], undefined, "2041-11-01T12:00:00Z");
    const snapshot = syntheticSourceAdapter.normalize(odd);
    expect(snapshot.availability?.[0].status).toBe("unknown");
    expect(snapshot.issues[0]).toMatchObject({ code: "unknown_availability_status", severity: "warning" });
  });

  it("re-keys players through a crosswalk and reports unmapped ids", () => {
    const { dataset } = buildSourceDataset(syntheticSourceAdapter, payloads, "model-development");
    const result = applyPlayerCrosswalk(dataset.playerGames, { fromSource: "synthetic", toSource: "stats.nba.com", mapping: new Map([[9001, 1630001], [9002, 1630002]]) });
    expect(new Set(result.rows.map((row) => row.playerId))).toEqual(new Set([1630001, 1630002]));
    expect(result.unmappedPlayerIds).toEqual([9003, 9004, 9005, 9006, 9007, 9008, 9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108]);
  });
});

describe("source licenses", () => {
  it("permits no use of stats.nba.com data and nothing for unlicensed providers", () => {
    expect(SOURCE_LICENSES["stats.nba.com"].permittedUses).toEqual([]);
    expect(SOURCE_LICENSES.sportsdataio.permittedUses).toEqual([]);
    expect(SOURCE_LICENSES.balldontlie.permittedUses).toEqual([]);
    expect(SOURCE_LICENSES.synthetic.permittedUses).toEqual([...DATA_USES]);
    expect(Object.isFrozen(SOURCE_LICENSES)).toBe(true);
  });

  it("blocks ingestion through the stats.nba.com adapter for every use", () => {
    for (const use of DATA_USES) {
      expect(() => normalizePayloads(statsNbaAdapter, [], use)).toThrow(SourceUseNotPermittedError);
    }
  });
});

describe("stats.nba.com adapter", () => {
  it("plans two season-log requests per season type and rejects availability", () => {
    const requests = statsNbaAdapter.planRequests({ seasons: ["2024-25"], seasonTypes: ["regular", "playoffs"], tables: ["player_games", "team_games"] });
    expect(requests.map((r) => `${r.endpoint}:${r.params.SeasonType}`)).toEqual([
      "playergamelogs:Regular Season", "teamgamelogs:Regular Season", "playergamelogs:Playoffs", "teamgamelogs:Playoffs",
    ]);
    expect(() => statsNbaAdapter.planRequests({ seasons: ["2024-25"], seasonTypes: ["regular"], tables: ["availability"] })).toThrow(/do not provide/);
  });

  it("normalizes through the unchanged Phase 1 normalizer and converts v1 metadata", () => {
    const bodyText = JSON.stringify({ resultSets: [playerResultSet([rawPlayerRow()])] });
    const v1: RawSnapshotMeta = {
      schemaVersion: "nba-raw-snapshot-meta-v1", snapshotId: "playergamelogs/2024-25/regular/x", source: "stats.nba.com", endpoint: "playergamelogs",
      season: "2024-25", seasonType: "regular", params: {}, requestUrl: "", retrievedAtUtc: "2025-07-20T00:00:00Z", httpStatus: 200, attempts: 1,
      bodyFile: "x.body.json", bodyByteSize: bodyText.length, bodySha256: sha256(bodyText), rowCount: 1,
    };
    const meta = statsNbaMetaV1ToV2(v1);
    expect(meta).toMatchObject({ table: "player_games", sourceId: "stats.nba.com", requestKey: "player_games/2024-25/regular", asOfUtc: null });
    const snapshot = statsNbaAdapter.normalize({ meta, bodyText });
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.playerRows?.[0]).toMatchObject({ playerId: 1, minutes: 31.99 });
  });
});
