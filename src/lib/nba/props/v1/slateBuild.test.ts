import { describe, expect, it } from "vitest";
import { FIXTURE_BUILD_AT, FIXTURE_GAME_KEY, FIXTURE_TIPOFF, fixtureImportFile, fixturePositionsFile, fixtureRows, fixtureSlateFile } from "../__fixtures__/v1Fixtures";
import { assembleBoard } from "../pipeline/boardBuild";
import { SOURCE_LICENSES } from "../sources/licenses";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { parsePlayerGameImport } from "./playerGameImport";
import { buildEstimateSet } from "./positionEstimates";
import { buildV1Inputs, leagueRates, parseSlate } from "./slateBuild";

const imported = (rows = fixtureRows(), retrievedAtUtc?: string) => parsePlayerGameImport(fixtureImportFile({ rows, retrievedAtUtc }));
const positions = (without25: string[] = []) => buildEstimateSet([fixturePositionsFile("2025-26", without25), fixturePositionsFile("2026-27")]);
const slate = () => parseSlate(fixtureSlateFile());
const build = (over: { rows?: ReturnType<typeof fixtureRows>; without25?: string[]; slateGames?: ReturnType<typeof slate>; retrievedAtUtc?: string; generatedAtUtc?: string } = {}) =>
  buildV1Inputs({ generatedAtUtc: over.generatedAtUtc ?? FIXTURE_BUILD_AT, imported: imported(over.rows, over.retrievedAtUtc), positions: positions(over.without25), slate: over.slateGames ?? slate() });
const projectionFor = (inputs: ReturnType<typeof build>, name: string, market: string) => inputs.projections.find((p) => p.playerName === name && p.market === market);

describe("parseSlate", () => {
  it("reads canonical games with their Eastern date as the pregame cutoff", () => {
    expect(slate()).toEqual([{ gameKey: FIXTURE_GAME_KEY, tipoffUtc: FIXTURE_TIPOFF, away: "BOS", home: "NYK", date: "2026-10-24" }]);
  });

  it.each([
    ["a game key that is not canonical", { gameKey: "BOS at NYK", tipoffUtc: FIXTURE_TIPOFF }],
    ["an unknown team", { gameKey: "2026-10-24|BOS@XXX", tipoffUtc: FIXTURE_TIPOFF }],
    ["a team playing itself", { gameKey: "2026-10-24|BOS@BOS", tipoffUtc: FIXTURE_TIPOFF }],
    ["a tipoff on a different Eastern date", { gameKey: "2026-10-25|BOS@NYK", tipoffUtc: FIXTURE_TIPOFF }],
    ["a tipoff that is not a UTC instant", { gameKey: FIXTURE_GAME_KEY, tipoffUtc: "tonight" }],
  ])("rejects %s", (_name, game) => {
    expect(() => parseSlate({ season: "2026-27", games: [game] })).toThrow();
  });

  it("rejects a repeated game, an empty slate and the wrong season", () => {
    const game = { gameKey: FIXTURE_GAME_KEY, tipoffUtc: FIXTURE_TIPOFF };
    expect(() => parseSlate({ season: "2026-27", games: [game, game] })).toThrow(/twice/);
    expect(() => parseSlate({ season: "2026-27", games: [] })).toThrow();
    expect(() => parseSlate({ season: "2025-26", games: [game] })).toThrow();
  });
});

