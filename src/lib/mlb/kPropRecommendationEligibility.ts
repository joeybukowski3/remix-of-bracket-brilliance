/**
 * kPropRecommendationEligibility.ts
 *
 * Centralized, pure evaluator for whether a pitcher's K-prop projection
 * qualifies for a PUBLIC recommendation (Top Over, Top Under, best-bet
 * lists, social picks) -- as distinct from whether the projection itself
 * is correct.
 *
 * Background: generate-mlb-hr-props-with-k-shadow.mjs's workload-role
 * safety override (see applyKProjectionMode) already fixed *projection
 * correctness* for relievers/openers -- a low-workload pitcher's
 * projectedIP/projectedKs now reflect a realistic short outing instead of
 * a starter-shaped fabrication. But a correct low projection can still
 * create a superficially strong EDGE against a very low sportsbook line
 * (e.g. projectedKs=0.9 vs kLine=0.5 is a "clearing" +0.4 edge, yet the
 * pitcher may not record a single strikeout). That is a RECOMMENDATION-
 * QUALITY problem, not a projection problem, and every public selection
 * surface must apply the same rules so none of them can bypass it.
 *
 * Two independent, deliberately different rule sets:
 *   - Over: needs a genuinely large enough workload (standard) OR passes
 *     a narrow, conservative "exceptional" override for elite matchups.
 *   - Under: a low workload is itself a legitimate reason to like an
 *     Under (the sportsbook line often assumes starter volume), so Under
 *     eligibility does NOT require the same minimum innings -- it
 *     requires reliable role/workload data and a meaningfully large gap
 *     instead.
 */

// ---------------------------------------------------------------------------
// Standard (starter-caliber) workload thresholds for Top Over eligibility.
// A pitcher meeting all of these proceeds through the existing edge/K-Score
// ranking logic unchanged -- these just confirm the workload backing the
// projection is substantial enough to trust at face value.
// ---------------------------------------------------------------------------
export const MIN_STANDARD_K_PROP_IP = 3.5;
export const MIN_STANDARD_K_PROP_BF = 14;
export const MIN_STANDARD_K_PROP_PROJECTED_KS = 2.5;
// Pre-existing model-vs-line edge bar (unchanged from before this fix) --
// named here so both Over and Under standard-tier eligibility apply it
// explicitly, instead of leaving the threshold implicit in the caller.
export const MIN_STANDARD_EDGE = 0.4;

// ---------------------------------------------------------------------------
// Exceptional low-workload override for Top Over. Deliberately stricter
// than the standard thresholds on every axis (workload, edge, confidence,
// matchup quality) because a short outing has far more variance than a
// full start -- a single extra/fewer strikeout swings the "edge" by a much
// larger relative amount. This is NOT a blanket ban on openers/relievers;
// it is a narrow exception that only a genuinely elite, well-supported
// matchup can clear. A pitcher around 1 IP / 4 BF / 0.9 Ks (the shape that
// motivated this fix) fails MIN_EXCEPTIONAL_IP and MIN_EXCEPTIONAL_BF
// outright, so it can never sneak through here.
// ---------------------------------------------------------------------------
export const MIN_EXCEPTIONAL_IP = 1.5;
export const MIN_EXCEPTIONAL_BF = 7;
export const MIN_EXCEPTIONAL_PROJECTED_KS = 1.5;
export const MIN_EXCEPTIONAL_EDGE = 1.0;
export const MIN_EXCEPTIONAL_CONFIDENCE = 0.85;
export const MIN_EXCEPTIONAL_TEAM_ADJUSTED_K_RATE = 0.3;
const EXCEPTIONAL_REQUIRED_CONFIDENCE_GRADE = "A";
// "Elite/top-decile" opponent strikeout rate -- MLB team K% typically spans
// ~18-27%; 26%+ sits at the extreme high end. Matches the same 14-28 range
// buildPitcherStrikeoutRows already normalizes opponentTeamKRate against.
export const MIN_EXCEPTIONAL_OPPONENT_K_RATE = 26;
// A "very high" strikeoutMatchupScore -- stricter than the existing "Strong
// K pitcher" UI tag threshold (72), reserved for a genuinely elite matchup.
export const MIN_EXCEPTIONAL_MATCHUP_SCORE = 78;

