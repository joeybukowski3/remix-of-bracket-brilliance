import { MIN_BUCKET_SAMPLE_SIZE, THRESHOLD_HOLDOUT_SEASONS, THRESHOLD_TUNING_SEASONS } from "./config";
import { wilsonInterval } from "./statisticalUncertainty";

export type ThresholdCandidateResult = { threshold: number; n: number; hitRate: number | null };
export type ThresholdValidationResult = {
  tuningResults: ThresholdCandidateResult[];
  selectedThreshold: number | null;
  holdout: { n: number; hitRate: number | null; wilsonLow: number | null; wilsonHigh: number | null };
};

/**
 * Section 19: threshold selection happens ONLY on TUNING seasons; the
 * selected threshold is then frozen and evaluated on HOLDOUT seasons it
 * never saw. No inspection of holdout results influences which threshold
 * gets selected — enforced structurally, not just by convention, since
 * this function only ever reads `rows` filtered to the season the caller
 * passed in for each half.
 */
export function validateThresholdWalkForward<T extends { season: number }>(
  allRows: readonly T[],
  candidateThresholds: readonly number[],
  edgeMagnitude: (row: T) => number,
  hit: (row: T) => boolean | null,
): ThresholdValidationResult {
  const tuningRows = allRows.filter((r) => (THRESHOLD_TUNING_SEASONS as readonly number[]).includes(r.season));
  const holdoutRows = allRows.filter((r) => (THRESHOLD_HOLDOUT_SEASONS as readonly number[]).includes(r.season));

  const tuningResults: ThresholdCandidateResult[] = candidateThresholds.map((threshold) => {
    const atOrAbove = tuningRows.filter((r) => Math.abs(edgeMagnitude(r)) >= threshold && hit(r) !== null);
    const hits = atOrAbove.filter((r) => hit(r) === true).length;
    return { threshold, n: atOrAbove.length, hitRate: atOrAbove.length === 0 ? null : hits / atOrAbove.length };
  });

  const eligible = tuningResults.filter((r) => r.n >= MIN_BUCKET_SAMPLE_SIZE && r.hitRate !== null);
  const selected = eligible.length === 0 ? null : eligible.reduce((best, cur) => ((cur.hitRate as number) > (best.hitRate as number) ? cur : best));

  if (selected === null) {
    return { tuningResults, selectedThreshold: null, holdout: { n: 0, hitRate: null, wilsonLow: null, wilsonHigh: null } };
  }

  const holdoutAtOrAbove = holdoutRows.filter((r) => Math.abs(edgeMagnitude(r)) >= selected.threshold && hit(r) !== null);
  const holdoutHits = holdoutAtOrAbove.filter((r) => hit(r) === true).length;
  const wilson = wilsonInterval(holdoutHits, holdoutAtOrAbove.length);

  return {
    tuningResults,
    selectedThreshold: selected.threshold,
    holdout: {
      n: holdoutAtOrAbove.length,
      hitRate: holdoutAtOrAbove.length === 0 ? null : holdoutHits / holdoutAtOrAbove.length,
      wilsonLow: wilson?.low ?? null,
      wilsonHigh: wilson?.high ?? null,
    },
  };
}