describe("projections (baseline v0, unchanged)", () => {
  const inputs = build();

  it("projects a constant 30-minute, 15/6/3 player to exactly 30 minutes and 15 PTS, 6 REB, 3 AST", () => {
    for (const name of ["Demo Player BOS 3", "Demo Player NYK 3"]) {
      expect(projectionFor(inputs, name, "pts")?.value).toBeCloseTo(15, 9);
      expect(projectionFor(inputs, name, "reb")?.value).toBeCloseTo(6, 9);
      expect(projectionFor(inputs, name, "ast")?.value).toBeCloseTo(3, 9);
      expect(projectionFor(inputs, name, "pts")?.minutes).toBeCloseTo(30, 9);
    }
  });

  it("is minutes x per-minute rate: PTS / minutes is the player's own rate when the history is constant", () => {
    const p = projectionFor(inputs, "Demo Player BOS 5", "pts");
    expect((p?.value ?? 0) / (p?.minutes ?? 1)).toBeCloseTo(13 / 26, 9);
  });

  it("projects the whole slate: 3 markets for each of the 16 players on the two teams", () => {
    expect(inputs.report.projections).toMatchObject({ playersConsidered: 16, playersProjected: 16, propsProduced: 48 });
    expect(inputs.projections).toHaveLength(48);
    for (const p of inputs.projections) {
      expect(p).toMatchObject({ gameKey: FIXTURE_GAME_KEY, tipoffUtc: FIXTURE_TIPOFF, modelVersion: "nba-props-baseline-v0", inputSourceIds: ["balldontlie"], inputCutoffUtc: "2026-10-23T12:00:00Z" });
    }
  });

  it("weights recent minutes: two short recent games pull expected minutes below the season average, by the documented blend", () => {
    const rows = fixtureRows().map((r) => (r.playerId === "BOS-1" && r.season === "2026-27" ? { ...r, minutes: 15 } : r));
    // L5 = (2x15 + 3x34)/5 = 26.4, L10 = 30.2, L20 (14 games) = 438/14, season to date = 15; weights .4/.3/.2/.1.
    // blend = 27.3771; prior = 34 (2025-26 average); n = 14, K = 2: (14 x 27.3771 + 2 x 34) / 16 = 28.205.
    expect(projectionFor(build({ rows }), "Demo Player BOS 1", "pts")?.minutes).toBeCloseTo(28.205, 3);
  });

  it("early in 2026-27 the 2025-26 baseline carries the projection: with no 2026-27 games at all it still projects", () => {
    const rows = fixtureRows().filter((r) => r.season === "2025-26");
    const early = build({ rows });
    expect(early.report.projections.playersProjected).toBe(16);
    expect(projectionFor(early, "Demo Player BOS 3", "pts")?.value).toBeCloseTo(15, 9);
    expect(early.report.projections.byHistoryTier).not.toHaveProperty("none");
  });

  it("skips a player with no history, with the reason, instead of inventing a number", () => {
    const wide = parseSlate({ season: "2026-27", games: [{ gameKey: FIXTURE_GAME_KEY, tipoffUtc: FIXTURE_TIPOFF }, { gameKey: "2026-10-24|DEN@LAL", tipoffUtc: "2026-10-25T01:30:00Z" }] });
    const r = build({ slateGames: wide });
    expect(r.report.projections.skipped).toEqual([{ player: "Demo Rookie DEN 9", team: "DEN", reason: "no game history in the import, so no minutes or rate to project from" }]);
    expect(r.projections.some((p) => p.playerName === "Demo Rookie DEN 9")).toBe(false);
    expect(r.report.projections.playersProjected).toBe(32);
  });

  it("uses no game on or after the slate date, and does use an earlier one (control)", () => {
    const extra = (gameId: string, gameDate: string) => [
      { season: "2026-27", seasonType: "regular", gameId, gameDate, team: "BOS", opponent: "NYK", isHome: true, playerId: "BOS-3", playerName: "Demo Player BOS 3", minutes: 5, pts: 99, reb: 0, ast: 0 },
      { season: "2026-27", seasonType: "regular", gameId, gameDate, team: "NYK", opponent: "BOS", isHome: false, playerId: "NYK-1", playerName: "Demo Player NYK 1", minutes: 5, pts: 0, reb: 0, ast: 0 },
    ];
    // An import retrieved after the slate day can contain games on and after it; none may feed the projection.
    const later = { retrievedAtUtc: "2026-11-05T00:00:00Z", generatedAtUtc: "2026-11-06T00:00:00Z" };
    const onAndAfter = fixtureRows().concat(extra("slate-day", "2026-10-24"), extra("later", "2026-10-30"));
    expect(projectionFor(build({ rows: onAndAfter, ...later }), "Demo Player BOS 3", "pts")?.value).toBeCloseTo(15, 9);
    const before = fixtureRows().concat(extra("day-before", "2026-10-23"));
    expect(projectionFor(build({ rows: before }), "Demo Player BOS 3", "pts")?.value).not.toBeCloseTo(15, 3);
  });

  it("leaves out players marked out, and does not depend on DvP or position files at all", () => {
    const base = build().projections.map((p) => [p.playerName, p.market, p.value]);
    const withoutHistoricalPositions = buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: imported(), positions: buildEstimateSet([fixturePositionsFile("2026-27")]), slate: slate() });
    expect(withoutHistoricalPositions.projections.map((p) => [p.playerName, p.market, p.value])).toEqual(base);
    const withOut = fixturePositionsFile("2026-27") as { players: Array<{ playerId: string; role: string }> };
    const players = withOut.players.map((p) => (p.playerId === "BOS-1" ? { ...p, role: "out" } : p));
    const r = buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: imported(), positions: buildEstimateSet([{ ...withOut, players }]), slate: slate() });
    expect(r.projections.some((p) => p.playerName === "Demo Player BOS 1")).toBe(false);
    expect(r.roster).not.toHaveProperty("demo player bos 1");
  });

  it("refuses an import retrieved after the build", () => {
    expect(() => buildV1Inputs({ generatedAtUtc: "2026-10-22T00:00:00Z", imported: imported(), positions: positions(), slate: slate() })).toThrow(/after the build time/);
  });

  it("builds league priors from competitive minutes before the first slate date only", () => {
    expect(leagueRates([], "2026-10-24")).toBeNull();
    const rates = leagueRates(imported().rows, "2026-10-24");
    expect(rates?.leagueRate.pts).toBeGreaterThan(0.4);
    expect(rates?.leagueRate.pts).toBeLessThan(0.7);
  });
});

