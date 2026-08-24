/**
 * Selected-week matchup grade — informational only, V1.
 *
 * One input: the selected pregame opponent fantasy-points-allowed rank for the
 * player's OWN position. Direction is preserved exactly — rank 1 allowed the
 * MOST fantasy points to the position, so rank 1 is the EASIEST matchup and the
 * grade degrades as the rank number climbs. No inversion happens here. The
 * legacy ROS consumer supplies its 2025 reference rank; Weekly supplies its
 * JKB Full PPR season-context rank from the prepared production row.
 *
 * THIS GRADE NEVER CHANGES THE RANKING. Rows are ordered by projected PPG and
 * by nothing else (see `weeklyRankings.ts`); the grade is a reading aid shown
 * beside the row. There is deliberately no multi-metric score, no z-scoring and
 * no multiplier here — those belong to a later phase.
 *
 * The bands split a 32-team league five ways, 6/6/8/6/6:
 *
 *   1-6   Great        7-12  Good        13-20 Neutral
 *   21-26 Tough        27-32 Very Tough
 *
 * The two favourable bands and the two unfavourable bands are the same width,
 * and the neutral middle is the widest, so a defense only earns a non-neutral
 * grade by being genuinely top-12 or bottom-12 against the position. The
 * eight-rank neutral band also lines up with the existing NFL rank tiers in
 * `src/lib/nfl/rankTier.ts`, which bucket 32 ranks in fours.
 */

/** Teams in the league — the denominator for every band. */
export const MATCHUP_GRADE_TEAM_COUNT = 32;

export type MatchupGradeId = "great" | "good" | "neutral" | "tough" | "very-tough";

export type MatchupGrade = {
  id: MatchupGradeId;
  /** Human label rendered in the badge and announced to screen readers. */
  label: string;
  /** Inclusive FPA-rank bounds (1-based, 1 = allowed the most). */
  minRank: number;
  maxRank: number;
  /** Badge classes. Green = favourable, slate = neutral, rose = unfavourable. */
  badgeClass: string;
};

/**
 * The five bands, best matchup first. Contiguous and exhaustive over 1-32;
 * `matchupGrade.test.ts` asserts both properties so a future edit cannot open
 * a gap or an overlap.
 */
export const MATCHUP_GRADES: readonly MatchupGrade[] = [
  {
    id: "great",
    label: "Great",
    minRank: 1,
    maxRank: 6,
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-900",
  },
  {
    id: "good",
    label: "Good",
    minRank: 7,
    maxRank: 12,
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    id: "neutral",
    label: "Neutral",
    minRank: 13,
    maxRank: 20,
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
  },
  {
    id: "tough",
    label: "Tough",
    minRank: 21,
    maxRank: 26,
    badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
  },
  {
    id: "very-tough",
    label: "Very Tough",
    minRank: 27,
    maxRank: 32,
    badgeClass: "border-rose-300 bg-rose-100 text-rose-900",
  },
];

/**
 * Grade for one opponent FPA rank, or null when the rank is missing or outside
 * 1-32. Null is deliberate: the row renders a dash rather than being silently
 * graded "Neutral", which would read as a real assessment of a matchup we could
 * not resolve.
 */
export function getMatchupGrade(fpaRank: number | null | undefined): MatchupGrade | null {
  if (!Number.isInteger(fpaRank)) return null;
  const rank = fpaRank as number;
  if (rank < 1 || rank > MATCHUP_GRADE_TEAM_COUNT) return null;
  return MATCHUP_GRADES.find((grade) => rank >= grade.minRank && rank <= grade.maxRank) ?? null;
}
