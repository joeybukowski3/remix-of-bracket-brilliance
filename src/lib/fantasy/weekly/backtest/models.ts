import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { getMatchupMultiplier } from "@/features/sixteen-zero/engine/matchupAdjustment";
import { evaluateRankingMetrics, type RankingMetrics, type ScoredPlayerWeek } from "./metrics";
import { featureValue, featuresForFamily, type BacktestFeatureKey, type CandidateFamily } from "./featureRegistry";
import type { PregameFeatureSnapshot } from "./features";

export const WEEKLY_BACKTEST_MODEL_VERSION = "weekly-backtest-ridge-v1" as const;
export const RIDGE_LAMBDA_CANDIDATES = [0.01, 0.1, 1, 10, 100] as const;

export type FittedRidgeModel = {
  modelVersion: typeof WEEKLY_BACKTEST_MODEL_VERSION;
  features: readonly BacktestFeatureKey[];
  lambda: number;
  intercept: number;
  coefficients: number[];
  means: number[];
  scales: number[];
  trainingRows: number;
};

export type CandidateBacktestResult = {
  family: CandidateFamily;
  position: FantasyPosition;
  features: readonly BacktestFeatureKey[];
  selectedLambda: number | null;
  validation: RankingMetrics;
  holdout: RankingMetrics;
  holdoutEarly: RankingMetrics;
  holdoutLate: RankingMetrics;
  coefficients: number[] | null;
  trainingRows: number | null;
};

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error("Ridge system is singular.");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function completeRows(rows: readonly PregameFeatureSnapshot[], features: readonly BacktestFeatureKey[]) {
  return rows.flatMap((row) => {
    const values = features.map((feature) => featureValue(row, feature));
    return values.every((value): value is number => value != null) ? [{ row, values }] : [];
  });
}

export function fitRidgeModel(
  rows: readonly PregameFeatureSnapshot[],
  features: readonly BacktestFeatureKey[],
  lambda: number,
): FittedRidgeModel {
  if (!Number.isFinite(lambda) || lambda <= 0) throw new Error("Ridge lambda must be positive.");
  const complete = completeRows(rows, features);
  if (complete.length <= features.length) throw new Error("Insufficient complete training rows.");
  const means = features.map((_, column) => average(complete.map(({ values }) => values[column])));
  const scales = features.map((_, column) => {
    const variance = average(complete.map(({ values }) => (values[column] - means[column]) ** 2));
    return Math.sqrt(variance) || 1;
  });
  const targets = complete.map(({ row }) => row.actualFantasyPoints);
  const intercept = average(targets);
  const standardized = complete.map(({ values }) => values.map((value, column) => (value - means[column]) / scales[column]));
  const matrix = features.map((_, left) => features.map((__, right) =>
    standardized.reduce((sum, values) => sum + values[left] * values[right], 0) + (left === right ? lambda : 0)
  ));
  const vector = features.map((_, column) => standardized.reduce(
    (sum, values, index) => sum + values[column] * (targets[index] - intercept), 0,
  ));
  return {
    modelVersion: WEEKLY_BACKTEST_MODEL_VERSION,
    features: [...features], lambda, intercept,
    coefficients: solveLinearSystem(matrix, vector), means, scales,
    trainingRows: complete.length,
  };
}

export function scoreRidgeModel(model: FittedRidgeModel, row: PregameFeatureSnapshot): number | null {
  const values = model.features.map((feature) => featureValue(row, feature));
  if (!values.every((value): value is number => value != null)) return null;
  return model.intercept + values.reduce((score, value, index) =>
    score + ((value - model.means[index]) / model.scales[index]) * model.coefficients[index], 0
  );
}

export function scoreDirectBenchmark(
  family: "baseline-a" | "baseline-prior-season" | "baseline-b-16-0" | "matchup-only" | "prior-fpa-only",
  row: PregameFeatureSnapshot,
): number | null {
  const baseline = row.baseline.rollingPpg.seasonToDate;
  if (family === "baseline-a") return baseline;
  if (family === "baseline-prior-season") return row.baseline.priorSeasonPpg;
  if (family === "matchup-only") {
    return row.matchup.currentSeasonFpaPerGame ?? row.matchup.priorSeasonFpaPerGame;
  }
  if (family === "prior-fpa-only") return row.matchup.priorSeasonFpaPerGame;
  if (baseline == null) return null;
  const rank = row.matchup.currentSeasonFpaRank ?? row.matchup.priorSeasonFpaRank;
  return baseline * getMatchupMultiplier(rank);
}