describe("roster", () => {
  it("maps each 2026-27 player to a team and the primary position, estimated", () => {
    const { roster } = build();
    expect(roster["demo player bos 1"]).toEqual({ team: "BOS", position: "PG" });
    expect(roster["demo player nyk 5"]).toEqual({ team: "NYK", position: "C" });
  });

  it("drops two players who share a name and warns, because a prop line could not be matched to either", () => {
    const file = fixturePositionsFile("2026-27") as { players: Array<Record<string, unknown>> };
    const dup = { ...file.players[0], playerId: "dup-1", team: "ATL" };
    const r = buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: imported(), positions: buildEstimateSet([{ ...file, players: [...file.players, dup] }]), slate: slate() });
    expect(r.roster).not.toHaveProperty(["demo player atl 1"]);
    expect(r.report.warnings.some((w) => /share the name/.test(w))).toBe(true);
  });
});

describe("approximate DvP inputs (estimated primary position)", () => {
  const r = build({ without25: ["MIA-8"] });
  const dvp = r.dvp;

  it("gives every regular-season player-game its season's primary position as a single-code label", () => {
    expect(dvp?.sourceId).toBe("balldontlie");
    const line = dvp?.lines.find((l) => l.playerId === "BOS-1" && l.season === "2026-27");
    expect(line).toMatchObject({ positionLabel: "PG", opponentTeam: expect.stringMatching(/^[A-Z]{3}$/), sourceId: "balldontlie" });
    expect(dvp?.lines.filter((l) => l.playerId === "BOS-5").every((l) => l.positionLabel === "C")).toBe(true);
  });

  it("never applies a 2026-27 position to a 2025-26 game", () => {
    const miaLines = dvp?.lines.filter((l) => l.playerId === "MIA-8") ?? [];
    expect(miaLines.filter((l) => l.season === "2025-26").every((l) => l.positionLabel === null)).toBe(true);
    expect(miaLines.filter((l) => l.season === "2026-27").every((l) => l.positionLabel === "C")).toBe(true);
  });

  it("reports missing-position and minutes coverage per season", () => {
    expect(r.report.dvp.linesWithoutPosition).toEqual({ "2025-26": 12 });
    expect(r.report.dvp.playersWithoutPosition).toEqual({ "2025-26": ["MIA-8"] });
    // 12 games x 10 minutes unattributed, out of 12 rounds x 30 team-games x 192 minutes.
    expect(r.report.dvp.minutesCoverage["2025-26"]).toBeCloseTo(1 - 120 / (12 * 30 * 192), 9);
    expect(r.report.dvp.minutesCoverage["2026-27"]).toBe(1);
    expect(r.report.warnings.some((w) => /12 regular-season player-games have no position estimate/.test(w))).toBe(true);
  });

  it("uses regular-season games only and counts what it left out", () => {
    const pre = (team: string, opponent: string, isHome: boolean, slot: number) => ({ season: "2026-27", seasonType: "preseason", gameId: "pre-1", gameDate: "2026-10-10", team, opponent, isHome, playerId: `${team}-${slot}`, playerName: `Demo Player ${team} ${slot}`, minutes: 20, pts: 99, reb: 9, ast: 9 });
    const rows = fixtureRows().concat(pre("ATL", "MIL", true, 1), pre("MIL", "ATL", false, 1));
    const withPreseason = build({ rows });
    expect(withPreseason.report.dvp.excludedNonRegularSeason).toBe(2);
    expect(withPreseason.dvp?.lines.some((l) => l.gameId === "pre-1")).toBe(false);
  });

  it("yields no DvP input, not an error, when there is no regular-season data", () => {
    const rows = fixtureRows().filter((x) => x.season === "2025-26").map((x) => ({ ...x, seasonType: "preseason" }));
    const inputs = buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: imported(rows), positions: positions(), slate: slate() });
    expect(inputs.dvp).toBeNull();
  });
});

