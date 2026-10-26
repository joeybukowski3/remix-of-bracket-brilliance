/**
 * The frozen decision rule (frozenPlan.ts) applied to a challenger's report, and the 2026-27 early-season sanity check.
 * The verdict never recommends an automatic change: passing means "justifies a targeted change", failing means "do not
 * change the public model".
 */
import type { BacktestRow } from "../backtest/walkForward";
import { CHALLENGERS, MEASURES, compareAll, type ChallengerReport, type Challenger, type Measure } from "./candidateMetrics";
import { PRIMARY_MEASURES } from "./frozenPlan";

export interface Verdict {
  justifiesTargetedChange: boolean;
  /** One line per rule step, whether it held, and why. */
  steps: Array<{ step: string; holds: boolean; detail: string }>;
}

const fmt = (v: number | null | undefined): string => (v === null || v === undefined ? "n/a" : v.toFixed(3));

export function verdictFor(challenger: Challenger, report: ChallengerReport): Verdict {
  const primary = PRIMARY_MEASURES[challenger];
  const upper = (m: Measure) => report.overall[m].difference.ci95?.[1] ?? null;
  const lower = (m: Measure) => report.overall[m].difference.ci95?.[0] ?? null;
  const unproven = primary.filter((m) => upper(m) === null || (upper(m) as number) >= 0);
  const worse = MEASURES.filter((m) => lower(m) !== null && (lower(m) as number) > 0);
  const laterNotBetter = primary.filter((m) => {
    const d = report.laterHalf[m].difference.meanDiff;
    return d === null || d >= 0;
  });
  const steps = [
    { step: "1 every primary measure improves (95% upper bound below zero)", holds: unproven.length === 0, detail: primary.map((m) => `${m} ${fmt(report.overall[m].difference.meanDiff)} (upper ${fmt(upper(m))})`).join("; ") },
    { step: "2 no measure is significantly worse overall", holds: worse.length === 0, detail: worse.length === 0 ? "none" : worse.join(", ") },
    { step: "3 every primary measure also improves in the later half of the season", holds: laterNotBetter.length === 0, detail: primary.map((m) => `${m} ${fmt(report.laterHalf[m].difference.meanDiff)}`).join("; ") },
    {
      step: "4 no material subgroup worsening",
      holds: report.materialWorsening.length === 0,
      detail: report.materialWorsening.length === 0 ? "none" : report.materialWorsening.map((w) => `${w.segmentation}=${w.subgroup} ${w.measure} +${w.meanDiff.toFixed(3)} on ${w.rows} rows`).join("; "),
    },
  ];
  return { justifiesTargetedChange: steps.every((s) => s.holds), steps };
}

export interface EarlySeasonCheck {
  rows: number;
  /** Projection ranges per candidate: any value outside a plausible box score is a defect, whatever the error. */
  ranges: Record<string, { minutesMin: number; minutesMax: number; ptsMin: number; ptsMax: number; outsidePlausible: number }>;
  /** Informational only: the sample is a few weeks of games, not evidence. */
  comparison: Record<Challenger, ReturnType<typeof compareAll>>;
}

export const PLAUSIBLE_MAX_MINUTES = 48;
export const PLAUSIBLE_MAX_POINTS = 60;

export function earlySeasonCheck(rows: readonly BacktestRow[]): EarlySeasonCheck {
  const ids = ["baseline", ...CHALLENGERS];
  const ranges = Object.fromEntries(
    ids.map((id) => {
      const projections = rows.map((r) => r.candidates[id]);
      const minutes = projections.map((p) => p.minutes ?? 0);
      const pts = projections.map((p) => p.pts ?? 0);
      const outside = projections.filter((p) => [p.minutes, p.pts, p.reb, p.ast].some((v) => v === null || !Number.isFinite(v) || v < 0) || (p.minutes ?? 0) > PLAUSIBLE_MAX_MINUTES || (p.pts ?? 0) > PLAUSIBLE_MAX_POINTS).length;
      return [id, { minutesMin: Math.min(...minutes), minutesMax: Math.max(...minutes), ptsMin: Math.min(...pts), ptsMax: Math.max(...pts), outsidePlausible: outside }];
    }),
  );
  return { rows: rows.length, ranges, comparison: Object.fromEntries(CHALLENGERS.map((c) => [c, compareAll(rows, c)])) as EarlySeasonCheck["comparison"] };
}
