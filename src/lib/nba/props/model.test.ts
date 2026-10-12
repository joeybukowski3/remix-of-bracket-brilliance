import { describe, expect, it } from "vitest";
import {
  buildTargets,
  errorStats,
  estimatePriors,
  evaluate,
  roleTier,
  toOutcome,
  toPredictionSnapshot,
  tuneParams,
  type BacktestPeriod,
} from "./backtest";
import { buildTeamGameDates, computePregameFeatures, type PregameTarget } from "./features";
import { DEFAULT_BASELINE_PARAMS, projectBaseline, projectMinutes, projectNaive, projectRate, type BaselinePriors } from "./projection";
import { playerGame, teamGame, TEAM_A, TEAM_B, TEAM_C } from "./__fixtures__/synthetic";
import type { NbaPlayerGame } from "./types";

const PRIORS: BaselinePriors = { leagueRate: { pts: 0.5, reb: 0.2, ast: 0.1 } };
const NO_TEAM_DATES = new Map<number, string[]>();

/** n consecutive daily regular-season games starting 2024-11-01. */
function series(n: number, overrides: (i: number) => Partial<NbaPlayerGame> = () => ({})): NbaPlayerGame[] {
  return Array.from({ length: n }, (_, i) => {
    const day = new Date(Date.UTC(2024, 10, 1 + i)).toISOString().slice(0, 10);
    return playerGame({ gameId: `00224${String(i + 1).padStart(5, "0")}`, gameDate: day, ...overrides(i) });
  });
}

function target(row: NbaPlayerGame): PregameTarget {
  return { gameId: row.gameId, cutoffDate: row.gameDate, season: row.season, teamId: row.teamId };
}

describe("computePregameFeatures leakage contract", () => {
  const history = series(30, (i) => ({ minutes: 10 + i, pts: i }));
  const targetRow = history[20];

  it("uses only games dated strictly before the cutoff", () => {
    const features = computePregameFeatures(history, target(targetRow), NO_TEAM_DATES);
    expect(features.priorGames).toBe(20);
    // L5 = games 15..19 -> minutes 25..29
    expect(features.last[5]?.totals.minutes).toBe(25 + 26 + 27 + 28 + 29);
  });

  it("is unchanged when the target game and every later game are altered or removed", () => {
    const baseline = computePregameFeatures(history, target(targetRow), NO_TEAM_DATES);
    const tampered = history.map((row, i) => (i >= 20 ? { ...row, minutes: 99, pts: 99 } : row));
    expect(computePregameFeatures(tampered, target(targetRow), NO_TEAM_DATES)).toEqual(baseline);
    expect(computePregameFeatures(history.slice(0, 20), target(targetRow), NO_TEAM_DATES)).toEqual(baseline);
  });

  it("excludes another row on the cutoff date even with a different game id", () => {
    const sameDay = playerGame({ gameId: "0022499999", gameDate: targetRow.gameDate, minutes: 99 });
    const features = computePregameFeatures([...history.slice(0, 20), sameDay], target(targetRow), NO_TEAM_DATES);
    expect(features.priorGames).toBe(20);
  });

  it("excludes preseason games from history", () => {
    const preseason = playerGame({ gameId: "0012400001", gameDate: "2024-10-10", seasonType: "preseason", minutes: 5 });
    const features = computePregameFeatures([preseason, ...history.slice(0, 3)], target(history[3]), NO_TEAM_DATES);
    expect(features.priorGames).toBe(3);
  });

  it("separates season-to-date from cross-season windows and finds the previous regular season", () => {
    const lastSeason = series(12, (i) => ({ season: "2023-24", gameId: `00223${String(i + 1).padStart(5, "0")}`, gameDate: `2024-03-${String(i + 1).padStart(2, "0")}`, minutes: 20 }));
    const thisSeason = series(3, () => ({ minutes: 35 }));
    const t = playerGame({ gameId: "0022400099", gameDate: "2024-12-01" });
    const features = computePregameFeatures([...lastSeason, ...thisSeason], target(t), NO_TEAM_DATES);
    expect(features.seasonPriorGames).toBe(3);
    expect(features.last[10]?.games).toBe(10);
    expect(features.last[10]?.totals.minutes).toBe(3 * 35 + 7 * 20);
    expect(features.previousRegularSeason?.games).toBe(12);
  });

  it("counts team games missed since the last appearance and flags the absence", () => {
    const rows = series(5);
    const teamDates = buildTeamGameDates([...rows, ...series(5, (i) => ({ gameDate: `2024-11-${String(10 + i).padStart(2, "0")}` }))].map((row) => ({ ...row })));
    const t = playerGame({ gameId: "0022400050", gameDate: "2024-11-20" });
    const features = computePregameFeatures(rows, target(t), teamDates);
    expect(features.teamGamesMissed).toBe(5);
    expect(features.returningFromAbsence).toBe(true);
    expect(features.daysSinceLastGame).toBe(15);
  });

  it("does not treat an offseason or previous-postseason gap as an absence", () => {
    const lastSeason = playerGame({ season: "2023-24", gameId: "0022300080", gameDate: "2024-04-10" });
    const teamDates = buildTeamGameDates([
      lastSeason,
      ...["2024-04-21", "2024-04-23", "2024-04-25", "2024-04-27"].map((gameDate, i) =>
        playerGame({ season: "2023-24", seasonType: "playoffs", gameId: `004230010${i}`, gameDate })),
    ]);
    const opener = playerGame({ gameId: "0022400001", gameDate: "2024-10-22" });
    const features = computePregameFeatures([lastSeason], target(opener), teamDates);
    expect(features.teamGamesMissed).toBeNull();
    expect(features.returningFromAbsence).toBe(false);
  });

  it("tracks the current team stint and recent team changes", () => {
    const before = series(15, () => ({ teamId: TEAM_A, minutes: 10 }));
    const after = series(4, (i) => ({ teamId: TEAM_C, minutes: 30, gameId: `00224${String(100 + i).padStart(5, "0")}`, gameDate: `2024-12-0${i + 1}` }));
    const t = playerGame({ gameId: "0022400200", gameDate: "2024-12-10", teamId: TEAM_C });
    const features = computePregameFeatures([...before, ...after], target(t), NO_TEAM_DATES);
    expect(features.teamChanged).toBe(false);
    expect(features.teamChangedRecently).toBe(true);
    expect(features.currentTeamStintGames).toBe(4);
    expect(features.teamGamesMissed).toBe(0);
    const firstGame = computePregameFeatures(before, target(t), NO_TEAM_DATES);
    expect(firstGame.teamChanged).toBe(true);
    expect(firstGame.teamGamesMissed).toBeNull();
  });

  it("flags a role change when L5 minutes diverge from L20", () => {
    const rows = series(20, (i) => ({ minutes: i < 15 ? 12 : 34 }));
    const t = playerGame({ gameId: "0022400300", gameDate: "2024-12-30" });
    expect(computePregameFeatures(rows, target(t), NO_TEAM_DATES).roleChange).toBe(true);
  });
});

