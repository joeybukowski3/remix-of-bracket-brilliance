/**
 * Scoring for the walk-forward backtest: error by method, paired comparisons with cluster-robust intervals, the minutes
 * versus per-minute-rate split of the error, and segment tables. Pure functions over `BacktestRow[]`.
 *
 * Every method is scored on the same rows (those where all methods are defined), so a comparison never favours a
 * method that simply skipped the hard cases. The share of rows left out is reported.
 */
import { errorStats, type ErrorStats } from "../../backtest";
import { roleTier } from "../../role";
import { CLUSTER_BLOCK_DAYS, robustDifference, type RobustDifference } from "./inference";
import { METHODS, STATS, type BacktestRow, type Method, type Stat } from "./walkForward";

export const MEASURES = ["minutes", ...STATS] as const;
export type Measure = (typeof MEASURES)[number];

/** Rows with fewer actual minutes than this are left out of the unweighted per-minute rate error: a cameo rate is noise. */
export const RATE_MIN_MINUTES = 10;
export { CLUSTER_BLOCK_DAYS };
/** A segment with fewer rows than this is flagged: its numbers are shown but should not be read as a finding. */
export const THIN_SEGMENT_ROWS = 100;

const predicted = (row: BacktestRow, method: Method, measure: Measure): number | null => row.predictions[method][measure];

/** Rows where every method has a minutes projection and every stat projection: the common sample. */
export function commonSample(rows: readonly BacktestRow[]): BacktestRow[] {
  return rows.filter((row) => METHODS.every((method) => MEASURES.every((measure) => predicted(row, method, measure) !== null)));
}

export type MethodErrors = Record<Method, Record<Measure, ErrorStats>>;

export function scoreMethods(rows: readonly BacktestRow[]): MethodErrors {
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      Object.fromEntries(
        MEASURES.map((measure) => [measure, errorStats(rows.map((row): [number, number] => [predicted(row, method, measure) as number, row.actual[measure]]))]),
      ),
    ]),
  ) as MethodErrors;
}

/** v0 against each naive baseline: mean of |v0 error| minus |baseline error| (negative favours v0) with a conservative 95% interval (player and week clustering, t critical value). */
export function pairedAgainstBaselines(rows: readonly BacktestRow[]): Record<Measure, Record<string, RobustDifference>> {
  const baselines = METHODS.filter((m) => m !== "v0");
  return Object.fromEntries(
    MEASURES.map((measure) => [
      measure,
      Object.fromEntries(
        baselines.map((baseline) => [
          baseline,
          robustDifference(
            rows.map((row) => ({
              candidate: Math.abs((predicted(row, "v0", measure) as number) - row.actual[measure]),
              benchmark: Math.abs((predicted(row, baseline, measure) as number) - row.actual[measure]),
              gameDate: row.gameDate,
              playerId: row.playerId,
            })),
          ),
        ]),
      ),
    ]),
  ) as Record<Measure, Record<string, RobustDifference>>;
}

export interface RateError {
  /** Mean absolute error of the per-minute rate over rows with at least RATE_MIN_MINUTES actual minutes. */
  mae: number | null;
  n: number;
  /** The same error weighted by actual minutes, over every row: what a minute of play is worth. */
  minutesWeightedMae: number | null;
}

/** A method's per-minute rate is its projected stat over its projected minutes; the actual rate is stat over minutes played. */
export function rateErrors(rows: readonly BacktestRow[]): Record<Method, Record<Stat, RateError>> {
  const one = (method: Method, stat: Stat): RateError => {
    let abs = 0;
    let n = 0;
    let weighted = 0;
    let minutes = 0;
    for (const row of rows) {
      const projectedMinutes = predicted(row, method, "minutes") as number;
      const projectedStat = predicted(row, method, stat) as number;
      if (projectedMinutes <= 0 || row.actual.minutes <= 0) continue;
      const error = Math.abs(projectedStat / projectedMinutes - row.actual[stat] / row.actual.minutes);
      weighted += error * row.actual.minutes;
      minutes += row.actual.minutes;
      if (row.actual.minutes >= RATE_MIN_MINUTES) {
        abs += error;
        n += 1;
      }
    }
    return { mae: n > 0 ? abs / n : null, n, minutesWeightedMae: minutes > 0 ? weighted / minutes : null };
  };
  return Object.fromEntries(METHODS.map((m) => [m, Object.fromEntries(STATS.map((s) => [s, one(m, s)]))])) as Record<Method, Record<Stat, RateError>>;
}

export interface Decomposition {
  /** v0 stat error as projected. */
  actualMae: number | null;
  /** Projected rate times the minutes actually played: what is left if minutes were known. */
  oracleMinutesMae: number | null;
  /** Projected minutes times the actual rate: what is left if the per-minute rate were known. */
  oracleRateMae: number | null;
}

