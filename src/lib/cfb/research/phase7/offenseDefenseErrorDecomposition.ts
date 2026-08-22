import { MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { assignDeciles, mean, stdDev } from "./statsUtils";
import type { MissDatasetRow } from "./types";

export type SideResidualSummary = {
  label: string;
  n: number;
  meanResidual: number | null; // actual - expected; positive = model UNDER-predicted that side's score
  residualStdDev: number | null;
};

export type OffenseDefenseDecompositionResult = {
  overall: { home: SideResidualSummary; away: SideResidualSummary };
  byHomeOffenseDecile: SideResidualSummary[]; // home-offense residual, bucketed by home offense rating decile
  byAwayOffenseDecile: SideResidualSummary[];
  byHomeDefenseDecile: SideResidualSummary[]; // away-offense residual (points allowed by home defense), bucketed by home defense rating decile
  byAwayDefenseDecile: SideResidualSummary[];
  byDisagreementMagnitude: { label: string; home: SideResidualSummary; away: SideResidualSummary }[];
};

function summarize(label: string, residuals: readonly number[]): SideResidualSummary {
  return {
    label,
    n: residuals.length,
    meanResidual: residuals.length >= MIN_BUCKET_SAMPLE_SIZE ? mean(residuals) : null,
    residualStdDev: residuals.length >= MIN_BUCKET_SAMPLE_SIZE ? stdDev(residuals) : null,
  };
}

/**
 * Section 13 — offense/defense residual decomposition.
 * homeResidual = actualHomePoints - expectedHomeScore (home OFFENSE vs. away DEFENSE jointly)
 * awayResidual = actualAwayPoints - expectedAwayScore (away OFFENSE vs. home DEFENSE jointly)
 * These are NOT separable into pure offense-only/defense-only error without
 * a counterfactual model re-run (out of scope); deciles by each side's OWN
 * rating tell us whether the miss concentrates at the high or low end of
 * that side's rating spectrum, which is the diagnostic the spec asks for.
 */
export function buildOffenseDefenseDecomposition(rows: readonly MissDatasetRow[]): OffenseDefenseDecompositionResult {
  // actualHomePoints = (actualTotal + actualMargin) / 2, actualAwayPoints = (actualTotal - actualMargin) / 2 (margin = home - away, total = home + away).
  const homeResiduals = rows.map((r) => (r.actualTotal + r.actualMargin) / 2 - r.expectedHomeScore);
  const awayResiduals = rows.map((r) => (r.actualTotal - r.actualMargin) / 2 - r.expectedAwayScore);

  const overall = {
    home: summarize("overall", homeResiduals),
    away: summarize("overall", awayResiduals),
  };

  function decileBreakdown(values: (number | null)[], residuals: readonly number[]): SideResidualSummary[] {
    const deciles = assignDeciles(values);
    return Array.from({ length: 10 }, (_, d) => {
      const bucketResiduals = residuals.filter((_, i) => deciles[i] === d);
      return summarize(`decile_${d}`, bucketResiduals);
    });
  }

  const byHomeOffenseDecile = decileBreakdown(rows.map((r) => r.homeOffenseRating), homeResiduals);
  const byAwayOffenseDecile = decileBreakdown(rows.map((r) => r.awayOffenseRating), awayResiduals);
  const byHomeDefenseDecile = decileBreakdown(rows.map((r) => r.homeDefenseRating), awayResiduals);
  const byAwayDefenseDecile = decileBreakdown(rows.map((r) => r.awayDefenseRating), homeResiduals);

  const disagreementBuckets = [
    { label: "<7", min: 0, max: 7 },
    { label: "7-10", min: 7, max: 10 },
    { label: "10-14", min: 10, max: 14 },
    { label: "14+", min: 14, max: Infinity },
  ];
  const byDisagreementMagnitude = disagreementBuckets.map((b) => {
    const idx = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.modelVsMarketDisagreement !== null && r.modelVsMarketDisagreement >= b.min && r.modelVsMarketDisagreement < b.max)
      .map(({ i }) => i);
    return {
      label: b.label,
      home: summarize(b.label, idx.map((i) => homeResiduals[i])),
      away: summarize(b.label, idx.map((i) => awayResiduals[i])),
    };
  });

  return { overall, byHomeOffenseDecile, byAwayOffenseDecile, byHomeDefenseDecile, byAwayDefenseDecile, byDisagreementMagnitude };
}