describe("projection baseline", () => {
  const t = playerGame({ gameId: "0022400300", gameDate: "2024-12-30" });

  it("falls back to priors with no history, and naive methods are undefined", () => {
    const features = computePregameFeatures([], target(t), NO_TEAM_DATES);
    expect(features.historyTier).toBe("none");
    const projection = projectBaseline(features, PRIORS, DEFAULT_BASELINE_PARAMS);
    expect(projection.minutes).toBe(DEFAULT_BASELINE_PARAMS.newPlayerMinutes);
    expect(projection.pts).toBeCloseTo(DEFAULT_BASELINE_PARAMS.newPlayerMinutes * 0.5);
    expect(projectNaive(features).naive_l10).toEqual({ minutes: null, pts: null, reb: null, ast: null });
  });

  it("returns the blend unchanged for constant minutes when shrinkage is off", () => {
    const features = computePregameFeatures(series(25, () => ({ minutes: 30 })), target(t), NO_TEAM_DATES);
    expect(projectMinutes(features, { ...DEFAULT_BASELINE_PARAMS, minutesShrinkGames: 0 })).toBeCloseTo(30);
  });

  it("shrinks minutes toward the prior by K games", () => {
    const features = computePregameFeatures(series(4, () => ({ minutes: 30 })), target(t), NO_TEAM_DATES);
    const params = { ...DEFAULT_BASELINE_PARAMS, minutesShrinkGames: 4, newPlayerMinutes: 10 };
    expect(projectMinutes(features, params)).toBeCloseTo((4 * 30 + 4 * 10) / 8);
  });

  it("shrinks per-minute rates toward the league prior by K minutes", () => {
    const features = computePregameFeatures(series(5, () => ({ minutes: 20, pts: 20 })), target(t), NO_TEAM_DATES);
    const params = { ...DEFAULT_BASELINE_PARAMS, rateShrinkMinutes: { pts: 100, reb: 0, ast: 0 } };
    expect(projectRate(features, "pts", PRIORS, params)).toBeCloseTo((100 + 100 * 0.5) / (100 + 100));
  });

  it("uses only new-team games for minutes once the stint is long enough", () => {
    const before = series(15, () => ({ teamId: TEAM_A, minutes: 10 }));
    const after = series(4, (i) => ({ teamId: TEAM_C, minutes: 30, gameId: `00224${String(100 + i).padStart(5, "0")}`, gameDate: `2024-12-0${i + 1}` }));
    const traded = playerGame({ gameId: "0022400200", gameDate: "2024-12-10", teamId: TEAM_C });
    const features = computePregameFeatures([...before, ...after], target(traded), NO_TEAM_DATES);
    const params = { ...DEFAULT_BASELINE_PARAMS, minutesShrinkGames: 0, minutesWeights: { l5: 1, l10: 0, l20: 0, seasonToDate: 0 } };
    expect(projectMinutes(features, params)).toBeCloseTo(30);
  });
});

