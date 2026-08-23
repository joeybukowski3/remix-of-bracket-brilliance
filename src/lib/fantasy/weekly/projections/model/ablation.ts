import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { ablationLadder, featuresForBlocks } from "./featureSets";
import { fitDeterministicShrinkageBaseline, fitDirectRidge, fitResidualElasticNet, fitResidualRidge, scoreCandidate } from "./candidateModels";
import { evaluateCalibration, evaluatePointAccuracy, evaluateRankingSecondary } from "./metrics";
import { defaultStartThreshold } from "../../backtest/metrics";
import type { CandidateEvaluation, FeatureBlockName, ModelFamily, Row } from "./types";
import type { FittedCandidate } from "./candidateModels";

/**
 * Runs the section-12 ablation ladder (A..F, cumulative blocks) for every
 * section-5 model family, using ONLY 2023 training rows to fit and 2024
 * validation rows to score. Never touches 2025. Returns every fitted
 * candidate + its validation evaluation so `positionResearch.ts` can select
 * the frozen spec from preregistered promotion criteria.
 */

export type AblationRunResult = {
  ladderStep: string;
  blocks: readonly FeatureBlockName[];
  candidates: readonly { fitted: FittedCandidate; evaluation: CandidateEvaluation }[];
};

function evaluateFitted(position: FantasyPosition, fitted: FittedCandidate, validationRows: readonly Row[]): CandidateEvaluation {
  const scored = validationRows.map((row) => ({
    playerId: row.playerId, season: row.season, week: row.week,
    actualFantasyPoints: row.actualFantasyPoints, predicted: scoreCandidate(fitted, row),
  }));
  return {
    family: fitted.family,
    featureBlocks: fitted.blocks,
    hyperparameter: fitted.hyperparameter,
    l1Ratio: fitted.l1Ratio,
    validation: evaluatePointAccuracy(scored),
    calibration: evaluateCalibration(scored),
    ranking: evaluateRankingSecondary(scored, defaultStartThreshold(position)),
  };
}

export function runAblationLadder(
  position: FantasyPosition,
  trainingRows: readonly Row[],
  validationRows: readonly Row[],
): readonly AblationRunResult[] {
  const ladder = ablationLadder(position);
  return ladder.map(({ label, blocks }) => {
    const families: { family: ModelFamily; fit: () => FittedCandidate }[] = [
      { family: "deterministic-shrinkage-baseline", fit: () => fitDeterministicShrinkageBaseline(trainingRows, validationRows) },
      { family: "residual-ridge", fit: () => fitResidualRidge(position, trainingRows, validationRows, blocks) },
      { family: "residual-elastic-net", fit: () => fitResidualElasticNet(position, trainingRows, validationRows, blocks) },
      { family: "direct-ridge", fit: () => fitDirectRidge(position, trainingRows, validationRows, blocks) },
    ];
    const candidates = families.map(({ fit }) => {
      const fitted = fit();
      return { fitted, evaluation: evaluateFitted(position, fitted, validationRows) };
    });
    return { ladderStep: label, blocks, candidates };
  });
}

/** Convenience: features implied by a block set, exposed for the frozen-spec record. */
export { featuresForBlocks };