// Workload-data-quality flags (from compute-workload-projection.mjs /
// fetch-workload-data.mjs) that indicate the sample backing the projection
// is too thin or stale to trust for the exceptional override, or for a
// low-workload Under.
const WORKLOAD_QUALITY_BLOCKING_FLAGS = new Set([
  "LOW_PITCHER_SAMPLE",
  "LOW_RECENT_APPEARANCE_SAMPLE",
  "RECENT_PITCH_COUNTS_MISSING",
  "PITCHER_SEASON_K_RATE_MISSING",
  "PITCHER_RECENT_K_RATE_MISSING",
]);

// ---------------------------------------------------------------------------
// Ranking adjustment: an edge from a short outing is far less reliable than
// the same nominal edge from a full start. workloadReliability scales
// linearly with workload up to a "full start" reference point (~5.5 IP /
// ~22 BF), then clamps at 1 -- so a typical full-workload starter's
// adjustedRecommendationEdge equals rawEdge exactly (reliability clamps to
// 1), preserving existing ordering among normal starters, while anything
// short of that reference is proportionally, deterministically discounted.
// ---------------------------------------------------------------------------
const WORKLOAD_RELIABILITY_REFERENCE_IP = 5.5;
const WORKLOAD_RELIABILITY_REFERENCE_BF = 22;

// ---------------------------------------------------------------------------
// Top Under thresholds for a pitcher who does NOT meet the standard
// workload (mostly relievers/openers). Deliberately separate constants from
// the Over-side exceptional thresholds even though a couple share the same
// value today -- these guard a different claim ("the line is meaningfully
// above a trustworthy low projection") and may reasonably diverge later.
// ---------------------------------------------------------------------------
export const MIN_LOW_WORKLOAD_UNDER_EDGE = 1.0;
export const MIN_LOW_WORKLOAD_UNDER_CONFIDENCE = 0.7;

export type WorkloadRole = "starter" | "opener" | "reliever" | string;

export type KPropRecommendationSide = "over" | "under";

export type KPropRecommendationTier = "standard" | "exceptional-low-workload" | "excluded";

export type KPropRecommendationInput = {
  workloadRole?: WorkloadRole | null;
  /** Expected innings pitched backing the effective/public projection. */
  expectedIP?: number | null;
  /** Expected batters faced backing the effective/public projection. */
  expectedBF?: number | null;
  /** Effective/public projected strikeouts (already workload-safety-corrected). */
  projectedKs?: number | null;
  kLine?: number | null;
  publicRecommendationEligible?: boolean;
  workloadConfidenceGrade?: string | null;
  workloadConfidenceScore?: number | null;
  teamAdjustedKRate?: number | null;
  workloadFlags?: string[] | null;
  strikeoutMatchupScore?: number | null;
  opponentTeamKRate?: number | null;
};

