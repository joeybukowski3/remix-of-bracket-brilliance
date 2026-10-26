/**
 * Sizing of improvement opportunities, measured and not adopted. Nothing here changes the board's projection: each
 * measure answers "what would the walk-forward error have been if...", on the same targets, so a change can be ranked
 * by evidence before anyone writes it.
 *
 *  - Parameter variants: baseline v0 re-run with one alternative setting chosen from the error diagnosis beforehand
 *    (not searched), compared with the frozen default on the same player-games with a paired, cluster-robust interval.
 *  - Segment bias correction: learn the median error of a pregame segment on the first part of the season, apply it to
 *    the rest. A segment whose correction does not help out of sample is not a lever.
 *
 * Both are reported for the whole sample and for the second half alone, so a result that only holds in one half shows.
 * The second half is a stability check, not an out-of-sample test: the variants were chosen after looking at the same
 * season, and the many segment corrections are not adjusted for multiple comparisons. Intervals are clustered by player
 * and by week with a t critical value. Confirm any change on later games before adopting it.
 */
import { DEFAULT_BASELINE_PARAMS, type BaselineParams } from "../../projection";
import { robustDifference, type RobustDifference } from "./inference";
import { MEASURES, PREGAME_SEGMENTS, commonSample, type Measure } from "./backtestMetrics";
import type { BacktestRow } from "./walkForward";

export interface Variant {
  id: string;
  label: string;
  params: BaselineParams;
}

const base = DEFAULT_BASELINE_PARAMS;

/** Alternatives fixed in advance from the diagnosis (minutes pulled toward a fixed prior; rate shrinkage), not tuned. */
export const VARIANTS: readonly Variant[] = [
  { id: "minutes-no-shrink", label: "no shrink of minutes toward the fixed new-player prior", params: { ...base, minutesShrinkGames: 0 } },
  {
    id: "minutes-recent-no-shrink",
    label: "minutes weighted L5 0.6, L10 0.3, L20 0.1, no season-to-date, no shrink",
    params: { ...base, minutesShrinkGames: 0, minutesWeights: { l5: 0.6, l10: 0.3, l20: 0.1, seasonToDate: 0 } },
  },
  { id: "rate-shrink-0", label: "per-minute rates not shrunk at all (recent 20 games only)", params: { ...base, rateShrinkMinutes: { pts: 0, reb: 0, ast: 0 } } },
  { id: "rate-shrink-25", label: "per-minute rates shrunk 25 minutes toward the league rate instead of 100", params: { ...base, rateShrinkMinutes: { pts: 25, reb: 25, ast: 25 } } },
  { id: "rate-shrink-50", label: "per-minute rates shrunk 50 minutes toward the league rate instead of 100", params: { ...base, rateShrinkMinutes: { pts: 50, reb: 50, ast: 50 } } },
  { id: "rate-shrink-400", label: "per-minute rates shrunk 400 minutes toward the league rate instead of 100", params: { ...base, rateShrinkMinutes: { pts: 400, reb: 400, ast: 400 } } },
];

export interface VariantComparison {
  id: string;
  label: string;
  /** Per measure: mean of |variant error| minus |default error| (negative favours the variant), with a 95% interval. */
  all: Record<Measure, RobustDifference>;
  secondHalf: Record<Measure, RobustDifference>;
  /** The variant's own MAE per measure on all rows. */
  mae: Record<Measure, number | null>;
}

const pairKey = (row: BacktestRow): string => `${row.gameId}|${row.playerId}`;

/** The first date of the later half of the sample's distinct game dates. */
export function secondHalfStart(rows: readonly BacktestRow[]): string | null {
  const dates = [...new Set(rows.map((r) => r.gameDate))].sort();
  return dates.length < 2 ? null : dates[Math.floor(dates.length / 2)];
}

