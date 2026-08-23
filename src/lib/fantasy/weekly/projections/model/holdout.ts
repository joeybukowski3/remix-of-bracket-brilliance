import { assertAllPositionsFrozen } from "./freeze";
import { featuresForBlocks } from "./featureSets";
import { fitElasticNet, fitRidge, scoreLinearModel } from "./linear";
import { encodeRow, fitScalers, flattenEncodedRow } from "./scaling";
import { shrinkageBlend } from "./baselines";
import { evaluatePointAccuracy, evaluateCalibration, evaluateRankingSecondary } from "./metrics";
import { defaultStartThreshold } from "../../backtest/metrics";
import { historySegment, seasonSegment } from "./segments";
import type { FrozenPositionSpec, Row } from "./types";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

/**
 * Unlocks the frozen 2025 holdout EXACTLY ONCE per position, and only after
 * `assertAllPositionsFrozen` confirms all four position specs exist and are
 * byte-identical to what was frozen during model selection (spec section
 * 14/15). The frozen spec's hyperparameters/features/family are never
 * re-tuned here -- the final model is refit on 2023+2024 combined using
 * exactly the frozen family/features/hyperparameter, then scored once on
 * 2025 with no further changes.
 */

export type HoldoutResult = {
  position: FantasyPosition;
  overall: ReturnType<typeof evaluatePointAccuracy>;
  calibration: ReturnType<typeof evaluateCalibration>;
  ranking: ReturnType<typeof evaluateRankingSecondary>;
  fullUniverse: ReturnType<typeof evaluatePointAccuracy>;
  projectionCandidatePopulation: ReturnType<typeof evaluatePointAccuracy>;
  weeks1to3: ReturnType<typeof evaluatePointAccuracy>;
  weeks4to8: ReturnType<typeof evaluatePointAccuracy>;
  weeks9plus: ReturnType<typeof evaluatePointAccuracy>;
  priorHistory: ReturnType<typeof evaluatePointAccuracy>;
  rookieNoPrior: ReturnType<typeof evaluatePointAccuracy>;
};

function stableBaselineFromSpec(row: Row, spec: FrozenPositionSpec): number {
  return shrinkageBlend(row, spec.shrinkageK, spec.rookieFallback.positionMeanPpgFromTraining);
}

function refitScore(spec: FrozenPositionSpec, refitRows: readonly Row[], targetRows: readonly Row[]): Map<string, number | null> {
  const scores = new Map<string, number | null>();
  const key = (row: Row) => `${row.season}|${row.week}|${row.playerId}`;

  if (spec.selectedFamily === "deterministic-shrinkage-baseline") {
    for (const row of targetRows) scores.set(key(row), stableBaselineFromSpec(row, spec));
    return scores;
  }

  const contextBlocks = spec.selectedFeatureBlocks.filter((block) => block !== "baseline");
  const isDirect = spec.selectedFamily === "direct-ridge";
  const features = isDirect ? featuresForBlocks(spec.position, spec.selectedFeatureBlocks) : featuresForBlocks(spec.position, contextBlocks);
  const scalers = fitScalers(refitRows, features);
  const designMatrix = refitRows.map((row) => flattenEncodedRow(encodeRow(row, scalers)));
  const targets = isDirect
    ? refitRows.map((row) => row.actualFantasyPoints)
    : refitRows.map((row) => row.actualFantasyPoints - stableBaselineFromSpec(row, spec));

  const model =
    spec.selectedFamily === "residual-elastic-net"
      ? fitElasticNet(designMatrix, targets, spec.hyperparameter ?? 0.1, spec.l1Ratio ?? 0.5)
      : fitRidge(designMatrix, targets, spec.hyperparameter ?? 1);

  for (const row of targetRows) {
    const contribution = scoreLinearModel(model, encodeRow(row, scalers));
    const value = isDirect ? contribution : stableBaselineFromSpec(row, spec) + contribution;
    scores.set(key(row), value);
  }
  return scores;
}

export function runHoldoutEvaluation(
  frozenSpecs: readonly FrozenPositionSpec[],
  requiredPositions: readonly FantasyPosition[],
  trainingRows: readonly Row[],
  validationRows: readonly Row[],
  holdoutRows: readonly Row[],
): readonly HoldoutResult[] {
  assertAllPositionsFrozen(frozenSpecs, requiredPositions);
  for (const row of holdoutRows) {
    if (row.season !== 2025) throw new Error(`Holdout evaluation received a non-2025 row (season ${row.season}); refusing.`);
  }

  return frozenSpecs.map((spec) => {
    const refitRows = [...trainingRows, ...validationRows].filter((row) => row.position === spec.position);
    const targetRows = holdoutRows.filter((row) => row.position === spec.position);
    const scores = refitScore(spec, refitRows, targetRows);
    const key = (row: Pick<Row, "season" | "week" | "playerId">) => `${row.season}|${row.week}|${row.playerId}`;
    const scored = targetRows.map((row) => ({
      season: row.season, week: row.week, playerId: row.playerId,
      actualFantasyPoints: row.actualFantasyPoints, predicted: scores.get(key(row)) ?? null,
    }));
    const withRow = (predicate: (row: Row) => boolean) => {
      const subsetIds = new Set(targetRows.filter(predicate).map((row) => key(row)));
      return scored.filter((row) => subsetIds.has(key(row)));
    };
    return {
      position: spec.position,
      overall: evaluatePointAccuracy(scored),
      calibration: evaluateCalibration(scored),
      ranking: evaluateRankingSecondary(scored, defaultStartThreshold(spec.position)),
      fullUniverse: evaluatePointAccuracy(scored),
      projectionCandidatePopulation: evaluatePointAccuracy(withRow((row) => row.projectionCandidate)),
      weeks1to3: evaluatePointAccuracy(withRow((row) => seasonSegment(row) === "weeks-1-3")),
      weeks4to8: evaluatePointAccuracy(withRow((row) => seasonSegment(row) === "weeks-4-8")),
      weeks9plus: evaluatePointAccuracy(withRow((row) => seasonSegment(row) === "weeks-9-plus")),
      priorHistory: evaluatePointAccuracy(withRow((row) => historySegment(row) === "prior-history")),
      rookieNoPrior: evaluatePointAccuracy(withRow((row) => historySegment(row) === "rookie-no-prior")),
    };
  });
}
