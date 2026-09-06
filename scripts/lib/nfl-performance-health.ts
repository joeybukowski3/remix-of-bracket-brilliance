/**
 * WU4 -- pure status-computation core for the NFL performance-health
 * artifact (public/data/nfl/performance/health.json).
 *
 * Health here is OPERATIONAL status, not predictive performance: it never
 * looks at MAE, hit rate, or any accuracy metric. Every section-builder
 * below is a pure function over already-extracted counts/timestamps -- see
 * generate-nfl-performance-health.ts for the file-reading/extraction logic
 * itself (repo artifacts only; this pipeline never queries GitHub live).
 */

export type HealthStatus = "HEALTHY" | "DEGRADED" | "STALE" | "NOT_AVAILABLE" | "NOT_IMPLEMENTED";

/**
 * Deterministic status rule shared by every family section:
 *  - NOT_AVAILABLE: the family has no artifact/ledger data to assess at all.
 *  - STALE: the artifact is older than its staleness threshold -- checked
 *    before backlog/missing so a stale-but-otherwise-clean artifact is never
 *    misreported as HEALTHY.
 *  - DEGRADED: a genuine unresolved-final backlog or missing-row gap exists.
 *    A game that simply hasn't kicked off yet, or a stat correction window
 *    still open, is NOT a backlog -- callers must only pass counts that
 *    already exclude expected-pregame incompleteness (see
 *    EXPECTED_NOT_YET_AVAILABLE handling in the section builders below).
 *  - HEALTHY: none of the above.
 */
export function computeFamilyStatus(input: {
  artifactExists: boolean;
  ageMs: number | null;
  staleThresholdMs: number;
  backlogCount: number;
  missingCount: number;
}): HealthStatus {
  if (!input.artifactExists) return "NOT_AVAILABLE";
  if (input.ageMs != null && input.ageMs > input.staleThresholdMs) return "STALE";
  if (input.backlogCount > 0) return "DEGRADED";
  if (input.missingCount > 0) return "DEGRADED";
  return "HEALTHY";
}

/** Daily-cadence families (totals/props postgame regeneration, sides ledger refresh) get the same staleness allowance: one missed daily run plus a buffer, never a same-day false STALE. */
export const DAILY_ARTIFACT_STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000;

// -------------------------------------------------------------------------
// TOTALS
// -------------------------------------------------------------------------

export type TotalsHealthSection = {
  status: HealthStatus;
  latest_prediction_timestamp: string | null;
  latest_generation_timestamp: string | null;
  expected_games: number;
  archived_games: number;
  missing_team_total_rows: number;
  duplicate_prediction_ids: number;
  unresolved_completed_games: number;
  model_versions_seen: string[];
  fitted_hashes_seen: string[];
  public_artifact_age_ms: number | null;
};

export function buildTotalsHealthSection(input: {
  artifactExists: boolean;
  latestPredictionTimestamp: string | null;
  latestGenerationTimestamp: string | null;
  expectedGames: number;
  archivedGames: number;
  duplicatePredictionIds: number;
  unresolvedCompletedGames: number;
  modelVersionsSeen: string[];
  fittedHashesSeen: string[];
  publicArtifactAgeMs: number | null;
}): TotalsHealthSection {
  const missingTeamTotalRows = Math.max(0, input.expectedGames - input.archivedGames);
  const status = computeFamilyStatus({
    artifactExists: input.artifactExists,
    ageMs: input.publicArtifactAgeMs,
    staleThresholdMs: DAILY_ARTIFACT_STALE_THRESHOLD_MS,
    backlogCount: input.unresolvedCompletedGames + input.duplicatePredictionIds,
    missingCount: missingTeamTotalRows,
  });
  return {
    status,
    latest_prediction_timestamp: input.latestPredictionTimestamp,
    latest_generation_timestamp: input.latestGenerationTimestamp,
    expected_games: input.expectedGames,
    archived_games: input.archivedGames,
    missing_team_total_rows: missingTeamTotalRows,
    duplicate_prediction_ids: input.duplicatePredictionIds,
    unresolved_completed_games: input.unresolvedCompletedGames,
    model_versions_seen: input.modelVersionsSeen,
    fitted_hashes_seen: input.fittedHashesSeen,
    public_artifact_age_ms: input.publicArtifactAgeMs,
  };
}

// -------------------------------------------------------------------------
// PROPS
// -------------------------------------------------------------------------

