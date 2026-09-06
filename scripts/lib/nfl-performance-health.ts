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
// WORKFLOW
// -------------------------------------------------------------------------

export type WorkflowHealthSection = {
  generated_at_by_artifact: Record<string, string | null>;
};

export function buildWorkflowHealthSection(generatedAtByArtifact: Record<string, string | null>): WorkflowHealthSection {
  return { generated_at_by_artifact: { ...generatedAtByArtifact } };
}
