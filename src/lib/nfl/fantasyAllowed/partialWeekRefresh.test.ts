import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildFantasyAllowedRows } from "./buildRows";
import { makeHistoricalPlayerWeek } from "./__fixtures__/historicalPlayerWeek";
import type { FantasyAllowedArtifact } from "./types";
import { classifyPlayerWeekCoverage } from "../../../../scripts/lib/nfl-allowed-by-position-coverage.mjs";
import { validateFantasyAllowedArtifact } from "../../../../scripts/lib/nfl-fantasy-allowed-coverage.mjs";

// Partial-week refresh regressions: the Fantasy Points Allowed artifact is a
// full deterministic rebuild from the player-week cache, so every FINAL game
// the cache holds is incorporated immediately, an unplayed game never blocks
// the rest, and reruns never double count.

const SEASON = 2026;
const TEAMS = Array.from({ length: 32 }, (_, i) => `t${String(i).padStart(2, "0")}`);
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const PAIRS = Array.from({ length: 16 }, (_, g) => [TEAMS[2 * g], TEAMS[2 * g + 1]] as const);
// Week 3's last game (t30 vs t31) is the one still unplayed (e.g. MNF).
const LATE_GAME = PAIRS[15];

const gameId = (season: number, week: number, [home, away]: readonly [string, string]) => `${season}_${String(week).padStart(2, "0")}_${away}_${home}`;

function gameRows(season: number, week: number, [home, away]: readonly [string, string]): HistoricalPlayerWeek[] {
  return [[home, away], [away, home]].flatMap(([team, opponent]) =>
    POSITIONS.map((position, index) => makeHistoricalPlayerWeek({
      season, week, team, opponent, position, playerId: `${season}-${week}-${team}-${position}`,
      actualFantasyPoints: 10 + week + index,
    })));
}

function weekRows(season: number, week: number, pairs: readonly (readonly [string, string])[]): HistoricalPlayerWeek[] {
  return pairs.flatMap((pair) => gameRows(season, week, pair));
}

const PRIOR_SEASON_ROWS = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((week) => weekRows(SEASON - 1, week, PAIRS));
const FIFTEEN_FINAL_ROWS = [
  ...PRIOR_SEASON_ROWS,
  ...weekRows(SEASON, 1, PAIRS),
  ...weekRows(SEASON, 2, PAIRS),
  ...weekRows(SEASON, 3, PAIRS.slice(0, 15)),
];
const SIXTEEN_FINAL_ROWS = [...FIFTEEN_FINAL_ROWS, ...gameRows(SEASON, 3, LATE_GAME)];

const SCHEDULE = [1, 2, 3].flatMap((week) => PAIRS.map((pair) => ({
  gameId: gameId(SEASON, week, pair), week, seasonType: "REG", homeAbbr: pair[0], awayAbbr: pair[1],
})));
const results = (lateGameFinal: boolean) => SCHEDULE
  .filter((game) => lateGameFinal || game.gameId !== gameId(SEASON, 3, LATE_GAME))
  .map((game) => ({ ...game, final: true }));

function build(historicalRows: readonly HistoricalPlayerWeek[]): FantasyAllowedArtifact {
  return {
    schemaVersion: "nfl-fantasy-points-allowed-v2",
    generatedAt: "2026-09-28T12:00:00.000Z",
    season: SEASON,
    week: 3,
    scoringVersion: "test",
    rows: buildFantasyAllowedRows({ historicalRows, teams: TEAMS, currentSeason: SEASON, priorSeason: SEASON - 1, opponents: new Map() }),
  };
}

const currentRows = (rows: readonly HistoricalPlayerWeek[]) => rows.filter((row) => row.season === SEASON);
const row = (artifact: FantasyAllowedArtifact, team: string) => artifact.rows.find((r) => r.team === team)!;
const validate = (artifact: FantasyAllowedArtifact, playerWeekRows: readonly HistoricalPlayerWeek[]) =>
  validateFantasyAllowedArtifact(artifact, { playerWeekRows, teams: TEAMS, season: SEASON });

