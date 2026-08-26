import type { NflReceivingFeatureRow } from "./types/receivingFeatures";
import { coalesceWindow } from "./qbOpportunityEncoding";

export const RECEIVING_FEATURE_GROUPS = ["playerUsage", "playerEfficiency", "airYards", "teamEnvironment", "targetConcentration", "opponentPassDefense", "market"] as const;
export type NflReceivingFeatureGroup = (typeof RECEIVING_FEATURE_GROUPS)[number];

export type NflReceivingFeatureKey = { key: string; group: NflReceivingFeatureGroup };

export const RECEIVING_FEATURE_KEYS: readonly NflReceivingFeatureKey[] = [
  { key: "playerUsage.targetsPerGame", group: "playerUsage" },
  { key: "playerUsage.targetShare", group: "playerUsage" },
  { key: "playerEfficiency.yardsPerTarget", group: "playerEfficiency" },
  { key: "playerEfficiency.receptionsPerTarget", group: "playerEfficiency" },
  { key: "playerEfficiency.yardsPerReception", group: "playerEfficiency" },
  { key: "airYards.adot", group: "airYards" },
  { key: "teamEnvironment.passAttemptsPerGame", group: "teamEnvironment" },
  { key: "teamEnvironment.overallDropbackRate", group: "teamEnvironment" },
  { key: "teamEnvironment.passRateOverExpected", group: "teamEnvironment" },
  { key: "targetConcentration.recentTeamTopTargetShareConcentration", group: "targetConcentration" },
  { key: "opponentPassDefense.targetsPerGameAllowed", group: "opponentPassDefense" },
  { key: "opponentPassDefense.passEpaPerPlayAllowed", group: "opponentPassDefense" },
  { key: "market.spread", group: "market" },
  { key: "market.total", group: "market" },
  { key: "market.impliedTeamTotal", group: "market" },
  { key: "market.homeAwayIsHome", group: "market" },
  { key: "market.isDome", group: "market" },
];

export function extractRawReceivingFeatureValues(
  row: NflReceivingFeatureRow,
  options: { allowPriorSeasonFallback: boolean } = { allowPriorSeasonFallback: true },
): (number | null)[] {
  const f = row.features;
  const c = (w: { seasonPrior: number | null; priorSeason: number | null }) =>
    options.allowPriorSeasonFallback ? coalesceWindow(w) : w.seasonPrior;
  return [
    c(f.playerUsage.targetsPerGame),
    c(f.playerUsage.targetShare),
    c(f.playerEfficiency.yardsPerTarget),
    c(f.playerEfficiency.receptionsPerTarget),
    c(f.playerEfficiency.yardsPerReception),
    c(f.airYards.adot),
    c(f.teamEnvironment.passAttemptsPerGame),
    c(f.teamEnvironment.overallDropbackRate),
    c(f.teamEnvironment.passRateOverExpected),
    c(f.targetConcentration.recentTeamTopTargetShareConcentration),
    c(f.opponentPassDefense.targetsPerGameAllowed),
    c(f.opponentPassDefense.passEpaPerPlayAllowed),
    f.market.spread,
    f.market.total,
    f.market.impliedTeamTotal,
    f.market.homeAway == null ? null : f.market.homeAway === "home" ? 1 : 0,
    f.market.isDome == null ? null : f.market.isDome ? 1 : 0,
  ];
}

export function computeReceivingTrainFallbacks(
  trainRows: readonly NflReceivingFeatureRow[],
  options: { allowPriorSeasonFallback: boolean } = { allowPriorSeasonFallback: true },
): number[] {
  const raw = trainRows.map((r) => extractRawReceivingFeatureValues(r, options));
  return RECEIVING_FEATURE_KEYS.map((_, col) => {
    const values = raw.map((row) => row[col]).filter((v): v is number => v != null);
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  });
}

/** Position one-hot (RB is the implicit baseline: [isWR, isTE]), appended after the base features -- never ablated, used only for the pooled-vs-segmented test. */
export function positionOneHot(position: "RB" | "WR" | "TE"): [number, number] {
  return [position === "WR" ? 1 : 0, position === "TE" ? 1 : 0];
}

export function encodeReceivingFeatureRow(
  row: NflReceivingFeatureRow,
  trainFallbacks: readonly number[],
  options: { allowPriorSeasonFallback: boolean; includePosition: boolean } = { allowPriorSeasonFallback: true, includePosition: true },
): number[] {
  const base = extractRawReceivingFeatureValues(row, options).map((value, i) => value ?? trainFallbacks[i]);
  return options.includePosition ? [...base, ...positionOneHot(row.diagnostics.position)] : base;
}

export function ablateReceivingGroups(
  encodedRow: readonly number[],
  trainFallbacks: readonly number[],
  excludedGroups: ReadonlySet<NflReceivingFeatureGroup>,
): number[] {
  return encodedRow.map((value, i) => {
    const key = RECEIVING_FEATURE_KEYS[i];
    if (!key) return value; // position columns, never ablated
    return excludedGroups.has(key.group) ? trainFallbacks[i] : value;
  });
}

export function appendReceivingDecompositionLegs(encodedRow: readonly number[], legs: readonly number[]): number[] {
  return [...encodedRow, ...legs];
}
