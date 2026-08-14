/**
 * Ordinal rank formatting for the matchup analyzer.
 *
 * League ranks read as ordinals ("21st") rather than as a hash-prefixed cardinal
 * ("#21"): a rank is a position, and the ordinal says so without a symbol the
 * reader has to decode. Kept beside `MatchupRankBadge` because the badge is the
 * primary consumer, and shared so every surface spells a rank the same way.
 *
 * Spoken text is deliberately NOT ordinalised — the badge's accessible
 * description still says "League rank 21 of 32", which reads more clearly than
 * an ordinal when announced alongside its denominator.
 */

/** Ranks whose tens digit is 1 always take "th": 11th, 12th, 13th, 111th. */
const TEENS_START = 11;
const TEENS_END = 13;

/**
 * Format a league rank as an ordinal string.
 *
 * Returns null for a missing or non-finite rank so callers render their own
 * unavailable state rather than a fabricated position.
 */
export function formatRankOrdinal(rank: number | null | undefined): string | null {
  if (rank == null || !Number.isFinite(rank)) return null;
  const whole = Math.trunc(rank);
  const mod100 = Math.abs(whole) % 100;
  if (mod100 >= TEENS_START && mod100 <= TEENS_END) return `${whole}th`;
  switch (Math.abs(whole) % 10) {
    case 1:
      return `${whole}st`;
    case 2:
      return `${whole}nd`;
    case 3:
      return `${whole}rd`;
    default:
      return `${whole}th`;
  }
}
