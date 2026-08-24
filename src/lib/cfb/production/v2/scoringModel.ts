// CFB Model V2 — production scoring-model reconstruction from WU3A's frozen
// normal-equation snapshots (WU3 §4/§5). Zero runtime dependency on
// src/lib/cfb/research/**.
//
// research/phase4/scoringRegression.ts's `fitScoringModel` solves
// (X'X + lambda*I) \ X'y via Gaussian elimination, with a fallback when
// usable.length < nParams + 2 (predict the training mean via intercept
// only, all other coefficients zero). Both branches are exactly
// reconstructible from (ata, atb, usableRowCount) alone:
//   - normal branch: solveLinearSystem(ata + lambda*I on i>=1, atb)
//   - fallback branch: atb[0] (= sum of actualPoints, since column 0 is
//     the constant-1 intercept column) divided by usableRowCount is
//     exactly the training mean fitScoringModel computes.

import { solveLinearSystem } from "./linearSolver";
import type { CfbV2ScoringNormalEquationSnapshot, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import { validateCfbV2ScoringNormalEquations } from "./scoringSupportValidation";

export const CFB_V2_SCORING_FEATURE_NAMES = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"] as const;

export type CfbV2ScoringFeatureVector = {
  offenseRating: number;
  opponentDefenseRating: number;
  /** +1 home, -1 away, 0 neutral site — NATIONAL HFA only (§6). */
  hfa: -1 | 0 | 1;
  scoringEnvironmentEstimate: number;
  successOwn: number;
  successOpponentAllowed: number;
};

export class CfbV2ScoringModelError extends Error {}

function cloneMatrix(m: readonly (readonly number[])[]): number[][] {
  return m.map((row) => [...row]);
}

/**
 * Selects the frozen historical snapshot whose as-of identity is the
 * latest one at or before (season, week) — i.e. the exact training-pool
 * state fitScoringModel would have used to predict games at that cutoff,
 * per WU3A's snapshot semantics (a snapshot at (S, W) already represents
 * every eligible game strictly before (S, W)). Throws if no eligible
 * snapshot exists (cutoff before the artifact's first snapshot).
 */
export function selectCfbV2ScoringSnapshot(artifact: CfbV2ScoringNormalEquationsArtifact, season: number, week: number): CfbV2ScoringNormalEquationSnapshot {
  let best: CfbV2ScoringNormalEquationSnapshot | null = null;
  for (const snapshot of artifact.records) {
    if (snapshot.season < season || (snapshot.season === season && snapshot.week <= week)) {
      if (best === null || snapshot.season > best.season || (snapshot.season === best.season && snapshot.week > best.week)) best = snapshot;
    }
  }
  if (best === null) {
    throw new CfbV2ScoringModelError(`no eligible scoring normal-equation snapshot at or before ${season}/wk${week} — artifact covers ${artifact.sourceSeasonStart}-${artifact.sourceSeasonEnd}`);
  }
  return best;
}

export type CfbV2FittedScoringModel = {
  featureNames: readonly string[];
  coefficients: readonly number[];
  usableRowCount: number;
};

/**
 * Solves the ridge system for one snapshot, applying the LIVE production
 * scoringRidgeLambda (never baked into the frozen artifact — see
 * scoringSupportTypes.ts's CfbV2ScoringNormalEquationSnapshot doc) —
 * matches fitScoringModel's own `for (i=1..) ata[i][i] += lambda` (no
 * penalty on the intercept column, index 0).
 */
export function solveCfbV2ScoringModel(snapshot: CfbV2ScoringNormalEquationSnapshot, scoringRidgeLambda: number): CfbV2FittedScoringModel {
  const n = snapshot.featureNames.length;
  const nParams = n; // featureNames already includes "intercept" at index 0

  if (snapshot.usableRowCount < nParams + 2) {
    // Exact reconstruction of fitScoringModel's low-data fallback: predict
    // the training mean via intercept only. atb[0] = sum(actualPoints)
    // since column 0 (the intercept feature) is the constant 1.
    const coefficients = new Array(n).fill(0);
    if (snapshot.usableRowCount > 0) coefficients[0] = snapshot.atb[0] / snapshot.usableRowCount;
    return { featureNames: snapshot.featureNames, coefficients, usableRowCount: snapshot.usableRowCount };
  }

  const ata = cloneMatrix(snapshot.ata);
  for (let i = 1; i < nParams; i += 1) ata[i][i] += scoringRidgeLambda;
  const coefficients = solveLinearSystem(ata, snapshot.atb);
  return { featureNames: snapshot.featureNames, coefficients, usableRowCount: snapshot.usableRowCount };
}

/**
 * Predicts one team-side's expected points from a fitted model + feature
 * vector — mirrors predictScore's linear combination exactly. Returns
 * null if any required feature is missing (never imputed), matching
 * fitScoringModel/predictScore's own "row missing a feature -> null"
 * discipline (WU3 §8/§23 "missing SUCCESS where required").
 */
export function predictCfbV2Score(model: CfbV2FittedScoringModel, features: CfbV2ScoringFeatureVector | null): number | null {
  if (features === null) return null;
  const x = [1, features.scoringEnvironmentEstimate, features.offenseRating, features.opponentDefenseRating, features.hfa, features.successOwn, features.successOpponentAllowed];
  if (x.some((v) => !Number.isFinite(v))) return null;
  let prediction = 0;
  for (let i = 0; i < x.length; i += 1) prediction += model.coefficients[i] * x[i];
  return prediction;
}

/** Loads + fail-closed validates a scoring normal-equations artifact against the live config hash (§22). */
export function loadAndValidateCfbV2ScoringNormalEquations(artifact: CfbV2ScoringNormalEquationsArtifact, expectedConfigVersion: string): void {
  validateCfbV2ScoringNormalEquations(artifact, expectedConfigVersion);
}
