/**
 * WU4F.1 §13: defines (but does not wire into any pipeline) the downstream
 * evaluation contract for comparing archived shadow rushing predictions
 * against archived production predictions once games resolve.
 *
 * Critical invariant: both `productionCarries` and `shadowCarries` must
 * come from the IMMUTABLE archived pregame prediction row (WU1) --
 * `feature_snapshot.values.production_feature_snapshot`/`projection` for
 * production, `feature_snapshot.values.allocation_diagnostics.projectedCarries`
 * for shadow. Never recompute a historical shadow prediction after the
 * game using outcome data; that would be leakage into an evaluation meant
 * to prove the shadow model is real pregame skill.
 */

export interface ShadowVsProductionRow {
  playerId: string;
  gameId: string;
  season: number;
  week: number;
  /** From the archived row's own production projection -- never recomputed. */
  productionCarries: number;
  /** From the archived row's `allocation_diagnostics.projectedCarries` -- null if shadow was unavailable that week (see shadowAvailability.ts). */
  shadowCarries: number | null;
  /** Realised outcome, joined in AFTER the game from the immutable outcome archive -- never used to build either prediction above. */
  actualCarries: number;
  /**
   * WU4G: archived `allocation_diagnostics.roleConflictScore` -- the OLD
   * cross-position-biased allocator score (rank:<n> mixes QB and RB into
   * one training bucket -- see `rushingRoleConflictDiagnosticV2.ts`'s doc
   * comment). Retained ONLY for shadow-allocator/S5E provenance and
   * debugging. WU4G.2 §2: this field MUST NEVER be bucketed into
   * LOW/MEDIUM/HIGH forward-evaluation severity cohorts -- see
   * `rushingConflictLevel` below for the corrected field that does that.
   */
  roleConflictScore: number | null;
  /** WU4G: archived `allocation_diagnostics.roleConflictFlag` -- same OLD-score provenance caveat as `roleConflictScore`. Null when the shadow allocator did not cover this row. */
  roleConflictFlag: boolean | null;
  /** WU4G: archived `hard_case_flags.teamChanged` / role evidence, mirrored flat in the archive. */
  teamChanged: boolean | null;
  roleSourced: boolean;
  noHistory: boolean;
  depthRank: number | null;
  /** WU4G: archived `role.starter_flag`, present only when the role source disclosed it. */
  starterFlag: boolean | null;
  /** WU4G.2: row position -- determines whether the V2 conflict diagnostic is structurally expected (RB only; a QB/WR/TE rushing row never gets one -- see `rushingRoleConflictDiagnosticV2.ts`'s pool-scoped prior). */
  position: "QB" | "RB" | "WR" | "TE" | null;
  /**
   * WU4G.2 §6: the CORRECTED, pool-scoped severity from the archived
   * `rushing_role_conflict_v2.diagnostic.conflict_level` -- this, not
   * `roleConflictScore` above, is what `classifyRushingShadowCohorts` buckets
   * into LOW/MEDIUM/HIGH. Legitimately null for a real noHistory RB with an
   * otherwise-available diagnostic (see `rushingConflictDiagnosticAvailable`).
   */
  rushingConflictLevel: "low" | "medium" | "high" | null;
  /**
   * WU4G.2 §6: true only when the archived `rushing_role_conflict_v2` entry
   * itself is `{available: true, ...}` -- a genuine structural gap (no
   * fitted prior artifact, non-RB pool, no depth rank, no rank-prior
   * bucket). A noHistory RB with a legitimately null `rushingConflictLevel`
   * is STILL `rushingConflictDiagnosticAvailable: true`.
   */
  rushingConflictDiagnosticAvailable: boolean;
}

export interface ShadowVsProductionErrors {
  playerId: string;
  gameId: string;
  productionCarriesError: number;
  shadowCarriesError: number | null;
  productionShareError: number | null;
  shadowShareError: number | null;
  /** WU4G: signed (projection - actual) errors -- positive = over-projection. */
  signedProductionCarriesError: number;
  signedShadowCarriesError: number | null;
  /** WU4G: shadowCarriesError - productionCarriesError. Negative = shadow better; positive = production better. Null when shadow is unavailable. */
  shadowMinusProductionAbsoluteError: number | null;
}

/**
 * Pure, deterministic error calculation from already-archived pregame
 * predictions and an already-resolved outcome. Does not read or write any
 * file; callers own sourcing `rows` from the immutable archive and outcome
 * resolver.
 */
