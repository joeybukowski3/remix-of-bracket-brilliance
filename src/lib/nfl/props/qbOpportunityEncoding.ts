import type { NflQbOpportunityFeatureRow } from "./types/qbOpportunityFeatures";

/**
 * Flat, ordered numeric encoding of `NflQbOpportunityFeatureRow.features`
 * for Baseline D (ridge) and for feature-group ablation. Every feature is
 * tagged with the group it belongs to so an ablation run can zero out an
 * entire group by name without touching the others.
 */
export const FEATURE_GROUPS = ["teamVolume", "passTendency", "opponent", "market", "qbRole"] as const;
export type NflFeatureGroup = (typeof FEATURE_GROUPS)[number];

export type NflFeatureKey = {
  key: string;
  group: NflFeatureGroup;
};

export const FEATURE_KEYS: readonly NflFeatureKey[] = [
  { key: "teamVolume.offensivePlaysPerGame", group: "teamVolume" },
  { key: "teamVolume.passAttemptsPerGame", group: "teamVolume" },
  { key: "teamVolume.rushAttemptsPerGame", group: "teamVolume" },
  { key: "passTendency.overallDropbackRate", group: "passTendency" },
  { key: "passTendency.earlyDownNeutralPassRate", group: "passTendency" },
  { key: "passTendency.passRateOverExpected", group: "passTendency" },
  { key: "opponent.offensivePlaysPerGameAllowed", group: "opponent" },
  { key: "opponent.passAttemptsPerGameAllowed", group: "opponent" },
  { key: "opponent.overallDropbackRateAllowed", group: "opponent" },
  { key: "market.spread", group: "market" },
  { key: "market.total", group: "market" },
  { key: "market.impliedTeamTotal", group: "market" },
  { key: "market.homeAwayIsHome", group: "market" },
  { key: "qbRole.attemptsPerGame", group: "qbRole" },
  { key: "qbRole.gamesStartedPriorThisSeason", group: "qbRole" },
  { key: "qbRole.isFirstStartForTeamThisSeason", group: "qbRole" },
];

/**
 * Coalesce policy, shared by Baseline B/C and the ridge design matrix:
 * `seasonPrior` if available, else `priorSeason`, else `null` (resolved to
 * a train-only fallback constant by the caller). This is a transparent,
 * documented strategy -- never a fitted or hand-tuned blend.
 */
export function coalesceWindow(rate: { seasonPrior: number | null; priorSeason: number | null } | null | undefined): number | null {
  if (!rate) return null;
  if (rate.seasonPrior != null) return rate.seasonPrior;
  if (rate.priorSeason != null) return rate.priorSeason;
  return null;
}

/** Raw (possibly-null) feature values in `FEATURE_KEYS` order, before any imputation. */
export function extractRawFeatureValues(row: NflQbOpportunityFeatureRow): (number | null)[] {
  const f = row.features;
  return [
    coalesceWindow(f.teamVolume.offensivePlaysPerGame),
    coalesceWindow(f.teamVolume.passAttemptsPerGame),
    coalesceWindow(f.teamVolume.rushAttemptsPerGame),
    coalesceWindow(f.passTendency.overallDropbackRate),
    coalesceWindow(f.passTendency.earlyDownNeutralPassRate),
    coalesceWindow(f.passTendency.passRateOverExpected),
    coalesceWindow(f.opponent.offensivePlaysPerGameAllowed),
    coalesceWindow(f.opponent.passAttemptsPerGameAllowed),
    coalesceWindow(f.opponent.overallDropbackRateAllowed),
    f.market.spread,
    f.market.total,
    f.market.impliedTeamTotal,
    f.market.homeAway == null ? null : f.market.homeAway === "home" ? 1 : 0,
    coalesceWindow({ seasonPrior: f.qbRole.attemptsPerGameSeasonPrior, priorSeason: f.qbRole.attemptsPerGamePriorSeason }),
    f.qbRole.gamesStartedPriorThisSeason,
    f.qbRole.isFirstStartForTeamThisSeason ? 1 : 0,
  ];
}

/** Per-key mean of a set of (TRAIN-only) rows' raw values, ignoring nulls. Used to impute missing values deterministically. */
export function computeTrainFallbacks(trainRows: readonly NflQbOpportunityFeatureRow[]): number[] {
  const raw = trainRows.map(extractRawFeatureValues);
  return FEATURE_KEYS.map((_, col) => {
    const values = raw.map((row) => row[col]).filter((v): v is number => v != null);
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  });
}

/** Fully-imputed numeric row, in `FEATURE_KEYS` order, ready for the ridge design matrix. */
export function encodeFeatureRow(row: NflQbOpportunityFeatureRow, trainFallbacks: readonly number[]): number[] {
  return extractRawFeatureValues(row).map((value, i) => value ?? trainFallbacks[i]);
}

/** Zeroes (relative to the train mean, i.e. neutralizes) every column belonging to `excludedGroups` -- the standard ablation technique. */
export function ablateGroups(
  encodedRow: readonly number[],
  trainFallbacks: readonly number[],
  excludedGroups: ReadonlySet<NflFeatureGroup>,
): number[] {
  return encodedRow.map((value, i) => (excludedGroups.has(FEATURE_KEYS[i].group) ? trainFallbacks[i] : value));
}
