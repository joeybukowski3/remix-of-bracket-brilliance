/**
 * NFL projected game total -- v1 production ridge fit/score.
 *
 * Follows WU4A's established convention (`teamOpportunityModel.ts`): the
 * ridge is refit deterministically at generation time from a fixed
 * training-season window (2022-2024, `NFL_TOTAL_TRAINING_SEASONS`), not
 * loaded from a frozen serialized artifact -- the fitted-state hash
 * (`fitted_model_hash` in the prediction archive) makes each run's exact
 * inputs verifiable without needing a separate frozen-snapshot file
 * format. This mirrors WU4A rather than the CFB v2 frozen-normal-equation
 * pattern because WU4A is the direct in-repo NFL precedent and the
 * training corpus here (2022-2024 team-games) is small enough that
 * refitting at run time is cheap and fully deterministic given the same
 * committed input cache.
 *
 * Reuses `src/lib/nfl/props/ridge.ts`'s closed-form solver verbatim --
 * the same helper every other ridge-based NFL model (WU4A, passing,
 * rushing) already uses.
 */
import { createHash } from "node:crypto";
import { fitRidgeModel, scoreRidgeModel, type FittedRidgeModel } from "@/lib/nfl/props/ridge";
import { NFL_TOTAL_FEATURE_NAMES, NFL_TOTAL_RIDGE_LAMBDA, NFL_TOTAL_MODEL_VERSION, NFL_TOTAL_TRAINING_SEASONS } from "./totalsModelContract";
import { toOrderedFeatureVector, type NflTotalSideFeatures } from "./totalsFeatures";

export type NflTotalTrainingRow = { features: NflTotalSideFeatures; actualTeamPoints: number };

export type NflTotalFittedModel = {
  modelVersion: typeof NFL_TOTAL_MODEL_VERSION;
  trainingSeasons: readonly number[];
  lambda: number;
  featureNames: readonly string[];
  ridge: FittedRidgeModel;
  trainRowCount: number;
  fittedModelHash: string;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fitNflTotalModel(trainingRows: readonly NflTotalTrainingRow[]): NflTotalFittedModel {
  const usable = trainingRows.map((r) => ({ vector: toOrderedFeatureVector(r.features), target: r.actualTeamPoints })).filter((r): r is { vector: readonly number[]; target: number } => r.vector !== null);
  if (usable.length === 0) {
    throw new Error("fitNflTotalModel: zero usable training rows -- refusing to silently produce an unfittable model.");
  }
  const ridge = fitRidgeModel(usable.map((r) => [...r.vector]), usable.map((r) => r.target), NFL_TOTAL_RIDGE_LAMBDA);
  const hashInput = stableStringify({ modelVersion: NFL_TOTAL_MODEL_VERSION, trainingSeasons: NFL_TOTAL_TRAINING_SEASONS, lambda: NFL_TOTAL_RIDGE_LAMBDA, featureNames: NFL_TOTAL_FEATURE_NAMES, coefficients: ridge.coefficients, intercept: ridge.intercept, featureMeans: ridge.featureMeans, featureStds: ridge.featureStds, trainRowCount: usable.length });
  const fittedModelHash = `sha256:${createHash("sha256").update(hashInput).digest("hex")}`;
  return { modelVersion: NFL_TOTAL_MODEL_VERSION, trainingSeasons: NFL_TOTAL_TRAINING_SEASONS, lambda: NFL_TOTAL_RIDGE_LAMBDA, featureNames: NFL_TOTAL_FEATURE_NAMES, ridge, trainRowCount: usable.length, fittedModelHash };
}

/** Returns null (never a fabricated value) when the side's features are unresolved. */
export function scoreNflTotalModel(model: NflTotalFittedModel, features: NflTotalSideFeatures): number | null {
  const vector = toOrderedFeatureVector(features);
  if (vector === null) return null;
  return scoreRidgeModel(model.ridge, vector);
}