export function computeShadowVsProductionErrors(
  rows: readonly ShadowVsProductionRow[],
  actualShareOf: (row: ShadowVsProductionRow) => number | null,
  productionShareOf: (row: ShadowVsProductionRow) => number | null,
  shadowShareOf: (row: ShadowVsProductionRow) => number | null,
): ShadowVsProductionErrors[] {
  return rows.map((row) => {
    const actualShare = actualShareOf(row);
    const prodShare = productionShareOf(row);
    const shadShare = shadowShareOf(row);
    const signedProductionCarriesError = row.productionCarries - row.actualCarries;
    const signedShadowCarriesError = row.shadowCarries == null ? null : row.shadowCarries - row.actualCarries;
    const productionCarriesError = Math.abs(signedProductionCarriesError);
    const shadowCarriesError = signedShadowCarriesError == null ? null : Math.abs(signedShadowCarriesError);
    return {
      playerId: row.playerId,
      gameId: row.gameId,
      productionCarriesError,
      shadowCarriesError,
      productionShareError: actualShare == null || prodShare == null ? null : Math.abs(prodShare - actualShare),
      shadowShareError: actualShare == null || shadShare == null ? null : Math.abs(shadShare - actualShare),
      signedProductionCarriesError,
      signedShadowCarriesError,
      shadowMinusProductionAbsoluteError: shadowCarriesError == null ? null : shadowCarriesError - productionCarriesError,
    };
  });
}

/** WU4F.1 §14: cohort keys the future evaluation must be able to slice by. */
export type NflRushingEvaluationCohort =
  | "overall"
  | "week1"
  | "weeks1to4"
  | "teamChanged"
  | "sameTeam"
  | "sourcedStarter"
  | "sourcedBackup"
  | "noHistory"
  | "roleConflictLow"
  | "roleConflictMedium"
  | "roleConflictHigh"
  | "productionShadowOrderingDisagreement";

/**
 * WU4G.2 §1-2: classifies which cohorts one shadow-vs-production row
 * belongs to. No promotion/decision logic -- purely a slicing key,
 * mirroring `classifyReceivingRoleConflictCohorts`. Role-conflict severity
 * is read from `row.rushingConflictLevel` -- the archived
 * `rushing_role_conflict_v2` diagnostic (corrected, RB-pool-scoped
 * thresholds). It is NOT derived from `row.roleConflictScore` (the OLD
 * allocator score retained only for S5E/allocator provenance -- see that
 * field's doc comment for the cross-position bias it carries). A row with
 * `rushingConflictDiagnosticAvailable: false` never enters a severity
 * cohort, but still contributes to `overall` and every non-severity cohort.
 * `productionShadowOrderingDisagreement` fires when production over-projects
 * while shadow under-projects (or vice versa) against the same realised
 * actual -- i.e. the two models disagree on which direction the miss goes,
 * not merely on magnitude.
 */
export function classifyRushingShadowCohorts(row: ShadowVsProductionRow): NflRushingEvaluationCohort[] {
  const cohorts: NflRushingEvaluationCohort[] = ["overall"];
  if (row.week === 1) cohorts.push("week1");
  if (row.week <= 4) cohorts.push("weeks1to4");
  if (row.teamChanged === true) cohorts.push("teamChanged");
  if (row.teamChanged === false) cohorts.push("sameTeam");
  if (row.noHistory) cohorts.push("noHistory");
  if (row.roleSourced && row.starterFlag === true) cohorts.push("sourcedStarter");
  if (row.roleSourced && row.starterFlag === false) cohorts.push("sourcedBackup");
  if (row.rushingConflictLevel === "low") cohorts.push("roleConflictLow");
  if (row.rushingConflictLevel === "medium") cohorts.push("roleConflictMedium");
  if (row.rushingConflictLevel === "high") cohorts.push("roleConflictHigh");
  if (row.shadowCarries != null) {
    const productionSign = Math.sign(row.productionCarries - row.actualCarries);
    const shadowSign = Math.sign(row.shadowCarries - row.actualCarries);
    if (productionSign !== 0 && shadowSign !== 0 && productionSign !== shadowSign) {
      cohorts.push("productionShadowOrderingDisagreement");
    }
  }
  return cohorts;
}

export interface NflRushingCohortSummary {
  cohort: NflRushingEvaluationCohort;
  n: number;
  meanAbsoluteProductionCarriesError: number;
  meanAbsoluteShadowCarriesError: number;
  meanSignedProductionCarriesError: number;
  meanSignedShadowCarriesError: number;
  /** Count of rows in this cohort with a non-null shadow carries value. */
  shadowCoverageN: number;
}

/**
 * WU4G: aggregates one cohort's mean absolute/signed carries error for both
 * production and shadow, using archived errors only (never recomputed).
 * Mirrors `summarizeReceivingRoleConflictCohort`'s empty-cohort contract:
 * n=0 and NaN means rather than throwing.
 */
