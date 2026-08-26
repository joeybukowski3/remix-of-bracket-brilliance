import type { NflQbPassingFeatureRow } from "./types/qbPassingFeatures";
import { coalesceWindow } from "./qbOpportunityEncoding";

export const PASSING_FEATURE_GROUPS = ["opportunity", "qbEfficiency", "opponentPassDefense", "proePassTendency", "market"] as const;
export type NflPassingFeatureGroup = (typeof PASSING_FEATURE_GROUPS)[number];

export type NflPassingFeatureKey = { key: string; group: NflPassingFeatureGroup };

export const PASSING_FEATURE_KEYS: readonly NflPassingFeatureKey[] = [
  { key: "opportunity.offensivePlaysPerGame", group: "opportunity" },
  { key: "opportunity.passAttemptsPerGame", group: "opportunity" },
  { key: "opportunity.qbAttemptsPerGame", group: "opportunity" },
  { key: "qbEfficiency.yardsPerAttempt", group: "qbEfficiency" },
  { key: "qbEfficiency.completionPct", group: "qbEfficiency" },
  { key: "opponentPassDefense.passAttemptsPerGameAllowed", group: "opponentPassDefense" },
  { key: "opponentPassDefense.overallDropbackRateAllowed", group: "opponentPassDefense" },
  { key: "opponentPassDefense.passEpaPerPlayAllowed", group: "opponentPassDefense" },
  { key: "proePassTendency.overallDropbackRate", group: "proePassTendency" },
  { key: "proePassTendency.earlyDownNeutralPassRate", group: "proePassTendency" },
  { key: "proePassTendency.passRateOverExpected", group: "proePassTendency" },
  { key: "market.spread", group: "market" },
  { key: "market.total", group: "market" },
  { key: "market.impliedTeamTotal", group: "market" },
  { key: "market.homeAwayIsHome", group: "market" },
  { key: "market.isDome", group: "market" },
];

/**
 * `allowPriorSeasonFallback = false` disables the `priorSeason` leg of the
 * coalesce chain (seasonPrior -> [priorSeason] -> null), used for the
 * "prior-season information" ablation: does prior-season data help at all
 * once current-season data alone is exhausted?
 */
export function extractRawPassingFeatureValues(
  row: NflQbPassingFeatureRow,
  options: { allowPriorSeasonFallback: boolean } = { allowPriorSeasonFallback: true },
): (number | null)[] {
  const f = row.features;
  const c = (w: { seasonPrior: number | null; priorSeason: number | null }) =>
    options.allowPriorSeasonFallback ? coalesceWindow(w) : w.seasonPrior;
  return [
    c(f.opportunity.offensivePlaysPerGame),
    c(f.opportunity.passAttemptsPerGame),
    c(f.opportunity.qbAttemptsPerGame),
    c(f.qbEfficiency.yardsPerAttempt),
    c(f.qbEfficiency.completionPct),
    c(f.opponentPassDefense.passAttemptsPerGameAllowed),
    c(f.opponentPassDefense.overallDropbackRateAllowed),
    c(f.opponentPassDefense.passEpaPerPlayAllowed),
    c(f.proePassTendency.overallDropbackRate),
    c(f.proePassTendency.earlyDownNeutralPassRate),
    c(f.proePassTendency.passRateOverExpected),
    f.market.spread,
    f.market.total,
    f.market.impliedTeamTotal,
    f.market.homeAway == null ? null : f.market.homeAway === "home" ? 1 : 0,
    f.market.isDome == null ? null : f.market.isDome ? 1 : 0,
  ];
}

export function computePassingTrainFallbacks(
  trainRows: readonly NflQbPassingFeatureRow[],
  options: { allowPriorSeasonFallback: boolean } = { allowPriorSeasonFallback: true },
): number[] {
  const raw = trainRows.map((r) => extractRawPassingFeatureValues(r, options));
  return PASSING_FEATURE_KEYS.map((_, col) => {
    const values = raw.map((row) => row[col]).filter((v): v is number => v != null);
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  });
}

export function encodePassingFeatureRow(
  row: NflQbPassingFeatureRow,
  trainFallbacks: readonly number[],
  options: { allowPriorSeasonFallback: boolean } = { allowPriorSeasonFallback: true },
): number[] {
  return extractRawPassingFeatureValues(row, options).map((value, i) => value ?? trainFallbacks[i]);
}

export function ablatePassingGroups(
  encodedRow: readonly number[],
  trainFallbacks: readonly number[],
  excludedGroups: ReadonlySet<NflPassingFeatureGroup>,
): number[] {
  return encodedRow.map((value, i) => (excludedGroups.has(PASSING_FEATURE_KEYS[i].group) ? trainFallbacks[i] : value));
}

/** Appends the two decomposition-leg scalars (Baseline E, "hybrid") after the standard 16 features. */
export function appendDecompositionLegs(encodedRow: readonly number[], projectedAttempts: number, projectedYpa: number): number[] {
  return [...encodedRow, projectedAttempts, projectedYpa];
}