export type PropsHealthSection = {
  status: HealthStatus;
  latest_passing_prediction_timestamp: string | null;
  latest_rushing_prediction_timestamp: string | null;
  latest_receiving_prediction_timestamp: string | null;
  starter_cohort_row_count: number;
  expected_starter_slot_count: number;
  missing_starter_slots: number;
  starter_prop_evaluation_row_count: number;
  unresolved_final_games: number;
  missing_comparison_line_count: number;
  player_outcome_backlog: number;
  model_versions_seen: string[];
  fitted_hashes_seen: string[];
  public_artifact_age_ms: number | null;
};

export function buildPropsHealthSection(input: {
  artifactExists: boolean;
  latestPassingPredictionTimestamp: string | null;
  latestRushingPredictionTimestamp: string | null;
  latestReceivingPredictionTimestamp: string | null;
  starterCohortRowCount: number;
  missingStarterSlots: number;
  starterPropEvaluationRowCount: number;
  unresolvedFinalGames: number;
  missingComparisonLineCount: number;
  playerOutcomeBacklog: number;
  modelVersionsSeen: string[];
  fittedHashesSeen: string[];
  publicArtifactAgeMs: number | null;
}): PropsHealthSection {
  const status = computeFamilyStatus({
    artifactExists: input.artifactExists,
    ageMs: input.publicArtifactAgeMs,
    staleThresholdMs: DAILY_ARTIFACT_STALE_THRESHOLD_MS,
    backlogCount: input.unresolvedFinalGames,
    missingCount: input.missingStarterSlots,
  });
  return {
    status,
    latest_passing_prediction_timestamp: input.latestPassingPredictionTimestamp,
    latest_rushing_prediction_timestamp: input.latestRushingPredictionTimestamp,
    latest_receiving_prediction_timestamp: input.latestReceivingPredictionTimestamp,
    starter_cohort_row_count: input.starterCohortRowCount,
    expected_starter_slot_count: input.starterCohortRowCount + input.missingStarterSlots,
    missing_starter_slots: input.missingStarterSlots,
    starter_prop_evaluation_row_count: input.starterPropEvaluationRowCount,
    unresolved_final_games: input.unresolvedFinalGames,
    missing_comparison_line_count: input.missingComparisonLineCount,
    player_outcome_backlog: input.playerOutcomeBacklog,
    model_versions_seen: input.modelVersionsSeen,
    fitted_hashes_seen: input.fittedHashesSeen,
    public_artifact_age_ms: input.publicArtifactAgeMs,
  };
}

// -------------------------------------------------------------------------
// SIDES
// -------------------------------------------------------------------------

export type SidesHealthSection = {
  status: HealthStatus;
  latest_spread_prediction_timestamp: string | null;
  latest_spread_evaluation_timestamp: string | null;
  latest_sides_artifact_generation_timestamp: string | null;
  model_versions_seen: string[];
  unresolved_final_games: number;
  sides_artifact_graded_games: number;
  sides_artifact_age_ms: number | null;
  public_performance_view_status: HealthStatus;
};

/**
 * WU6: sides now has a dedicated public artifact
 * (public/data/nfl/performance/sides.json). `status` still reflects the
 * upstream ledger/evaluation freshness + backlog (the plumbing that feeds
 * the artifact); `public_performance_view_status` reflects the artifact
 * itself -- NOT_AVAILABLE until it is first generated, STALE past the daily
 * threshold, otherwise HEALTHY.
 */
export function buildSidesHealthSection(input: {
  ledgerExists: boolean;
  latestSpreadPredictionTimestamp: string | null;
  latestSpreadEvaluationTimestamp: string | null;
  evaluationAgeMs: number | null;
  modelVersionsSeen: string[];
  unresolvedFinalGames: number;
  sidesArtifactExists: boolean;
  sidesArtifactGenerationTimestamp: string | null;
  sidesArtifactGradedGames: number;
  sidesArtifactAgeMs: number | null;
}): SidesHealthSection {
  const status = computeFamilyStatus({
    artifactExists: input.ledgerExists,
    ageMs: input.evaluationAgeMs,
    staleThresholdMs: DAILY_ARTIFACT_STALE_THRESHOLD_MS,
    backlogCount: input.unresolvedFinalGames,
    missingCount: 0,
  });
  const viewStatus: HealthStatus = !input.sidesArtifactExists
    ? "NOT_AVAILABLE"
    : input.sidesArtifactAgeMs != null && input.sidesArtifactAgeMs > DAILY_ARTIFACT_STALE_THRESHOLD_MS
      ? "STALE"
      : "HEALTHY";
  return {
    status,
    latest_spread_prediction_timestamp: input.latestSpreadPredictionTimestamp,
    latest_spread_evaluation_timestamp: input.latestSpreadEvaluationTimestamp,
    latest_sides_artifact_generation_timestamp: input.sidesArtifactGenerationTimestamp,
    model_versions_seen: input.modelVersionsSeen,
    unresolved_final_games: input.unresolvedFinalGames,
    sides_artifact_graded_games: input.sidesArtifactGradedGames,
    sides_artifact_age_ms: input.sidesArtifactAgeMs,
    public_performance_view_status: viewStatus,
  };
}