function pairedV0(variant: readonly BacktestRow[], reference: ReadonlyMap<string, BacktestRow>, measure: Measure): RobustDifference {
  return robustDifference(
    variant.flatMap((row) => {
      const ref = reference.get(pairKey(row));
      const a = row.predictions.v0[measure];
      const b = ref?.predictions.v0[measure];
      if (a === null || b === null || b === undefined) return [];
      return [{ candidate: Math.abs(a - row.actual[measure]), benchmark: Math.abs(b - row.actual[measure]), gameDate: row.gameDate, playerId: row.playerId }];
    }),
  );
}

export function compareVariant(variant: Variant, variantRows: readonly BacktestRow[], defaultRows: readonly BacktestRow[]): VariantComparison {
  const reference = new Map(commonSample(defaultRows).map((row) => [pairKey(row), row]));
  const rows = commonSample(variantRows).filter((row) => reference.has(pairKey(row)));
  const split = secondHalfStart(rows);
  const later = split === null ? [] : rows.filter((row) => row.gameDate >= split);
  const each = (subset: readonly BacktestRow[]) => Object.fromEntries(MEASURES.map((m) => [m, pairedV0(subset, reference, m)])) as Record<Measure, RobustDifference>;
  const mae = Object.fromEntries(
    MEASURES.map((m) => [m, rows.length === 0 ? null : rows.reduce((sum, row) => sum + Math.abs((row.predictions.v0[m] as number) - row.actual[m]), 0) / rows.length]),
  ) as Record<Measure, number | null>;
  return { id: variant.id, label: variant.label, all: each(rows), secondHalf: each(later), mae };
}

/** A segment learned on the first part of the season with fewer rows than this gets no correction. */
export const MIN_LEARNING_ROWS = 50;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface BiasCorrection {
  segmentation: string;
  measure: Measure;
  /** Out-of-sample rows (the later half) the correction was applied to. */
  rows: number;
  /** Later-half MAE of v0 before and after subtracting each segment's first-half median error. */
  maeBefore: number | null;
  maeAfter: number | null;
  /** Mean of |corrected error| minus |original error| (negative is an improvement), with a 95% interval. */
  difference: RobustDifference;
}

export function biasCorrectionGains(allRows: readonly BacktestRow[], measures: readonly Measure[] = MEASURES): BiasCorrection[] {
  const rows = commonSample(allRows);
  const split = secondHalfStart(rows);
  if (split === null) return [];
  const learn = rows.filter((r) => r.gameDate < split);
  const apply = rows.filter((r) => r.gameDate >= split);
  const out: BiasCorrection[] = [];
  // "all" is one constant shift: the control that a real segment effect has to beat.
  const segmentations: Array<[string, (row: BacktestRow) => string]> = [["all", () => "all"], ...Object.entries(PREGAME_SEGMENTS).filter(([name]) => name !== "month")];
  for (const [segmentation, keyOf] of segmentations) {
    for (const measure of measures) {
      const learned = new Map<string, number[]>();
      for (const row of learn) {
        const key = keyOf(row);
        const errors = learned.get(key);
        const error = (row.predictions.v0[measure] as number) - row.actual[measure];
        if (errors) errors.push(error);
        else learned.set(key, [error]);
      }
      // The median error is the shift that minimizes mean absolute error; the mean error would not, for skewed stats.
      const shifts = new Map([...learned].map(([key, errors]) => [key, errors.length >= MIN_LEARNING_ROWS ? median(errors) : 0]));
      const correction = (row: BacktestRow): number => shifts.get(keyOf(row)) ?? 0;
      const items = apply.map((row) => {
        const raw = (row.predictions.v0[measure] as number) - row.actual[measure];
        return { candidate: Math.abs(raw - correction(row)), benchmark: Math.abs(raw), gameDate: row.gameDate, playerId: row.playerId };
      });
      const n = items.length;
      out.push({
        segmentation,
        measure,
        rows: n,
        maeBefore: n === 0 ? null : items.reduce((s, i) => s + i.benchmark, 0) / n,
        maeAfter: n === 0 ? null : items.reduce((s, i) => s + i.candidate, 0) / n,
        difference: robustDifference(items),
      });
    }
  }
  return out;
}
