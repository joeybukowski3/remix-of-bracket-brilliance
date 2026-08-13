export type RankTone = "favorable" | "neutral" | "unfavorable" | "missing";

export type RankQuantileThresholds = {
  favorableMax: number;
  unfavorableMin: number;
};

/**
 * Derives restrained quartile cutoffs from the populated ranks shown on one
 * active position board. Lower numerical rank is always better.
 */
export function getRankQuantileThresholds(
  values: readonly (number | undefined)[],
): RankQuantileThresholds | null {
  const sorted = values
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const favorableIndex = Math.max(0, Math.ceil(sorted.length * 0.25) - 1);
  const unfavorableIndex = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  return {
    favorableMax: sorted[favorableIndex],
    unfavorableMin: sorted[unfavorableIndex],
  };
}

export function getQuantileRankTone(
  value: number | undefined,
  thresholds: RankQuantileThresholds | null,
): RankTone {
  if (!Number.isFinite(value) || !thresholds) return "missing";
  if (value! <= thresholds.favorableMax) return "favorable";
  if (value! >= thresholds.unfavorableMin) return "unfavorable";
  return "neutral";
}

export function getSosRankTone(value: number | undefined): RankTone {
  if (!Number.isFinite(value)) return "missing";
  if (value! <= 10) return "favorable";
  if (value! >= 23) return "unfavorable";
  return "neutral";
}