describe("backtest", () => {
  const period: BacktestPeriod = { name: "p", seasons: ["2024-25"], seasonTypes: ["regular"] };
  const rows = [
    ...series(12, (i) => ({ playerId: 1, minutes: 30 + (i % 3), pts: 15 + (i % 5) })),
    ...series(12, (i) => ({ playerId: 2, teamId: TEAM_B, minutes: 12 + (i % 4), pts: 4 + (i % 3) })),
  ];
  const teamGames = rows.map((row) => teamGame({ gameId: row.gameId, gameDate: row.gameDate, teamId: row.teamId }));

  it("builds prediction snapshots that carry no outcome values", () => {
    const targets = buildTargets(rows, teamGames, period);
    expect(targets).toHaveLength(24);
    const snapshot = toPredictionSnapshot(targets[5], PRIORS, DEFAULT_BASELINE_PARAMS);
    // Changing the target's own result must not change its prediction.
    const altered = rows.map((row, i) => (i === 5 ? { ...row, minutes: 48, pts: 60, reb: 25, ast: 20 } : row));
    const alteredSnapshot = toPredictionSnapshot(buildTargets(altered, teamGames, period)[5], PRIORS, DEFAULT_BASELINE_PARAMS);
    expect(alteredSnapshot).toEqual(snapshot);
    expect(Object.keys(snapshot).sort()).toEqual(
      ["cutoffDate", "flags", "gameId", "modelVersion", "playerId", "priorGames", "projections", "schemaVersion", "season", "seasonType", "teamId"].sort(),
    );
    expect(Object.keys(snapshot.projections).sort()).toEqual(["model", "naive_l10", "naive_l20", "naive_l5", "naive_season_to_date"]);
  });

  it("computes MAE, RMSE and bias", () => {
    expect(errorStats([[3, 1], [1, 2]])).toEqual({ n: 2, mae: 1.5, rmse: Math.sqrt(2.5), bias: 0.5 });
    expect(errorStats([])).toEqual({ n: 0, mae: null, rmse: null, bias: null });
    expect(roleTier(14.9)).toBe("bench");
    expect(roleTier(15)).toBe("rotation");
    expect(roleTier(28)).toBe("core");
  });

  it("evaluates methods on all-defined and common samples and reports missing rates", () => {
    const targets = buildTargets(rows, teamGames, period);
    const snapshots = targets.map((t) => toPredictionSnapshot(t, PRIORS, DEFAULT_BASELINE_PARAMS));
    const evaluation = evaluate(snapshots, targets.map((t) => toOutcome(t.row)), ["model"]);
    expect(evaluation.targets).toBe(24);
    expect(evaluation.missingRate.model).toBe(0);
    expect(evaluation.missingRate.naive_l10).toBeCloseTo(2 / 24); // each player's first game
    expect(evaluation.commonSample.n).toBe(22);
    expect(evaluation.byMethod.model.minutes.n).toBe(24);
    expect(Object.keys(evaluation.segments)).toEqual(["role", "historyTier", "teamChangedRecently", "returningFromAbsence", "roleChange"]);
  });

  it("refuses to evaluate snapshots without outcomes", () => {
    const targets = buildTargets(rows, teamGames, period);
    const snapshots = targets.map((t) => toPredictionSnapshot(t, PRIORS, DEFAULT_BASELINE_PARAMS));
    expect(() => evaluate(snapshots, [], ["model"])).toThrow(/no outcome record/);
  });

  it("estimates league rates from the training period only", () => {
    const priors = estimatePriors(rows, period);
    const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
    expect(priors.leagueRate.pts).toBeCloseTo(rows.reduce((sum, row) => sum + row.pts, 0) / minutes);
    expect(() => estimatePriors(rows, { ...period, seasons: ["2030-31"] })).toThrow(/no minutes/);
  });

  it("tunes parameters from the grid on the supplied targets", () => {
    const targets = buildTargets(rows, teamGames, period);
    const grid = { minutesShrinkGames: [0, 4], newPlayerMinutes: [10, 20], rateShrinkMinutes: [0, 100] };
    const { params, trials } = tuneParams(targets, PRIORS, DEFAULT_BASELINE_PARAMS, grid);
    expect(trials).toHaveLength(4 + 3 * 2);
    expect(grid.minutesShrinkGames).toContain(params.minutesShrinkGames);
    expect(grid.rateShrinkMinutes).toContain(params.rateShrinkMinutes.pts);
    expect(() => tuneParams([], PRIORS, DEFAULT_BASELINE_PARAMS, grid)).toThrow(/empty/);
  });
});