describe("Fantasy Points Allowed partial-week refresh", () => {
  it("A: 15 FINAL games + 1 unplayed game still publishes the 15 completed games", () => {
    const coverage = classifyPlayerWeekCoverage({ season: SEASON, results: results(false), games: SCHEDULE, playerWeekRows: currentRows(FIFTEEN_FINAL_ROWS) });
    expect(coverage.errors).toEqual([]);
    expect(coverage.warnings).toEqual([]);
    expect(coverage.summary.cacheGamesByWeek).toEqual({ 1: 16, 2: 16, 3: 15 });

    const artifact = build(FIFTEEN_FINAL_ROWS);
    expect(validate(artifact, FIFTEEN_FINAL_ROWS)).toEqual([]);
    expect(row(artifact, "t00").samples["2026"].qb?.gamesSampled).toBe(3);
    expect(row(artifact, "t29").samples["2026"].te?.gamesSampled).toBe(3);
    for (const team of LATE_GAME) {
      expect(row(artifact, team).samples["2026"].qb?.gamesSampled).toBe(2);
      // Rolling windows reach back into 2025 to fill the missing game.
      expect(row(artifact, team).samples.last5.qb?.gamesSampled).toBe(5);
    }
    expect(row(artifact, "t00").samples.last8.wr?.gamesSampled).toBe(8);
  });

  it("A: a FINAL game nflverse has not published yet is a warning, not a publish blocker", () => {
    const coverage = classifyPlayerWeekCoverage({ season: SEASON, results: results(true), games: SCHEDULE, playerWeekRows: currentRows(FIFTEEN_FINAL_ROWS) });
    expect(coverage.errors).toEqual([]);
    expect(coverage.summary.missingFinalGameIds).toEqual([gameId(SEASON, 3, LATE_GAME)]);
    expect(coverage.warnings[0]).toMatch(/upstream lag/);
    expect(validate(build(FIFTEEN_FINAL_ROWS), FIFTEEN_FINAL_ROWS)).toEqual([]);
  });

  it("B: rerunning against the same source does not double count", () => {
    const first = build(FIFTEEN_FINAL_ROWS);
    const second = build(FIFTEEN_FINAL_ROWS);
    expect(second).toEqual(first);
    // t00 allowed 10+w QB points in each of weeks 1-3.
    expect(row(second, "t00").samples["2026"].qb).toMatchObject({ gamesSampled: 3, fantasyPointsAllowedTotal: 11 + 12 + 13 });
  });

  it("B: a double-counted (inflated) artifact fails validation against the cache", () => {
    const artifact = build(FIFTEEN_FINAL_ROWS);
    const t00 = row(artifact, "t00");
    const inflated: FantasyAllowedArtifact = {
      ...artifact,
      rows: artifact.rows.map((r) => r !== t00 ? r : {
        ...r, samples: { ...r.samples, 2026: { ...r.samples["2026"], qb: { ...r.samples["2026"].qb!, gamesSampled: 6 } } },
      }),
    };
    expect(validate(inflated, FIFTEEN_FINAL_ROWS).join("\n")).toMatch(/2026\/qb t00: 6 games sampled, player-week cache has 3/);
  });

  it("C: when the 16th game's stats appear, the rebuild goes from 15-game to 16-game coverage", () => {
    const before = build(FIFTEEN_FINAL_ROWS);
    const after = build(SIXTEEN_FINAL_ROWS);
    const coverage = classifyPlayerWeekCoverage({ season: SEASON, results: results(true), games: SCHEDULE, playerWeekRows: currentRows(SIXTEEN_FINAL_ROWS) });
    expect(coverage.summary.cacheGamesByWeek).toEqual({ 1: 16, 2: 16, 3: 16 });
    expect(coverage.warnings).toEqual([]);

    expect(validate(after, SIXTEEN_FINAL_ROWS)).toEqual([]);
    for (const team of LATE_GAME) {
      expect(row(before, team).samples["2026"].qb?.gamesSampled).toBe(2);
      expect(row(after, team).samples["2026"].qb?.gamesSampled).toBe(3);
    }
    expect(after.rows.every((r) => r.samples["2026"].qb?.gamesSampled === 3)).toBe(true);
    // Teams whose games were already included keep identical totals (no double
    // count); only their ranks may move as the late-game teams' samples change.
    const totals = (a: FantasyAllowedArtifact) => {
      const qb = row(a, "t00").samples["2026"].qb!;
      return [qb.gamesSampled, qb.fantasyPointsAllowedTotal];
    };
    expect(totals(after)).toEqual(totals(before));
    // The stale 15-game artifact can no longer pass against the refreshed cache.
    expect(validate(before, SIXTEEN_FINAL_ROWS).length).toBeGreaterThan(0);
  });

  it("rejects structurally impossible artifacts", () => {
    const artifact = build(SIXTEEN_FINAL_ROWS);
    expect(validate({ ...artifact, rows: artifact.rows.slice(1) }, SIXTEEN_FINAL_ROWS)[0]).toMatch(/expected 32 team rows/);
    expect(validate({ ...artifact, rows: [...artifact.rows.slice(1), artifact.rows[1]] }, SIXTEEN_FINAL_ROWS).join("\n")).toMatch(/duplicate team rows/);
  });
});