export function summarizeRushingShadowCohort(
  cohort: NflRushingEvaluationCohort,
  rows: readonly ShadowVsProductionRow[],
  errorsByPlayerGame: ReadonlyMap<string, ShadowVsProductionErrors>,
): NflRushingCohortSummary {
  const members = rows.filter((row) => classifyRushingShadowCohorts(row).includes(cohort));
  const errors = members
    .map((row) => errorsByPlayerGame.get(`${row.gameId}|${row.playerId}`))
    .filter((e): e is ShadowVsProductionErrors => e != null);
  const n = errors.length;
  const shadowErrors = errors.filter((e) => e.shadowCarriesError != null);
  const mean = (values: readonly number[]): number => (values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : NaN);
  return {
    cohort,
    n,
    meanAbsoluteProductionCarriesError: mean(errors.map((e) => e.productionCarriesError)),
    meanAbsoluteShadowCarriesError: mean(shadowErrors.map((e) => e.shadowCarriesError as number)),
    meanSignedProductionCarriesError: mean(errors.map((e) => e.signedProductionCarriesError)),
    meanSignedShadowCarriesError: mean(shadowErrors.map((e) => e.signedShadowCarriesError as number)),
    shadowCoverageN: shadowErrors.length,
  };
}

export type NflRushingPromotionReadinessStatus = "NOT_READY" | "READY_FOR_REVIEW";

export interface NflRushingPromotionReadiness {
  status: NflRushingPromotionReadinessStatus;
  /** Human-readable reasons the status is what it is -- never a promotion decision by itself. */
  reasons: string[];
  completedWeeks: number;
  overall: NflRushingCohortSummary;
  sameTeamStarterRegression: boolean;
  teamChangedImprovement: boolean | null;
  highConflictImprovement: boolean | null;
  /** null = coherence evidence unavailable (never treated as zero -- see `computeRushingPromotionReadiness`). */
  poolCoherenceFailureCount: number | null;
  materialShadowCoverageFailures: boolean;
  shadowCoverageRate: number | null;
  /** WU4G.2 §10: coverage of the archived `rushing_role_conflict_v2` diagnostic, computed ONLY over structurally-expected (RB-position) rows. */
  rushingConflictDiagnosticCoverageRate: number | null;
  materialConflictDiagnosticCoverageFailures: boolean;
}

const MIN_READINESS_WEEKS = 4;

/**
 * WU4G.2 §10: LOCKED at exact 100% -- never configurable, never silently
 * loosened. The prior 90% threshold was an unlocked default that this WU
 * corrects: the locked intent has always been zero operational
 * shadow-coverage failures across the evaluation window. A shadow-coverage
 * gap is an operational fact (the allocator didn't run, or failed for a
 * team) that must be fixed, not tolerated at a rate.
 */
const REQUIRED_SHADOW_COVERAGE_RATE = 1;
/** WU4G.2 §10: same locked-100% intent for the corrected V2 conflict diagnostic, scoped to rows where it structurally applies (RB position). */
const REQUIRED_CONFLICT_DIAGNOSTIC_COVERAGE_RATE = 1;

/**
 * WU4G.2 §13: a non-binding readiness signal, never a promotion action. Every
 * gate is descriptive; a human reviews `reasons` and decides. Requires (all
 * must hold for READY_FOR_REVIEW):
 *  - at least 4 completed weeks of data
 *  - shadow carries MAE < production carries MAE (overall)
 *  - no material sameTeam + sourcedStarter regression (shadow MAE must not
 *    exceed production MAE by more than `regressionToleranceCarries` in that cohort)
 *  - shadow MAE improves over production in the teamChanged and
 *    roleConflictHigh cohorts (when those cohorts have data)
 *  - affirmative pool-coherence evidence of zero failures (WU4G.1 §3:
 *    `null`/`undefined` -- coherence was never measured for this run -- is
 *    NEVER treated as zero and always forces NOT_READY; only an explicit
 *    `0` may pass this gate)
 *  - shadow coverage rate of EXACTLY 100% across final-selected rushing rows
 *    (WU4G.2 §10 -- locked, not configurable)
 *  - rushing conflict-diagnostic coverage rate of EXACTLY 100% among
 *    structurally-expected (RB-position) rows (WU4G.2 §10 -- a legitimate
 *    noHistory null severity still counts as covered; only a genuine
 *    `rushingConflictDiagnosticAvailable: false` counts against this gate)
 */