describe("no invented DvP ranks or props", () => {
  const licenses: Record<NbaSourceId, SourceLicense> = { ...SOURCE_LICENSES, balldontlie: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "test agreement", reviewedOn: "2026-10-23" } };

  it("leaves a season with no position estimates out of DvP instead of ranking rows of zeros by team code", () => {
    const only26 = buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: imported(), positions: buildEstimateSet([fixturePositionsFile("2026-27")]), slate: slate() });
    expect(only26.report.dvp.teamSeasonsWithoutAnyPosition).toHaveLength(30);
    expect(only26.report.dvp.teamSeasonsWithoutAnyPosition.every((g) => g.startsWith("2025-26|"))).toBe(true);
    expect(only26.dvp?.lines.every((l) => l.season === "2026-27")).toBe(true);
    expect(only26.report.warnings.some((w) => /30 team-season\(s\) have no position estimate for any opposing player/.test(w))).toBe(true);
    const { artifact } = assembleBoard({ generatedAtUtc: FIXTURE_BUILD_AT, snapshots: [], projections: only26.projections, roster: only26.roster, dvp: only26.dvp, sourceLicenses: licenses });
    expect(artifact.dvpRows.some((r) => r.season === "2025-26")).toBe(false);
    expect(artifact.dvpRows.some((r) => r.allowedPerGame === 0 && r.minutesCoverage === 0)).toBe(false);
    expect(artifact.dvpRows.filter((r) => r.season === "2026-27")).toHaveLength(450);
  });

  it("drops only the team-season that has nothing attributed, so no rank is invented for the others", () => {
    const missing = ["ATL-1", "ATL-2", "ATL-3", "ATL-4", "ATL-5", "ATL-6", "ATL-7", "ATL-8"];
    const r = build({ without25: missing });
    expect(r.report.dvp.teamSeasonsWithoutAnyPosition).toEqual([]);
    // ATL's own players have no 2025-26 position, but ATL as a DEFENSE is judged by its opponents, who all have positions.
    expect(r.dvp?.lines.filter((l) => l.season === "2025-26" && l.opponentTeam === "ATL" && l.positionLabel !== null).length).toBeGreaterThan(0);
  });

  it("skips both players who share a name in one game, with the reason, instead of letting one replace the other", () => {
    const file = fixturePositionsFile("2026-27") as { players: Array<{ playerId: string; name: string }> };
    const players = file.players.map((p) => (p.playerId === "NYK-1" ? { ...p, name: "Demo Player BOS 1" } : p));
    const r = buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: imported(), positions: buildEstimateSet([{ ...file, players }]), slate: slate() });
    expect(r.report.projections.skipped.map((s) => [s.player, s.team]).sort()).toEqual([["Demo Player BOS 1", "BOS"], ["Demo Player BOS 1", "NYK"]]);
    expect(r.report.projections.skipped.every((s) => /shares a name with another player in this game/.test(s.reason))).toBe(true);
    expect(r.projections.some((p) => p.playerName === "Demo Player BOS 1")).toBe(false);
    expect(r.report.projections.playersProjected).toBe(14);
    expect(r.report.warnings.some((w) => /share the name/.test(w))).toBe(true);
  });

  it("rejects a slate with one team in two games on the same day", () => {
    const games = [{ gameKey: FIXTURE_GAME_KEY, tipoffUtc: FIXTURE_TIPOFF }, { gameKey: "2026-10-24|BOS@MIA", tipoffUtc: "2026-10-25T00:00:00Z" }];
    expect(() => parseSlate({ season: "2026-27", games })).toThrow("slate has BOS in two games on 2026-10-24");
  });

  it("keeps a player named __proto__ as data, never as a prototype write", () => {
    const file = fixturePositionsFile("2026-27") as { players: Array<{ playerId: string; name: string }> };
    const players = file.players.map((p) => (p.playerId === "BOS-1" ? { ...p, name: "__proto__" } : p));
    const r = buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: imported(), positions: buildEstimateSet([{ ...file, players }]), slate: slate() });
    expect(Object.keys(r.roster)).toContain("__proto__");
    expect(Object.getPrototypeOf(r.roster)).toBe(Object.prototype);
    expect(({} as { team?: string }).team).toBeUndefined();
  });

  it("refuses an import or build time that is not a real instant", () => {
    const bad = { ...imported(), retrievedAtUtc: "2026-99-99T99:99:99Z" };
    expect(() => buildV1Inputs({ generatedAtUtc: FIXTURE_BUILD_AT, imported: bad, positions: positions(), slate: slate() })).toThrow(/real instants/);
  });
});

describe("a missing DvP input never hides a projection", () => {
  it("still shows every projection on the board when DvP is absent", () => {
    const licenses: Record<NbaSourceId, SourceLicense> = { ...SOURCE_LICENSES, balldontlie: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "test agreement", reviewedOn: "2026-10-23" } };
    const inputs = build();
    const { artifact, report } = assembleBoard({ generatedAtUtc: FIXTURE_BUILD_AT, snapshots: [], projections: inputs.projections, roster: inputs.roster, dvp: null, sourceLicenses: licenses });
    expect(report.dvp.status).toBe("absent");
    expect(artifact.entries).toHaveLength(48);
    expect(artifact.entries.every((e) => e.projection !== null && e.line === null && e.positionLabel !== null)).toBe(true);
    expect(artifact.dvpRows).toEqual([]);
  });
});