function scored(rows: readonly PregameFeatureSnapshot[], scorer: (row: PregameFeatureSnapshot) => number | null): ScoredPlayerWeek[] {
  return rows.map((row) => ({
    season: row.season, week: row.week, position: row.position, playerId: row.playerId,
    actualFantasyPoints: row.actualFantasyPoints, score: scorer(row),
  }));
}

export function selectRidgeLambda(
  training: readonly PregameFeatureSnapshot[],
  validation: readonly PregameFeatureSnapshot[],
  features: readonly BacktestFeatureKey[],
): { lambda: number; model: FittedRidgeModel; metrics: RankingMetrics } {
  const candidates = RIDGE_LAMBDA_CANDIDATES.map((lambda) => {
    const model = fitRidgeModel(training, features, lambda);
    return { lambda, model, metrics: evaluateRankingMetrics(scored(validation, (row) => scoreRidgeModel(model, row))) };
  });
  return candidates.sort((a, b) =>
    (b.metrics.spearman ?? Number.NEGATIVE_INFINITY) - (a.metrics.spearman ?? Number.NEGATIVE_INFINITY) ||
    b.metrics.coverage - a.metrics.coverage || a.lambda - b.lambda
  )[0];
}

export function chronologicalSplit(rows: readonly PregameFeatureSnapshot[]) {
  return {
    training: rows.filter((row) => row.season === 2023),
    validation: rows.filter((row) => row.season === 2024),
    holdout: rows.filter((row) => row.season === 2025),
  };
}

export function runPositionBacktest(
  allRows: readonly PregameFeatureSnapshot[],
  position: FantasyPosition,
  options: { includeMarket?: boolean } = {},
): CandidateBacktestResult[] {
  const rows = allRows.filter((row) => row.position === position);
  const { training, validation, holdout } = chronologicalSplit(rows);
  if (!training.length || !validation.length || !holdout.length) {
    throw new Error(`${position}: 2023 training, 2024 validation and 2025 holdout rows are all required.`);
  }
  const directFamilies = [
    "baseline-a", "baseline-prior-season", "baseline-b-16-0", "matchup-only", "prior-fpa-only",
  ] as const;
  const direct = directFamilies.map((family): CandidateBacktestResult => {
    const validationScored = scored(validation, (row) => scoreDirectBenchmark(family, row));
    const holdoutScored = scored(holdout, (row) => scoreDirectBenchmark(family, row));
    return {
      family, position, features: featuresForFamily(position, family), selectedLambda: null,
      validation: evaluateRankingMetrics(validationScored),
      holdout: evaluateRankingMetrics(holdoutScored),
      holdoutEarly: evaluateRankingMetrics(holdoutScored.filter((row) => row.week <= 4)),
      holdoutLate: evaluateRankingMetrics(holdoutScored.filter((row) => row.week >= 10)),
      coefficients: null, trainingRows: null,
    };
  });
  const fittedFamilies: CandidateFamily[] = [
    "baseline-matchup", "baseline-usage", "baseline-team", "combined",
    ...(options.includeMarket ? ["market-environment" as const] : []),
  ];
  const fitted = fittedFamilies.map((family): CandidateBacktestResult => {
    const features = featuresForFamily(position, family);
    const selected = selectRidgeLambda(training, validation, features);
    const finalModel = fitRidgeModel([...training, ...validation], features, selected.lambda);
    const holdoutScored = scored(holdout, (row) => scoreRidgeModel(finalModel, row));
    return {
      family, position, features, selectedLambda: selected.lambda,
      validation: selected.metrics,
      holdout: evaluateRankingMetrics(holdoutScored),
      holdoutEarly: evaluateRankingMetrics(holdoutScored.filter((row) => row.week <= 4)),
      holdoutLate: evaluateRankingMetrics(holdoutScored.filter((row) => row.week >= 10)),
      coefficients: finalModel.coefficients,
      trainingRows: finalModel.trainingRows,
    };
  });
  return [...direct, ...fitted];
}
