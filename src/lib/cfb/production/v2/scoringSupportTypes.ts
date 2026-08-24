// CFB Model V2 — production-owned types for the compact historical scoring
// support artifacts (WU3A). This module has ZERO runtime dependency on
// src/lib/cfb/research/** — it only describes the shape of the frozen,
// offline-generated JSON produced by scripts/cfb-v2-support-export.ts (an
// OFFLINE tool, never imported from here or anywhere under production/v2/).
//
// teamId/opponentTeamId in these rows are CFBD EXTERNAL numeric team ids
// (research's own `externalTeamId` convention — see
// research/phase8/scheduleGraph.ts etc.), NOT WU2's canonical JKB team ids.
// A future join step (WU3, when building actual game projections) must map
// between them using the same team-roster resolution WU2's
// `resolveCfbdFbsTeams` already performs — this module does not attempt
// that join, only describes the frozen support data as-is.

/** Matches scripts/cfb-v2-support-export.ts's SCORING_ARTIFACT_VERSION — update both together. Revised (WU3A scoring-artifact-shape directive) from the superseded one-row-per-game "cfb-v2-scoring-training-2020-2025-v1" representation, which was proven NOT to reproduce Phase 8/9's fitted coefficients — see scoringSupportTypes' CfbV2ScoringNormalEquationSnapshot doc below. */
export const CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION = "cfb-v2-scoring-normal-equations-2020-2025-v1" as const;
/** Matches scripts/cfb-v2-support-export.ts's CALIBRATION_ARTIFACT_VERSION — update both together. */
export const CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION = "cfb-v2-calibration-residual-seed-2020-2025-v1" as const;

export const CFB_V2_SUPPORT_DIR = "data/cfb/v2-support" as const;

export function cfbV2ScoringNormalEquationsPath(): string {
  return `${CFB_V2_SUPPORT_DIR}/scoring-normal-equations-2020-2025.json`;
}

export function cfbV2CalibrationResidualSeedPath(): string {
  return `${CFB_V2_SUPPORT_DIR}/calibration-residual-seed-2020-2025.json`;
}

/**
 * Generic envelope both support artifacts share (matches
 * scripts/cfb-v2-support-export.ts's SupportEnvelope<T> exactly).
 */
export type CfbV2HistoricalSupportEnvelope<T> = {
  schemaVersion: string;
  artifactVersion: string;
  modelVersion: string;
  /** WU1's frozen CFB_V2_CONFIG_VERSION at export time — must match the currently-running production config or the artifact is stale (§17 "config hash mismatch"). */
  configVersion: string;
  /** research/phase9/config.ts's CFB_RESEARCH_PHASE9_VERSION at export time. */
  phase9CandidateVersion: string;
  sourceSeasonStart: number;
  sourceSeasonEnd: number;
  generatedAt: string;
  generatorVersion: string;
  recordCount: number;
  contentHash: string;
  marketFree: true;
  records: readonly T[];
};

/**
 * One (season, week) as-of cutoff's ACCUMULATED normal-equation state for
 * the frozen scoring ridge regression (Phase 10 §11/WU3A scoring-artifact-
 * shape directive). Reconstructing `solveLinearSystem(ata + lambda*I, atb)`
 * (production/v2/linearSolver.ts) reproduces the exact coefficient vector
 * research/phase4/scoringRegression.ts's `fitScoringModel` would compute at
 * this same cutoff — see scripts/cfb-v2-support-export.ts's file header for
 * why this is mathematically exact (not an approximation) despite storing
 * no individual training rows.
 *
 * SUPERSEDES the original WU3A "one row per team-side per game"
 * representation (CfbV2ScoringTrainingObservation), which
 * phase9CoefficientParity.test.ts proved does NOT reproduce Phase 8/9's own
 * fitted coefficients (deltas up to ~35 points on the intercept) — that
 * type/artifact no longer exists.
 *
 * season=2026/week=1 is a synthetic trailing boundary snapshot (see the
 * offline generator) representing the frozen historical support state a
 * real 2026 weekly production fit should combine with live 2026
 * observations — unlike every other snapshot, it is a documented
 * same-method EXTRAPOLATION one step past the last season Phase 9 itself
 * ever tests, not a value with direct Phase 8/9 parity coverage.
 */
export type CfbV2ScoringNormalEquationSnapshot = {
  season: number;
  week: number;
  /** ["intercept","scoringEnvironment","offenseRating","defenseRatingAllowed","hfa","SUCCESS_own","SUCCESS_opponentAllowed"] — matches research/phase4/scoringRegression.ts's buildFeatureColumns output for the frozen NATIONAL/BLENDED_CURRENT/pace=NONE/secondary=[SUCCESS] config. Stored per-record so a future config change is self-describing. */
  featureNames: readonly string[];
  /** Symmetric featureNames.length x featureNames.length accumulated X'X — BEFORE the ridge penalty (applied at reconstruction time using the live production scoringRidgeLambda, not baked into the frozen snapshot). */
  ata: readonly (readonly number[])[];
  /** Accumulated X'y, length featureNames.length. */
  atb: readonly number[];
  /** Count of usable (all-features-finite) rows folded into this snapshot — mirrors fitScoringModel's own `usable.length` at this cutoff. */
  usableRowCount: number;
};

/**
 * One row per FBS-vs-FBS game, seeding both TOTAL_ONLY linear calibration
 * and the empirical residual bootstrap pool. Reused directly from Phase 9's
 * own validated `calibrated` walk-forward output (not a re-derivation).
 */
export type CfbV2CalibrationResidualSeedRow = {
  gameId: string;
  season: number;
  week: number;
  rawExpectedHomePoints: number;
  rawExpectedAwayPoints: number;
  rawProjectedMargin: number;
  rawProjectedTotal: number;
  calibratedExpectedHomePoints: number;
  calibratedExpectedAwayPoints: number;
  calibratedTotal: number;
  actualHomePoints: number;
  actualAwayPoints: number;
  actualTotal: number;
  /** actualHomePoints - calibratedExpectedHomePoints. */
  homeResidual: number;
  /** actualAwayPoints - calibratedExpectedAwayPoints. */
  awayResidual: number;
};

export type CfbV2ScoringNormalEquationsArtifact = CfbV2HistoricalSupportEnvelope<CfbV2ScoringNormalEquationSnapshot>;
export type CfbV2CalibrationResidualSeedArtifact = CfbV2HistoricalSupportEnvelope<CfbV2CalibrationResidualSeedRow>;

/** True chronological cutoff predicate shared by both artifacts — a row is eligible strictly before (season, week). */
export function isEligibleBeforeCutoff(row: { season: number; week: number }, season: number, week: number): boolean {
  return row.season < season || (row.season === season && row.week < week);
}