export type KPropRecommendationEvaluation = {
  eligible: boolean;
  tier: KPropRecommendationTier;
  reason: string | null;
  /** 0-1, how much of a full starter workload this projection represents. */
  workloadScore: number;
  rawEdge: number | null;
  adjustedRecommendationEdge: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hasBlockingWorkloadFlag(flags: string[] | null | undefined) {
  if (!Array.isArray(flags)) return false;
  return flags.some((flag) => WORKLOAD_QUALITY_BLOCKING_FLAGS.has(flag));
}

/**
 * 0-1 score for how much of a "full start" this projection's workload
 * represents. Deterministic and bounded: a full-or-greater workload always
 * clamps to exactly 1, so adjustedRecommendationEdge === rawEdge for any
 * pitcher at or above the reference workload.
 */
export function computeWorkloadReliability(expectedIP: number | null | undefined, expectedBF: number | null | undefined) {
  const ipComponent = Number.isFinite(expectedIP) ? Number(expectedIP) / WORKLOAD_RELIABILITY_REFERENCE_IP : 0;
  const bfComponent = Number.isFinite(expectedBF) ? Number(expectedBF) / WORKLOAD_RELIABILITY_REFERENCE_BF : 0;
  return clamp(0.5 * ipComponent + 0.5 * bfComponent, 0, 1);
}

function excluded(reason: string, rawEdge: number | null, workloadScore: number): KPropRecommendationEvaluation {
  return {
    eligible: false,
    tier: "excluded",
    reason,
    workloadScore,
    rawEdge,
    adjustedRecommendationEdge: rawEdge == null ? null : Number((rawEdge * workloadScore).toFixed(2)),
  };
}

/**
 * Top Over eligibility: standard starter-caliber workload proceeds
 * unchanged; a narrow "exceptional" override exists for elite low-workload
 * matchups; everything else is excluded with an explicit reason.
 */
export function evaluateKPropOverRecommendation(row: KPropRecommendationInput): KPropRecommendationEvaluation {
  const workloadScore = computeWorkloadReliability(row.expectedIP, row.expectedBF);
  const rawEdge = row.projectedKs != null && row.kLine != null && Number.isFinite(row.projectedKs) && Number.isFinite(row.kLine)
    ? Number((row.projectedKs - row.kLine).toFixed(2))
    : null;

  if (row.publicRecommendationEligible === false) {
    return excluded("RECOMMENDATION_CANDIDATE_INELIGIBLE", rawEdge, workloadScore);
  }
  if (row.expectedIP == null || row.expectedBF == null || row.projectedKs == null || row.kLine == null) {
    return excluded("MISSING_WORKLOAD_DATA_FOR_TOP_OVER", rawEdge, workloadScore);
  }

  const meetsStandardWorkload = row.expectedIP >= MIN_STANDARD_K_PROP_IP
    && row.expectedBF >= MIN_STANDARD_K_PROP_BF
    && row.projectedKs >= MIN_STANDARD_K_PROP_PROJECTED_KS;

  if (meetsStandardWorkload) {
    // Standard tier still requires the pre-existing minimum edge -- workload
    // sufficiency alone doesn't make every starter a "Top Over".
    const clearsStandardEdge = rawEdge != null && rawEdge >= MIN_STANDARD_EDGE;
    if (!clearsStandardEdge) {
      return excluded("INSUFFICIENT_EDGE_FOR_TOP_OVER", rawEdge, workloadScore);
    }
    return {
      eligible: true,
      tier: "standard",
      reason: null,
      workloadScore,
      rawEdge,
      adjustedRecommendationEdge: rawEdge == null ? null : Number((rawEdge * workloadScore).toFixed(2)),
    };
  }

  const hasEliteMatchupSignal = (row.opponentTeamKRate ?? 0) >= MIN_EXCEPTIONAL_OPPONENT_K_RATE
    || (row.strikeoutMatchupScore ?? 0) >= MIN_EXCEPTIONAL_MATCHUP_SCORE;

  const passesExceptionalOverride = row.expectedIP >= MIN_EXCEPTIONAL_IP
    && row.expectedBF >= MIN_EXCEPTIONAL_BF
    && row.projectedKs >= MIN_EXCEPTIONAL_PROJECTED_KS
    && rawEdge != null && rawEdge >= MIN_EXCEPTIONAL_EDGE
    && row.workloadConfidenceGrade === EXCEPTIONAL_REQUIRED_CONFIDENCE_GRADE
    && (row.workloadConfidenceScore ?? 0) >= MIN_EXCEPTIONAL_CONFIDENCE
    && (row.teamAdjustedKRate ?? 0) >= MIN_EXCEPTIONAL_TEAM_ADJUSTED_K_RATE
    && !hasBlockingWorkloadFlag(row.workloadFlags)
    && hasEliteMatchupSignal;

  if (passesExceptionalOverride) {
    return {
      eligible: true,
      tier: "exceptional-low-workload",
      reason: null,
      workloadScore,
      rawEdge,
      adjustedRecommendationEdge: rawEdge == null ? null : Number((rawEdge * workloadScore).toFixed(2)),
    };
  }

  return excluded("INSUFFICIENT_WORKLOAD_FOR_TOP_OVER", rawEdge, workloadScore);
}

/**
 * Top Under eligibility: does NOT require the standard minimum innings --
 * a low workload against a starter-sized line is itself a legitimate Under
 * thesis. Instead requires reliable role/workload/confidence data and a
 * meaningfully large negative edge. Pitchers who already meet the standard
 * workload thresholds get their existing (unchanged) behavior; the extra
 * scrutiny below applies only to pitchers who don't.
 */
export function evaluateKPropUnderRecommendation(row: KPropRecommendationInput): KPropRecommendationEvaluation {
  const workloadScore = computeWorkloadReliability(row.expectedIP, row.expectedBF);
  const rawEdge = row.projectedKs != null && row.kLine != null && Number.isFinite(row.projectedKs) && Number.isFinite(row.kLine)
    ? Number((row.projectedKs - row.kLine).toFixed(2))
    : null;

  if (row.publicRecommendationEligible === false) {
    return excluded("RECOMMENDATION_CANDIDATE_INELIGIBLE", rawEdge, workloadScore);
  }
  if (row.expectedIP == null || row.expectedBF == null || row.projectedKs == null || row.kLine == null) {
    return excluded("MISSING_WORKLOAD_DATA_FOR_TOP_UNDER", rawEdge, workloadScore);
  }

  const standard = (eligible: boolean): KPropRecommendationEvaluation => ({
    eligible,
    tier: eligible ? "standard" : "excluded",
    reason: eligible ? null : "INSUFFICIENT_EDGE_FOR_TOP_UNDER",
    workloadScore,
    rawEdge,
    adjustedRecommendationEdge: rawEdge == null ? null : Number((rawEdge * workloadScore).toFixed(2)),
  });

  const meetsStandardWorkload = row.expectedIP >= MIN_STANDARD_K_PROP_IP && row.expectedBF >= MIN_STANDARD_K_PROP_BF;
  if (meetsStandardWorkload) {
    // Existing behavior preserved: same pre-existing minimum edge as before this fix.
    return standard(rawEdge != null && rawEdge <= -MIN_STANDARD_EDGE);
  }

  if (!row.workloadRole) {
    return excluded("UNRELIABLE_ROLE_CLASSIFICATION_FOR_TOP_UNDER", rawEdge, workloadScore);
  }
  if (hasBlockingWorkloadFlag(row.workloadFlags)) {
    return excluded("UNRELIABLE_WORKLOAD_DATA_FOR_TOP_UNDER", rawEdge, workloadScore);
  }
  const gradeOk = row.workloadConfidenceGrade === "A" || row.workloadConfidenceGrade === "B";
  if (!gradeOk || (row.workloadConfidenceScore ?? 0) < MIN_LOW_WORKLOAD_UNDER_CONFIDENCE) {
    return excluded("INSUFFICIENT_CONFIDENCE_FOR_TOP_UNDER", rawEdge, workloadScore);
  }
  if (rawEdge == null || rawEdge > -MIN_LOW_WORKLOAD_UNDER_EDGE) {
    return excluded("INSUFFICIENT_EDGE_FOR_TOP_UNDER", rawEdge, workloadScore);
  }

  return standard(true);
}

export function evaluateKPropRecommendation(row: KPropRecommendationInput, side: KPropRecommendationSide): KPropRecommendationEvaluation {
  return side === "over" ? evaluateKPropOverRecommendation(row) : evaluateKPropUnderRecommendation(row);
}
