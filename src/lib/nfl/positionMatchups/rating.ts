import type { PositionMatchupRating } from "./types";

/**
 * Rating threshold derivation.
 *
 * EDGE = FOR rank + ALLOWED rank - 33 (see edge.ts), where FOR rank and
 * ALLOWED rank are each independent-ish integers in 1..32. Treating the two
 * inputs as approximately independent and uniform, the sum of all 32x32 =
 * 1,024 possible (FOR rank, ALLOWED rank) pairs gives the EDGE distribution
 * actually observed on this page: a symmetric, triangular distribution
 * centered on 0, ranging -31..31, with these empirical quintile
 * boundaries (computed directly, not guessed):
 *
 *   p10 -18   p20 -12   p30 -7   p40 -3   p50 0   p60 3   p70 7   p80 12   p90 18
 *
 * The five ratings are quintile bands built from p20/p40/p60/p80, rounded
 * to clean, symmetric integers so the bands read intuitively:
 *
 *   Very Strong:  edge >= 12   (top ~20%)
 *   Strong:       4 <= edge < 12
 *   Neutral:     -4 <  edge < 4   (middle ~14%, centered on the p40/p60 pair)
 *   Weak:       -12 <  edge <= -4
 *   Very Weak:    edge <= -12  (bottom ~20%)
 */
export const POSITION_MATCHUP_RATING_THRESHOLDS = {
  veryStrong: 12,
  strong: 4,
  weak: -4,
  veryWeak: -12,
} as const;

export function computeRating(edge: number | null): PositionMatchupRating | null {
  if (edge == null) return null;
  if (edge >= POSITION_MATCHUP_RATING_THRESHOLDS.veryStrong) return "very-strong";
  if (edge >= POSITION_MATCHUP_RATING_THRESHOLDS.strong) return "strong";
  if (edge > POSITION_MATCHUP_RATING_THRESHOLDS.weak) return "neutral";
  if (edge > POSITION_MATCHUP_RATING_THRESHOLDS.veryWeak) return "weak";
  return "very-weak";
}

export const POSITION_MATCHUP_RATING_LABELS: Record<PositionMatchupRating, string> = {
  "very-strong": "Very Strong",
  strong: "Strong",
  neutral: "Neutral",
  weak: "Weak",
  "very-weak": "Very Weak",
};
