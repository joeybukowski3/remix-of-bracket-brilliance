import { rookieFallbackFromTraining, shrinkageBlend, SHRINKAGE_K_CANDIDATES } from "./baselines";
import { featuresForBlocks } from "./featureSets";
import { fitElasticNet, fitRidge, scoreLinearModel, ELASTIC_NET_ALPHA_GRID, ELASTIC_NET_L1_RATIO_GRID, RIDGE_ALPHA_GRID } from "./linear";
import { encodeRow, fitScalers, flattenEncodedRow } from "./scaling";
import { evaluatePointAccuracy } from "./metrics";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { FeatureBlockName, ModelFamily, Row } from "./types";
import type { FittedLinearModel } from "./linear";
import type { FittedScaler } from "./types";

/**
 * Fits and scores the four Phase 2 model families (spec section 5) for one
 * position/feature-block-set combination. All fitting here must only ever be
 * called with 2023 training rows (and 2024 for the final refit AFTER a
 * position's spec is frozen, per `runResearch.ts`) -- never 2025.
 */

export type FittedCandidate = {
  family: ModelFamily;
  blocks: readonly FeatureBlockName[];
  hyperparameter: number | null;
  l1Ratio: number | null;
  shrinkageK: number;
  rookieFallbackPpg: number;
  scalers: readonly FittedScaler[];
  linearModel: FittedLinearModel | null; // null for deterministic-shrinkage-baseline
};

function stableBaseline(row: Row, shrinkageK: number, rookieFallbackPpg: number): number {
  return shrinkageBlend(row, shrinkageK, rookieFallbackPpg);
}

function bestShrinkageK(trainingRows: readonly Row[], validationRows: readonly Row[], rookieFallbackPpg: number): number {
  const scored = SHRINKAGE_K_CANDIDATES.map((k) => {
    const predictions = validationRows.map((row) => ({
      actualFantasyPoints: row.actualFantasyPoints,
      predicted: stableBaseline(row, k, rookieFallbackPpg),
      playerId: row.playerId,
    }));
    return { k, mae: evaluatePointAccuracy(predictions).mae ?? Number.POSITIVE_INFINITY };
  });
  return scored.sort((a, b) => a.mae - b.mae)[0].k;
}

export function fitDeterministicShrinkageBaseline(trainingRows: readonly Row[], validationRows: readonly Row[]): FittedCandidate {
  const rookieFallbackPpg = rookieFallbackFromTraining(trainingRows);
  const shrinkageK = bestShrinkageK(trainingRows, validationRows, rookieFallbackPpg);
  return {
    family: "deterministic-shrinkage-baseline", blocks: ["baseline"], hyperparameter: null, l1Ratio: null,
    shrinkageK, rookieFallbackPpg, scalers: [], linearModel: null,
  };
}

function buildDesignMatrix(rows: readonly Row[], scalers: readonly FittedScaler[]) {
  return rows.map((row) => flattenEncodedRow(encodeRow(row, scalers)));
}