export function computeRushingPromotionReadiness(input: {
  completedWeeks: number;
  rows: readonly ShadowVsProductionRow[];
  errorsByPlayerGame: ReadonlyMap<string, ShadowVsProductionErrors>;
  /** Required, and deliberately not defaulted: `null` means "unknown" and must gate NOT_READY, never silently pass as if it were zero. */
  poolCoherenceFailureCount: number | null;
  regressionToleranceCarries?: number;
}): NflRushingPromotionReadiness {
  const regressionTolerance = input.regressionToleranceCarries ?? 0.25;
  const reasons: string[] = [];

  const overall = summarizeRushingShadowCohort("overall", input.rows, input.errorsByPlayerGame);
  const sameTeamStarter = summarizeRushingShadowCohort("sourcedStarter", input.rows.filter((r) => r.teamChanged === false), input.errorsByPlayerGame);
  const teamChanged = summarizeRushingShadowCohort("teamChanged", input.rows, input.errorsByPlayerGame);
  const highConflict = summarizeRushingShadowCohort("roleConflictHigh", input.rows, input.errorsByPlayerGame);

  if (input.completedWeeks < MIN_READINESS_WEEKS) {
    reasons.push(`Only ${input.completedWeeks} completed week(s); minimum ${MIN_READINESS_WEEKS} required.`);
  }
  if (overall.n === 0 || Number.isNaN(overall.meanAbsoluteShadowCarriesError)) {
    reasons.push("No shadow-covered rows in the overall cohort.");
  } else if (!(overall.meanAbsoluteShadowCarriesError < overall.meanAbsoluteProductionCarriesError)) {
    reasons.push("Overall shadow carries MAE does not improve on production carries MAE.");
  }

  const sameTeamStarterRegression =
    sameTeamStarter.n > 0 && !Number.isNaN(sameTeamStarter.meanAbsoluteShadowCarriesError) &&
    sameTeamStarter.meanAbsoluteShadowCarriesError > sameTeamStarter.meanAbsoluteProductionCarriesError + regressionTolerance;
  if (sameTeamStarterRegression) {
    reasons.push("Material regression in sameTeam sourced-starter cohort (shadow MAE exceeds production MAE beyond tolerance).");
  }

  const teamChangedImprovement =
    teamChanged.n === 0 || Number.isNaN(teamChanged.meanAbsoluteShadowCarriesError) ? null
      : teamChanged.meanAbsoluteShadowCarriesError < teamChanged.meanAbsoluteProductionCarriesError;
  if (teamChangedImprovement === false) reasons.push("Shadow does not improve on production in the teamChanged cohort.");

  const highConflictImprovement =
    highConflict.n === 0 || Number.isNaN(highConflict.meanAbsoluteShadowCarriesError) ? null
      : highConflict.meanAbsoluteShadowCarriesError < highConflict.meanAbsoluteProductionCarriesError;
  if (highConflictImprovement === false) reasons.push("Shadow does not improve on production in the roleConflictHigh cohort.");

  if (input.poolCoherenceFailureCount == null) {
    reasons.push("Pool coherence evidence unavailable (not persisted per row); readiness cannot be confirmed.");
  } else if (input.poolCoherenceFailureCount > 0) {
    reasons.push(`${input.poolCoherenceFailureCount} pool-coherence failure(s) detected.`);
  }

  const shadowCoverageRate = overall.n > 0 ? overall.shadowCoverageN / overall.n : null;
  const materialShadowCoverageFailures = shadowCoverageRate != null && shadowCoverageRate < REQUIRED_SHADOW_COVERAGE_RATE;
  if (overall.n === 0) {
    reasons.push("No final-selected rushing rows to evaluate shadow coverage.");
  } else if (materialShadowCoverageFailures) {
    reasons.push(`Shadow coverage rate ${((shadowCoverageRate as number) * 100).toFixed(1)}% is below the required 100%.`);
  }

  const structurallyExpected = input.rows.filter((row) => row.position === "RB");
  const diagnosticCovered = structurallyExpected.filter((row) => row.rushingConflictDiagnosticAvailable).length;
  const rushingConflictDiagnosticCoverageRate = structurallyExpected.length > 0 ? diagnosticCovered / structurallyExpected.length : null;
  const materialConflictDiagnosticCoverageFailures =
    rushingConflictDiagnosticCoverageRate != null && rushingConflictDiagnosticCoverageRate < REQUIRED_CONFLICT_DIAGNOSTIC_COVERAGE_RATE;
  if (materialConflictDiagnosticCoverageFailures) {
    reasons.push(`Rushing conflict-diagnostic coverage rate ${((rushingConflictDiagnosticCoverageRate as number) * 100).toFixed(1)}% is below the required 100% among RB rows.`);
  }

  const status: NflRushingPromotionReadinessStatus = reasons.length === 0 ? "READY_FOR_REVIEW" : "NOT_READY";
  return {
    status, reasons, completedWeeks: input.completedWeeks, overall, sameTeamStarterRegression,
    teamChangedImprovement, highConflictImprovement,
    poolCoherenceFailureCount: input.poolCoherenceFailureCount, materialShadowCoverageFailures,
    shadowCoverageRate, rushingConflictDiagnosticCoverageRate, materialConflictDiagnosticCoverageFailures,
  };
}