// -------------------------------------------------------------------------
// COACHING (Coaching Rating v1 — ANALYSIS CONTEXT ONLY)
// -------------------------------------------------------------------------

/** Coaching display/context artifacts regenerate on the same daily postgame cadence. */
export const COACHING_ARTIFACT_STALE_AFTER_HOURS = 36;

export type CoachingHealthSection = {
  status: HealthStatus;
  rating_version: string | null;
  artifact_generated_at: string | null;
  source_cutoff: string | null;
  current_coach_count: number;
  unrated_coach_count: number;
  small_sample_coach_count: number;
  first_year_count: number;
  historical_snapshot_coverage: number;
  latest_snapshot_season: number | null;
  latest_snapshot_week: number | null;
  stale_after_hours: number;
  public_artifact_age_ms: number | null;
};

/**
 * Coaching-rating operational status. First-year / small-sample coaches are
 * a normal, expected state (Coaching Rating v1 is deliberately low dynamic
 * range) and NEVER a failure. What degrades:
 *   - the current-ratings artifact missing entirely -> NOT_AVAILABLE;
 *   - it being older than the daily staleness allowance -> STALE;
 *   - teams with no rated current coach (unrated_coach_count > 0) -> DEGRADED;
 *   - no historical snapshot coverage at all -> DEGRADED.
 */
export function buildCoachingHealthSection(input: {
  currentArtifactExists: boolean;
  ratingVersion: string | null;
  artifactGeneratedAt: string | null;
  sourceCutoff: string | null;
  expectedTeamCount: number;
  ratedTeamCount: number;
  smallSampleCoachCount: number;
  firstYearCoachCount: number;
  historicalSnapshotFileCount: number;
  latestSnapshotSeason: number | null;
  latestSnapshotWeek: number | null;
  publicArtifactAgeMs: number | null;
}): CoachingHealthSection {
  const unratedCoachCount = Math.max(0, input.expectedTeamCount - input.ratedTeamCount);
  const status = computeFamilyStatus({
    artifactExists: input.currentArtifactExists,
    ageMs: input.publicArtifactAgeMs,
    staleThresholdMs: COACHING_ARTIFACT_STALE_AFTER_HOURS * 60 * 60 * 1000,
    backlogCount: unratedCoachCount,
    missingCount: input.historicalSnapshotFileCount > 0 ? 0 : 1,
  });
  return {
    status,
    rating_version: input.ratingVersion,
    artifact_generated_at: input.artifactGeneratedAt,
    source_cutoff: input.sourceCutoff,
    current_coach_count: input.ratedTeamCount,
    unrated_coach_count: unratedCoachCount,
    small_sample_coach_count: input.smallSampleCoachCount,
    first_year_count: input.firstYearCoachCount,
    historical_snapshot_coverage: input.historicalSnapshotFileCount,
    latest_snapshot_season: input.latestSnapshotSeason,
    latest_snapshot_week: input.latestSnapshotWeek,
    stale_after_hours: COACHING_ARTIFACT_STALE_AFTER_HOURS,
    public_artifact_age_ms: input.publicArtifactAgeMs,
  };
}

// -------------------------------------------------------------------------
// WORKFLOW
// -------------------------------------------------------------------------

export type WorkflowHealthSection = {
  generated_at_by_artifact: Record<string, string | null>;
};

export function buildWorkflowHealthSection(generatedAtByArtifact: Record<string, string | null>): WorkflowHealthSection {
  return { generated_at_by_artifact: { ...generatedAtByArtifact } };
}
