import { evaluatePredictions } from "./evaluation";
import { runWalkForward, type WalkForwardOptions } from "./walkForward";
import type { EvaluationSummary, WalkForwardPrediction } from "./types";

export type ExperimentResult = {
  configLabel: string;
  options: WalkForwardOptions;
  overall: EvaluationSummary;
  weeks1to4: EvaluationSummary;
  weeks5to8: EvaluationSummary;
  weeks9plus: EvaluationSummary;
  bySeason: Record<number, EvaluationSummary>;
  n: number;
};

function segment(predictions: readonly WalkForwardPrediction[], predicate: (p: WalkForwardPrediction) => boolean) {
  return evaluatePredictions(predictions.filter(predicate));
}

export function runExperiment(configLabel: string, options: WalkForwardOptions): ExperimentResult {
  const predictions = runWalkForward(options);
  const seasons = [...new Set(predictions.map((p) => p.season))].sort((a, b) => a - b);
  const bySeason: Record<number, EvaluationSummary> = {};
  for (const season of seasons) bySeason[season] = segment(predictions, (p) => p.season === season);

  return {
    configLabel,
    options,
    overall: evaluatePredictions(predictions),
    weeks1to4: segment(predictions, (p) => p.week >= 1 && p.week <= 4),
    weeks5to8: segment(predictions, (p) => p.week >= 5 && p.week <= 8),
    weeks9plus: segment(predictions, (p) => p.week >= 9),
    bySeason,
    n: predictions.length,
  };
}