export function fitResidualRidge(
  position: FantasyPosition,
  trainingRows: readonly Row[],
  validationRows: readonly Row[],
  blocks: readonly FeatureBlockName[],
  alphaGrid: readonly number[] = RIDGE_ALPHA_GRID,
): FittedCandidate {
  const rookieFallbackPpg = rookieFallbackFromTraining(trainingRows);
  const shrinkageK = bestShrinkageK(trainingRows, validationRows, rookieFallbackPpg);
  const contextBlocks = blocks.filter((block) => block !== "baseline");
  const features = featuresForBlocks(position, contextBlocks);
  const scalers = fitScalers(trainingRows, features);
  const trainMatrix = buildDesignMatrix(trainingRows, scalers);
  const trainResiduals = trainingRows.map((row) => row.actualFantasyPoints - stableBaseline(row, shrinkageK, rookieFallbackPpg));

  const best = alphaGrid
    .map((alpha) => {
      const model = fitRidge(trainMatrix, trainResiduals, alpha);
      const predictions = validationRows.map((row) => ({
        actualFantasyPoints: row.actualFantasyPoints,
        predicted: stableBaseline(row, shrinkageK, rookieFallbackPpg) + scoreLinearModel(model, encodeRow(row, scalers)),
        playerId: row.playerId,
      }));
      return { alpha, model, mae: evaluatePointAccuracy(predictions).mae ?? Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.mae - b.mae)[0];

  return {
    family: "residual-ridge", blocks, hyperparameter: best.alpha, l1Ratio: null,
    shrinkageK, rookieFallbackPpg, scalers, linearModel: best.model,
  };
}

export function fitResidualElasticNet(
  position: FantasyPosition,
  trainingRows: readonly Row[],
  validationRows: readonly Row[],
  blocks: readonly FeatureBlockName[],
): FittedCandidate {
  const rookieFallbackPpg = rookieFallbackFromTraining(trainingRows);
  const shrinkageK = bestShrinkageK(trainingRows, validationRows, rookieFallbackPpg);
  const contextBlocks = blocks.filter((block) => block !== "baseline");
  const features = featuresForBlocks(position, contextBlocks);
  const scalers = fitScalers(trainingRows, features);
  const trainMatrix = buildDesignMatrix(trainingRows, scalers);
  const trainResiduals = trainingRows.map((row) => row.actualFantasyPoints - stableBaseline(row, shrinkageK, rookieFallbackPpg));

  let bestResult: { alpha: number; l1Ratio: number; model: FittedLinearModel; mae: number } | null = null;
  for (const alpha of ELASTIC_NET_ALPHA_GRID) {
    for (const l1Ratio of ELASTIC_NET_L1_RATIO_GRID) {
      const model = fitElasticNet(trainMatrix, trainResiduals, alpha, l1Ratio);
      const predictions = validationRows.map((row) => ({
        actualFantasyPoints: row.actualFantasyPoints,
        predicted: stableBaseline(row, shrinkageK, rookieFallbackPpg) + scoreLinearModel(model, encodeRow(row, scalers)),
        playerId: row.playerId,
      }));
      const mae = evaluatePointAccuracy(predictions).mae ?? Number.POSITIVE_INFINITY;
      if (!bestResult || mae < bestResult.mae) bestResult = { alpha, l1Ratio, model, mae };
    }
  }
  return {
    family: "residual-elastic-net", blocks, hyperparameter: bestResult!.alpha, l1Ratio: bestResult!.l1Ratio,
    shrinkageK, rookieFallbackPpg, scalers, linearModel: bestResult!.model,
  };
}

export function fitDirectRidge(
  position: FantasyPosition,
  trainingRows: readonly Row[],
  validationRows: readonly Row[],
  blocks: readonly FeatureBlockName[],
  alphaGrid: readonly number[] = RIDGE_ALPHA_GRID,
): FittedCandidate {
  const rookieFallbackPpg = rookieFallbackFromTraining(trainingRows);
  const shrinkageK = bestShrinkageK(trainingRows, validationRows, rookieFallbackPpg);
  const features = featuresForBlocks(position, blocks); // includes baseline as direct numeric features here, no separate residual target
  const scalers = fitScalers(trainingRows, features);
  const trainMatrix = buildDesignMatrix(trainingRows, scalers);
  const trainTargets = trainingRows.map((row) => row.actualFantasyPoints);

  const best = alphaGrid
    .map((alpha) => {
      const model = fitRidge(trainMatrix, trainTargets, alpha);
      const predictions = validationRows.map((row) => ({
        actualFantasyPoints: row.actualFantasyPoints,
        predicted: scoreLinearModel(model, encodeRow(row, scalers)),
        playerId: row.playerId,
      }));
      return { alpha, model, mae: evaluatePointAccuracy(predictions).mae ?? Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.mae - b.mae)[0];

  return {
    family: "direct-ridge", blocks, hyperparameter: best.alpha, l1Ratio: null,
    shrinkageK, rookieFallbackPpg, scalers, linearModel: best.model,
  };
}

export function scoreCandidate(candidate: FittedCandidate, row: Row): number | null {
  if (candidate.family === "deterministic-shrinkage-baseline") {
    return stableBaseline(row, candidate.shrinkageK, candidate.rookieFallbackPpg);
  }
  if (!candidate.linearModel) return null;
  const contribution = scoreLinearModel(candidate.linearModel, encodeRow(row, candidate.scalers));
  if (candidate.family === "direct-ridge") return contribution;
  return stableBaseline(row, candidate.shrinkageK, candidate.rookieFallbackPpg) + contribution;
}
