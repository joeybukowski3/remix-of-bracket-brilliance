/**
 * Scoring of the frozen candidates against the baseline on the same player-games: overall, in the later half of the
 * season, and by pregame subgroup, with the frozen material-worsening rule applied to every subgroup.
 *
 * Every difference is the mean of |candidate error| minus |baseline error| over the same rows (negative favours the
 * candidate), with the conservative interval from backtest/inference.ts.
 */
import { robustDifference, type RobustDifference } from "../backtest/inference";
import { secondHalfStart } from "../backtest/opportunities";
import type { BacktestRow } from "../backtest/walkForward";
import { roleTier } from "../../role";
import { BASELINE_V0_PUBLIC_PARAMS } from "../../projection";
import { MATERIAL_MIN_ROWS, MATERIAL_RELATIVE_WORSENING, type CandidateId } from "./frozenPlan";

export const MEASURES = ["minutes", "pts", "reb", "ast"] as const;
export type Measure = (typeof MEASURES)[number];
export const CHALLENGERS = ["A", "B", "AB"] as const satisfies readonly Exclude<CandidateId, "baseline">[];
export type Challenger = (typeof CHALLENGERS)[number];

const error = (row: BacktestRow, id: string, measure: Measure): number | null => {
  const predicted = row.candidates[id]?.[measure];
  return predicted === null || predicted === undefined ? null : Math.abs(predicted - row.actual[measure]);
};

const signedError = (row: BacktestRow, id: string, measure: Measure): number => (row.candidates[id][measure] as number) - row.actual[measure];

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

export interface MeasureComparison {
  rows: number;
  baselineMae: number | null;
  candidateMae: number | null;
  /** Signed error: positive means over-projection. */
  baselineBias: number | null;
  candidateBias: number | null;
  difference: RobustDifference;
}

/** The candidate against the baseline on one measure, over the rows where both are defined. */
export function compareMeasure(rows: readonly BacktestRow[], challenger: Challenger, measure: Measure): MeasureComparison {
  const usable = rows.filter((r) => error(r, "baseline", measure) !== null && error(r, challenger, measure) !== null);
  return {
    rows: usable.length,
    baselineMae: mean(usable.map((r) => error(r, "baseline", measure) as number)),
    candidateMae: mean(usable.map((r) => error(r, challenger, measure) as number)),
    baselineBias: mean(usable.map((r) => signedError(r, "baseline", measure))),
    candidateBias: mean(usable.map((r) => signedError(r, challenger, measure))),
    difference: robustDifference(usable.map((r) => ({ candidate: error(r, challenger, measure) as number, benchmark: error(r, "baseline", measure) as number, gameDate: r.gameDate, playerId: r.playerId }))),
  };
}

export type Comparison = Record<Measure, MeasureComparison>;

export const compareAll = (rows: readonly BacktestRow[], challenger: Challenger): Comparison =>
  Object.fromEntries(MEASURES.map((m) => [m, compareMeasure(rows, challenger, m)])) as Comparison;

/** Whether a subgroup comparison is a material worsening under the frozen rule. */
export function isMaterialWorsening(c: MeasureComparison): boolean {
  const { difference, baselineMae } = c;
  if (c.rows < MATERIAL_MIN_ROWS || difference.meanDiff === null || difference.ci95 === null || baselineMae === null) return false;
  return difference.ci95[0] > 0 && difference.meanDiff >= MATERIAL_RELATIVE_WORSENING * baselineMae;
}

export interface Subgroup {
  rows: number;
  comparison: Comparison;
  /** Measures on which this subgroup is a material worsening. */
  worsened: Measure[];
}

type KeyOf = (row: BacktestRow) => string;

/** Thirds of the season's distinct game dates, for the rows given. */
export function seasonSegmentOf(rows: readonly BacktestRow[]): KeyOf {
  const dates = [...new Set(rows.map((r) => r.gameDate))].sort();
  const first = dates[Math.floor(dates.length / 3)] ?? "";
  const second = dates[Math.floor((2 * dates.length) / 3)] ?? "";
  return (r) => (r.gameDate < first ? "1 early third" : r.gameDate < second ? "2 middle third" : "3 late third");
}

const priorGamesBand = (n: number): string => (n < 5 ? "1-4" : n < 10 ? "05-09" : n < 20 ? "10-19" : n < 40 ? "20-39" : "40+");
const hasQualifyingPrevious = (r: BacktestRow): boolean => r.previousSeasonGames >= BASELINE_V0_PUBLIC_PARAMS.prevSeasonMinGames;

export function subgroupKeys(rows: readonly BacktestRow[]): Record<string, KeyOf> {
  return {
    projectedMinutesTier: (r) => roleTier(r.candidates.baseline.minutes ?? 0),
    priorGames: (r) => priorGamesBand(r.priorGames),
    seasonSegment: seasonSegmentOf(rows),
    month: (r) => r.gameDate.slice(0, 7),
    previousSeason: (r) => (hasQualifyingPrevious(r) ? "qualifying previous season" : r.previousSeasonGames > 0 ? "under 10 games last season" : "no previous season"),
    fixedPriorApplies: (r) => (!hasQualifyingPrevious(r) && r.seasonPriorGames >= 1 ? "A applies (fixed prior in use)" : "A does not apply"),
    returningFromAbsence: (r) => String(r.flags.returningFromAbsence),
    teamChangedRecently: (r) => String(r.flags.teamChangedRecently),
    roleChange: (r) => String(r.flags.roleChange),
    teamRest: (r) => (r.teamRestDays === null ? "first game" : r.teamRestDays <= 1 ? "back-to-back" : r.teamRestDays === 2 ? "1 day rest" : "2+ days rest"),
    homeAway: (r) => (r.isHome ? "home" : "away"),
  };
}

export function subgroupTables(rows: readonly BacktestRow[], challenger: Challenger): Record<string, Record<string, Subgroup>> {
  const tables: Record<string, Record<string, Subgroup>> = {};
  for (const [name, keyOf] of Object.entries(subgroupKeys(rows))) {
    const groups = new Map<string, BacktestRow[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    tables[name] = Object.fromEntries(
      [...groups].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([key, group]) => {
        const comparison = compareAll(group, challenger);
        return [key, { rows: group.length, comparison, worsened: MEASURES.filter((m) => isMaterialWorsening(comparison[m])) }];
      }),
    );
  }
  return tables;
}

export interface ChallengerReport {
  overall: Comparison;
  laterHalf: Comparison;
  laterHalfStarts: string | null;
  subgroups: Record<string, Record<string, Subgroup>>;
  /** Every subgroup and measure that is a material worsening, for the verdict and the report. */
  materialWorsening: Array<{ segmentation: string; subgroup: string; measure: Measure; rows: number; meanDiff: number; baselineMae: number }>;
}

export function reportChallenger(rows: readonly BacktestRow[], challenger: Challenger): ChallengerReport {
  const split = secondHalfStart([...rows]);
  const subgroups = subgroupTables(rows, challenger);
  const materialWorsening = Object.entries(subgroups).flatMap(([segmentation, groups]) =>
    Object.entries(groups).flatMap(([subgroup, g]) =>
      g.worsened.map((measure) => ({ segmentation, subgroup, measure, rows: g.rows, meanDiff: g.comparison[measure].difference.meanDiff as number, baselineMae: g.comparison[measure].baselineMae as number })),
    ),
  );
  return {
    overall: compareAll(rows, challenger),
    laterHalf: compareAll(split === null ? [] : rows.filter((r) => r.gameDate >= split), challenger),
    laterHalfStarts: split,
    subgroups,
    materialWorsening,
  };
}
