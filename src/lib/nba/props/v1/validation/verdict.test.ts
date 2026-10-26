import { describe, expect, it } from "vitest";
import type { StatProjection } from "../../projection";
import type { BacktestRow } from "../backtest/walkForward";
import type { ChallengerReport, Comparison, Measure } from "./candidateMetrics";
import { earlySeasonCheck, PLAUSIBLE_MAX_MINUTES, verdictFor } from "./verdict";

const diff = (meanDiff: number, ci: [number, number] | null) => ({ n: 1000, clusters: 30, meanDiff, se: 0.01, ci95: ci, clusteredBy: "player" as const, playerClusters: 30, weekClusters: 30 });
const comparison = (d: ReturnType<typeof diff>) => ({ rows: 1000, baselineMae: 5, candidateMae: 5, baselineBias: 0, candidateBias: 0, difference: d });
const comparisons = (per: Partial<Record<Measure, ReturnType<typeof diff>>>): Comparison =>
  Object.fromEntries((["minutes", "pts", "reb", "ast"] as Measure[]).map((m) => [m, comparison(per[m] ?? diff(0, [-0.01, 0.01]))])) as Comparison;
const better = diff(-0.05, [-0.08, -0.02]);

const report = (over: Partial<ChallengerReport> = {}): ChallengerReport => ({
  overall: comparisons({ minutes: better, pts: better }), laterHalf: comparisons({ minutes: better, pts: better }), laterHalfStarts: "2026-02-01", subgroups: {}, materialWorsening: [], ...over,
});

describe("verdictFor: the frozen decision rule", () => {
  it("justifies a targeted change only when all four steps hold", () => {
    const v = verdictFor("A", report());
    expect(v.justifiesTargetedChange).toBe(true);
    expect(v.steps.map((s) => s.holds)).toEqual([true, true, true, true]);
  });

  it("fails step 1 when a primary measure's upper bound is not below zero, or has no interval", () => {
    expect(verdictFor("A", report({ overall: comparisons({ minutes: better, pts: diff(-0.004, [-0.009, 0]) }) })).steps[0].holds).toBe(false);
    expect(verdictFor("A", report({ overall: comparisons({ minutes: better, pts: diff(-0.05, null) }) })).steps[0].holds).toBe(false);
  });

  it("requires every measure of B and AB, not only the ones that improved", () => {
    const only = report({ overall: comparisons({ pts: better }), laterHalf: comparisons({ pts: better }) });
    expect(verdictFor("B", only).steps[0].holds).toBe(false);
    expect(verdictFor("AB", report()).steps[0].holds).toBe(false);
    const all = comparisons({ minutes: better, pts: better, reb: better, ast: better });
    expect(verdictFor("AB", report({ overall: all, laterHalf: all })).justifiesTargetedChange).toBe(true);
  });

  it("fails step 2 when any measure, primary or not, is significantly worse", () => {
    const v = verdictFor("A", report({ overall: comparisons({ minutes: better, pts: better, reb: diff(0.02, [0.005, 0.035]) }) }));
    expect(v.steps[1]).toMatchObject({ holds: false, detail: "reb" });
    expect(v.justifiesTargetedChange).toBe(false);
  });

  it("fails step 3 when a primary measure does not improve in the later half", () => {
    const v = verdictFor("A", report({ laterHalf: comparisons({ minutes: better, pts: diff(0.001, [-0.02, 0.02]) }) }));
    expect(v.steps[2].holds).toBe(false);
    expect(verdictFor("A", report({ laterHalf: comparisons({}) })).steps[2].holds).toBe(false);
  });

  it("fails step 4 on a material subgroup worsening, and names it", () => {
    const v = verdictFor("A", report({ materialWorsening: [{ segmentation: "priorGames", subgroup: "20-39", measure: "reb", rows: 800, meanDiff: 0.2, baselineMae: 1.9 }] }));
    expect(v.steps[3]).toMatchObject({ holds: false });
    expect(v.steps[3].detail).toMatch(/priorGames=20-39 reb \+0\.200 on 800 rows/);
    expect(v.justifiesTargetedChange).toBe(false);
  });
});

describe("earlySeasonCheck", () => {
  const projection = (over: Partial<StatProjection> = {}): StatProjection => ({ minutes: 25, pts: 12, reb: 4, ast: 3, ...over });
  const row = (candidates: Record<string, StatProjection>): BacktestRow => ({
    season: "2026-27", gameDate: "2026-10-22", gameId: "g", playerId: "p", team: "BOS", isHome: true, priorGames: 40, seasonPriorGames: 2, previousSeasonGames: 60, historyTier: "full",
    flags: { teamChangedRecently: false, returningFromAbsence: false, roleChange: false }, teamRestDays: 2, marginAbs: 5, expectedAbsMargin: null, opponentDefense: null,
    predictions: { v0: projection(), naive_l5: projection(), naive_l10: projection(), naive_season_to_date: projection() }, candidates, actual: { minutes: 24, pts: 11, reb: 4, ast: 3 },
  });
  const ids = (p: StatProjection) => ({ baseline: p, A: p, B: p, AB: p });

  it("reports the projection ranges of every candidate and no implausible value for ordinary projections", () => {
    const check = earlySeasonCheck([row(ids(projection())), row(ids(projection({ minutes: 8, pts: 3 })))]);
    expect(check.rows).toBe(2);
    expect(check.ranges.A).toMatchObject({ minutesMin: 8, minutesMax: 25, ptsMin: 3, ptsMax: 12, outsidePlausible: 0 });
  });

  it("counts a projection that is negative, not finite or beyond a plausible box score, whatever its error", () => {
    expect(PLAUSIBLE_MAX_MINUTES).toBe(48);
    const bad = [projection({ minutes: -1 }), projection({ minutes: 52 }), projection({ pts: Number.NaN }), projection({ pts: 80 }), projection({ reb: -2 })];
    for (const p of bad) expect(earlySeasonCheck([row({ ...ids(projection()), A: p })]).ranges.A.outsidePlausible).toBe(1);
    expect(earlySeasonCheck([row({ ...ids(projection()), A: projection({ minutes: 52 }) })]).ranges.baseline.outsidePlausible).toBe(0);
  });
});
