import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const WEEKLY_MATCHUP_TEAM_COUNT = 32;
export const WEEKLY_MATCHUP_MINIMUM_COMPONENTS = 3;

export const WEEKLY_MATCHUP_COMPONENT_KEYS = [
  "fpaSeason",
  "fpaLast5",
  "trenches",
  "epa",
  "success",
] as const;

export type WeeklyMatchupComponentKey = (typeof WEEKLY_MATCHUP_COMPONENT_KEYS)[number];
export type WeeklyMatchupGradeId = "great" | "good" | "neutral" | "tough" | "very-tough";
export type WeeklyMatchupGradeLabel = "Great" | "Good" | "Neutral" | "Tough" | "Very Tough" | "N/A";
export type WeeklyMatchupRankDirection = "favorable-low" | "favorable-high";
export type WeeklyMatchupInputs = Record<WeeklyMatchupComponentKey, number | null | undefined>;

export type WeeklyMatchupComponentResult = {
  /** Rank normalized to the fantasy-player convention: 1 best, 32 worst. */
  rank: number | null;
  score: number | null;
  configuredWeight: number;
  appliedWeight: number;
};

export type WeeklyMatchupCompositeResult = {
  /** Unrounded weighted score, retained for sorting and audit details. */
  rawScore: number | null;
  /** Integer presentation score. */
  score: number | null;
  grade: WeeklyMatchupGradeLabel;
  gradeId: WeeklyMatchupGradeId | null;
  availableComponentCount: number;
  components: Record<WeeklyMatchupComponentKey, WeeklyMatchupComponentResult>;
};

/**
 * Native direction of each weekly MATCHUP input after research join.
 *
 * FPA Season / FPA L5: opponent fantasy-points-allowed ranks, sorted so the
 * highest allowed value is #1. That is already the easiest fantasy matchup.
 *
 * Trenches / EPA / Success: weekly edge ranks of signed rankDifference
 * (`defenseRank - offenseRank`). Rank 1 is the largest offensive advantage.
 * Raw unit ranks stay 1 = best on both sides and are never scored directly.
 */
export const WEEKLY_MATCHUP_COMPONENT_DIRECTIONS: Readonly<
  Record<WeeklyMatchupComponentKey, WeeklyMatchupRankDirection>
> = {
  fpaSeason: "favorable-low",
  fpaLast5: "favorable-low",
  trenches: "favorable-low",
  epa: "favorable-low",
  success: "favorable-low",
};

const PASS_CATCHER_WEIGHTS = {
  fpaSeason: 0.30,
  fpaLast5: 0.15,
  trenches: 0.20,
  epa: 0.20,
  success: 0.15,
} as const;

const RB_WEIGHTS = {
  fpaSeason: 0.30,
  fpaLast5: 0.15,
  trenches: 0.25,
  epa: 0.15,
  success: 0.15,
} as const;

export const WEEKLY_MATCHUP_WEIGHTS: Readonly<
  Record<FantasyPosition, Readonly<Record<WeeklyMatchupComponentKey, number>>>
> = {
  QB: PASS_CATCHER_WEIGHTS,
  WR: PASS_CATCHER_WEIGHTS,
  TE: PASS_CATCHER_WEIGHTS,
  RB: RB_WEIGHTS,
};

export const WEEKLY_MATCHUP_GRADE_BANDS = [
  { id: "great", label: "Great", minScore: 85 },
  { id: "good", label: "Good", minScore: 70 },
  { id: "neutral", label: "Neutral", minScore: 45 },
  { id: "tough", label: "Tough", minScore: 30 },
  { id: "very-tough", label: "Very Tough", minScore: 0 },
] as const satisfies readonly {
  id: WeeklyMatchupGradeId;
  label: Exclude<WeeklyMatchupGradeLabel, "N/A">;
  minScore: number;
}[];

/**
 * Convert a source rank onto the fantasy-player convention of #1 easiest,
 * #32 hardest. Invert only when a source is documented as favorable-high.
 */
export function toFavorableWeeklyMatchupRank(
  rank: number | null | undefined,
  direction: WeeklyMatchupRankDirection = "favorable-low",
): number | null {
  if (rank == null || !Number.isFinite(rank)) return null;
  const clamped = Math.min(WEEKLY_MATCHUP_TEAM_COUNT, Math.max(1, rank));
  return direction === "favorable-low" ? clamped : WEEKLY_MATCHUP_TEAM_COUNT + 1 - clamped;
}

export function weeklyMatchupRankScore(rank: number | null | undefined): number | null {
  const favorableRank = toFavorableWeeklyMatchupRank(rank);
  return favorableRank == null
    ? null
    : ((WEEKLY_MATCHUP_TEAM_COUNT - favorableRank) / (WEEKLY_MATCHUP_TEAM_COUNT - 1)) * 100;
}

export function weeklyMatchupGrade(score: number | null | undefined): {
  id: WeeklyMatchupGradeId;
  label: Exclude<WeeklyMatchupGradeLabel, "N/A">;
} | null {
  if (score == null || !Number.isFinite(score) || score < 0 || score > 100) return null;
  return WEEKLY_MATCHUP_GRADE_BANDS.find((band) => score >= band.minScore) ?? null;
}

/**
 * Research-only composite. Callers must not feed this score into projections,
 * position ranks, or production model adjustments.
 */
export function calculateWeeklyMatchupComposite(
  position: FantasyPosition,
  inputs: WeeklyMatchupInputs,
): WeeklyMatchupCompositeResult {
  const weights = WEEKLY_MATCHUP_WEIGHTS[position];
  const normalized = Object.fromEntries(WEEKLY_MATCHUP_COMPONENT_KEYS.map((key) => {
    const rank = toFavorableWeeklyMatchupRank(inputs[key], WEEKLY_MATCHUP_COMPONENT_DIRECTIONS[key]);
    return [key, {
      rank,
      score: weeklyMatchupRankScore(rank),
      weight: weights[key],
    }];
  })) as Record<WeeklyMatchupComponentKey, { rank: number | null; score: number | null; weight: number }>;
  const availableKeys = WEEKLY_MATCHUP_COMPONENT_KEYS.filter((key) => normalized[key].score != null);
  const availableWeight = availableKeys.reduce((sum, key) => sum + weights[key], 0);
  const sufficient = availableKeys.length >= WEEKLY_MATCHUP_MINIMUM_COMPONENTS && availableWeight > 0;
  const weightedScore = sufficient
    ? availableKeys.reduce((sum, key) => sum + normalized[key].score! * (weights[key] / availableWeight), 0)
    : null;
  const rawScore = weightedScore == null ? null : Math.min(100, Math.max(0, weightedScore));
  const grade = weeklyMatchupGrade(rawScore);
  const components = Object.fromEntries(WEEKLY_MATCHUP_COMPONENT_KEYS.map((key) => [key, {
    rank: normalized[key].rank,
    score: normalized[key].score,
    configuredWeight: weights[key],
    appliedWeight: sufficient && normalized[key].score != null ? weights[key] / availableWeight : 0,
  }])) as Record<WeeklyMatchupComponentKey, WeeklyMatchupComponentResult>;

  return {
    rawScore,
    score: rawScore == null ? null : Math.round(rawScore),
    grade: grade?.label ?? "N/A",
    gradeId: grade?.id ?? null,
    availableComponentCount: availableKeys.length,
    components,
  };
}
