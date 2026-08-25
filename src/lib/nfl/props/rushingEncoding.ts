import type { NflRushingFeatureRow } from "./types/rushingFeatures";
import { coalesceWindow } from "./qbOpportunityEncoding";

export const RUSHING_FEATURE_GROUPS = ["playerUsage", "playerEfficiency", "teamEnvironment", "opponentRushDefense", "market"] as const;
export type NflRushingFeatureGroup = (typeof RUSHING_FEATURE_GROUPS)[number];

export type NflRushingFeatureKey = { key: string; group: NflRushingFeatureGroup };

export const RUSHING_FEATURE_KEYS: readonly NflRushingFeatureKey[] = [
  { key: "playerUsage.carriesPerGame", group: "playerUsage" },
  { key: "playerUsage.carryShare", group: "playerUsage" },
  { key: "playerEfficiency.yardsPerCarry", group: "playerEfficiency" },
  { key: "teamEnvironment.rushAttemptsPerGame", group: "teamEnvironment" },
  { key: "teamEnvironment.overallDropbackRate", group: "teamEnvironment" },
  { key: "teamEnvironment.passRateOverExpected", group: "teamEnvironment" },
  { key: "opponentRushDefense.rushAttemptsPerGameAllowed", group: "opponentRushDefense" },
  { key: "opponentRushDefense.rushEpaPerPlayAllowed", group: "opponentRushDefense" },
  { key: "market.spread", group: "market" },
  { key: "market.total", group: "market" },
  { key: "market.impliedTeamTotal", group: "market" },
  { key: "market.homeAwayIsHome", group: "market" },
  { key: "market.isDome", group: "market" },
];

/** Appended after RUSHING_FEATURE_KEYS, always -- the position indicator is a segmentation/interaction input, not an ablatable "football-relevance" group. */
export const RUSHING_POSITION_KEY = "position.isQb";

export function extractRawRushingFeatureValues(
  row: NflRushingFeatureRow,
  options: { allowPriorSeasonFallback: boolean } = { allowPriorSeasonFallback: true },
): (number | null)[] {
  const f = row.features;
  const c = (w: { seasonPrior: number | null; priorSeason: number | null }) =>
    options.allowPriorSeasonFallback ? coalesceWindow(w) : w.seasonPrior;
  return [
    c(f.playerUsage.carriesPerGame),
    c(f.playerUsage.carryShare),
    c(f.playerEfficiency.yardsPerCarry),
    c(f.teamEnvironment.rushAttemptsPerGame),
    c(f.teamEnvironment.overallDropbackRate),
    c(f.teamEnvironment.passRateOverExpected),
    c(f.opponentRushDefense.rushAttemptsPerGameAllowed),
    c(f.opponentRushDefense.rushEpaPerPlayAllowed),
    f.market.spread,
    f.market.total,
    f.market.impliedTeamTotal,
    f.market.homeAway == null ? null : f.market.homeAway === "home" ? 1 : 0,
    f.market.isDome == null ? null : f.market.isDome ? 1 : 0,
  ];
}

export function computeRushingTrainFallbacks(
  trainRows: readonly NflRushingFeatureRow[],
  options: { allowPriorSeasonFallback: boolean } = { allowPriorSeasonFallback: true },
): number[] {
  const raw = trainRows.map((r) => extractRawRushingFeatureValues(r, options));
  return RUSHING_FEATURE_KEYS.map((_, col) => {
    const values = raw.map((row) => row[col]).filter((v): v is number => v != null);
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  });
}

export function encodeRushingFeatureRow(
  row: NflRushingFeatureRow,
  trainFallbacks: readonly number[],
  options: { allowPriorSeasonFallback: boolean; includePosition: boolean } = { allowPriorSeasonFallback: true, includePosition: true },
): number[] {
  const base = extractRawRushingFeatureValues(row, options).map((value, i) => value ?? trainFallbacks[i]);
  return options.includePosition ? [...base, row.diagnostics.isQb ? 1 : 0] : base;
}

export function ablateRushingGroups(
  encodedRow: readonly number[],
  trainFallbacks: readonly number[],
  excludedGroups: ReadonlySet<NflRushingFeatureGroup>,
): number[] {
  return encodedRow.map((value, i) => {
    const key = RUSHING_FEATURE_KEYS[i];
    if (!key) return value; // position column (if present), never ablated
    return excludedGroups.has(key.group) ? trainFallbacks[i] : value;
  });
}

export function appendRushingDecompositionLegs(encodedRow: readonly number[], projectedCarries: number, projectedYpc: number): number[] {
  return [...encodedRow, projectedCarries, projectedYpc];
}