/** Splits v0's stat error into its minutes and rate parts with two counterfactuals. Diagnostic: neither is a usable model. */
export function decompose(rows: readonly BacktestRow[]): Record<Stat, Decomposition> {
  const mean = (values: number[]): number | null => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return Object.fromEntries(
    STATS.map((stat) => {
      const usable = rows.filter((row) => (predicted(row, "v0", "minutes") as number) > 0 && row.actual.minutes > 0);
      const cells = usable.map((row) => {
        const m = predicted(row, "v0", "minutes") as number;
        const rate = (predicted(row, "v0", stat) as number) / m;
        const actualRate = row.actual[stat] / row.actual.minutes;
        return { asProjected: Math.abs(m * rate - row.actual[stat]), oracleMinutes: Math.abs(row.actual.minutes * rate - row.actual[stat]), oracleRate: Math.abs(m * actualRate - row.actual[stat]) };
      });
      return [stat, { actualMae: mean(cells.map((c) => c.asProjected)), oracleMinutesMae: mean(cells.map((c) => c.oracleMinutes)), oracleRateMae: mean(cells.map((c) => c.oracleRate)) }];
    }),
  ) as Record<Stat, Decomposition>;
}

export interface Segment {
  rows: number;
  /** True when the segment is too small to read as a finding. */
  thin: boolean;
  errors: MethodErrors;
}

/** Scores each group of rows. The grouping key must be known before the game, unless the table says it is a diagnostic. */
export function segmentTable(rows: readonly BacktestRow[], keyOf: (row: BacktestRow) => string): Record<string, Segment> {
  const groups = new Map<string, BacktestRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([key, group]) => [key, { rows: group.length, thin: group.length < THIN_SEGMENT_ROWS, errors: scoreMethods(group) }]),
  );
}

const priorGamesBand = (n: number): string => (n < 5 ? "1-4" : n < 10 ? "05-09" : n < 20 ? "10-19" : n < 40 ? "20-39" : "40+");
const restBand = (days: number | null): string => (days === null ? "first game" : days <= 1 ? "back-to-back" : days === 2 ? "1 day rest" : "2+ days rest");
const marginBand = (margin: number | null): string => (margin === null ? "unknown" : margin >= 20 ? "20+" : margin >= 10 ? "10-19" : "0-9");
const expectedMarginBand = (margin: number | null): string => (margin === null ? "too early" : margin < 3 ? "0-3" : margin < 6 ? "3-6" : "6+");
const opponentDefenseBand = (diff: number | null): string => (diff === null ? "too early" : diff > 2.5 ? "weak defense" : diff < -2.5 ? "strong defense" : "average");
const actualMinutesBand = (minutes: number): string => (minutes < 10 ? "<10" : minutes < 20 ? "10-19" : minutes < 30 ? "20-29" : "30+");

/** Segmentations known before tip-off (a projection could use them) and diagnostics that depend on the outcome. */
export const PREGAME_SEGMENTS: Record<string, (row: BacktestRow) => string> = {
  projectedMinutesTier: (r) => roleTier(r.predictions.v0.minutes ?? 0),
  priorGames: (r) => priorGamesBand(r.priorGames),
  returningFromAbsence: (r) => String(r.flags.returningFromAbsence),
  teamChangedRecently: (r) => String(r.flags.teamChangedRecently),
  roleChange: (r) => String(r.flags.roleChange),
  teamRest: (r) => restBand(r.teamRestDays),
  homeAway: (r) => (r.isHome ? "home" : "away"),
  expectedMarginBand: (r) => expectedMarginBand(r.expectedAbsMargin),
  opponentDefenseBand: (r) => opponentDefenseBand(r.opponentDefense),
  month: (r) => r.gameDate.slice(0, 7),
};

export const DIAGNOSTIC_SEGMENTS: Record<string, (row: BacktestRow) => string> = {
  actualMinutesBand: (r) => actualMinutesBand(r.actual.minutes),
  finalMarginBand: (r) => marginBand(r.marginAbs),
};

export interface BacktestSummary {
  rows: number;
  headline: MethodErrors;
  paired: Record<Measure, Record<string, RobustDifference>>;
  rate: Record<Method, Record<Stat, RateError>>;
  decomposition: Record<Stat, Decomposition>;
  pregameSegments: Record<string, Record<string, Segment>>;
  diagnosticSegments: Record<string, Record<string, Segment>>;
}

export function summarize(allRows: readonly BacktestRow[]): BacktestSummary {
  const rows = commonSample(allRows);
  const tables = (defs: Record<string, (row: BacktestRow) => string>) => Object.fromEntries(Object.entries(defs).map(([name, keyOf]) => [name, segmentTable(rows, keyOf)]));
  return {
    rows: rows.length,
    headline: scoreMethods(rows),
    paired: pairedAgainstBaselines(rows),
    rate: rateErrors(rows),
    decomposition: decompose(rows),
    pregameSegments: tables(PREGAME_SEGMENTS),
    diagnosticSegments: tables(DIAGNOSTIC_SEGMENTS),
  };
}
