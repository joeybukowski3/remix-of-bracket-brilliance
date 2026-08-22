import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { assertNotModelSelectionSeason } from "../splitAuthority";
import { positionMeanFromTraining, rookieFallbackFromTraining, scoreSimpleBaseline, SHRINKAGE_K_CANDIDATES } from "./baselines";
import type { SimpleBaselineName } from "./baselines";
import { runAblationLadder } from "./ablation";
import { featuresForBlocks } from "./featureSets";
import { scoreCandidate } from "./candidateModels";
import { evaluatePointAccuracy } from "./metrics";
import { calibrationGap, evaluatePromotion } from "./preregistration";
import { freezeSpec } from "./freeze";
import { seasonSegment, historySegment } from "./segments";
import type { AblationRunResult } from "./ablation";
import type { FrozenPositionSpec, ModelFamily, Row } from "./types";

/**
 * Ties simple baselines, the section-12 ablation ladder, and the section-11
 * promotion criteria together into ONE frozen spec per position. Only ever
 * consumes 2023 (training) and 2024 (validation) rows; every row's season is
 * asserted against the split guardrail before use.
 */

export type SimpleBaselineEvaluation = { name: SimpleBaselineName; validationMae: number | null };

export type PositionModelState = "READY_FOR_2026_SHADOW" | "BASELINE_ONLY" | "NOT_READY";

export type PositionResearchResult = {
  position: FantasyPosition;
  simpleBaselines: readonly SimpleBaselineEvaluation[];
  strongestSimpleBaseline: SimpleBaselineEvaluation;
  ablation: readonly AblationRunResult[];
  frozenSpec: FrozenPositionSpec;
  finalState: PositionModelState;
};

const SIMPLE_BASELINE_NAMES: readonly SimpleBaselineName[] = [
  "priorSeasonPpg", "seasonPpgPrior", "last3PpgPrior", "last5PpgPrior",
  "shrinkageBlend", "positionMeanNaive", "hardTwoGameTransition",
];

function assertRowsInSelectionWindow(rows: readonly Row[]): void {
  for (const row of rows) assertNotModelSelectionSeason(row.season);
}

function evaluateSimpleBaselines(trainingRows: readonly Row[], validationRows: readonly Row[]): readonly SimpleBaselineEvaluation[] {
  const rookieFallbackPpg = rookieFallbackFromTraining(trainingRows);
  const positionMeanPpg = positionMeanFromTraining(trainingRows);
  return SIMPLE_BASELINE_NAMES.map((name) => {
    const scored = validationRows.map((row) => ({
      actualFantasyPoints: row.actualFantasyPoints,
      predicted: scoreSimpleBaseline(name, row, { shrinkageK: SHRINKAGE_K_CANDIDATES[1], rookieFallbackPpg, positionMeanPpg }),
      playerId: row.playerId,
    }));
    return { name, validationMae: evaluatePointAccuracy(scored).mae };
  });
}

function segmentedMae(family: ModelFamily, candidateEntry: AblationRunResult["candidates"][number] | null, rows: readonly Row[], segmentPredicate: (row: Row) => boolean): number | null {
  if (!candidateEntry) return null;
  const segmentRowsForSegment = rows.filter(segmentPredicate);
  const scored = segmentRowsForSegment.map((row) => ({
    actualFantasyPoints: row.actualFantasyPoints, predicted: scoreCandidate(candidateEntry.fitted, row), playerId: row.playerId,
  }));
  return evaluatePointAccuracy(scored).mae;
}

function baselineSegmentedMae(rows: readonly Row[], segmentPredicate: (row: Row) => boolean, name: SimpleBaselineName, trainingRows: readonly Row[]): number | null {
  const rookieFallbackPpg = rookieFallbackFromTraining(trainingRows);
  const positionMeanPpg = positionMeanFromTraining(trainingRows);
  const segmentRowsForSegment = rows.filter(segmentPredicate);
  const scored = segmentRowsForSegment.map((row) => ({
    actualFantasyPoints: row.actualFantasyPoints,
    predicted: scoreSimpleBaseline(name, row, { shrinkageK: SHRINKAGE_K_CANDIDATES[1], rookieFallbackPpg, positionMeanPpg }),
    playerId: row.playerId,
  }));
  return evaluatePointAccuracy(scored).mae;
}

/** Picks, for each learned family, its single best-MAE candidate across the whole ablation ladder (best feature-block set for that family). */
function bestPerFamily(ablation: readonly AblationRunResult[]): Map<ModelFamily, AblationRunResult["candidates"][number]> {
  const best = new Map<ModelFamily, AblationRunResult["candidates"][number]>();
  for (const step of ablation) {
    for (const candidate of step.candidates) {
      const existing = best.get(candidate.fitted.family);
      const candidateMae = candidate.evaluation.validation.mae ?? Number.POSITIVE_INFINITY;
      const existingMae = existing?.evaluation.validation.mae ?? Number.POSITIVE_INFINITY;
      if (!existing || candidateMae < existingMae) best.set(candidate.fitted.family, candidate);
    }
  }
  return best;
}

export function runPositionResearch(position: FantasyPosition, trainingRows: readonly Row[], validationRows: readonly Row[]): PositionResearchResult {
  assertRowsInSelectionWindow(trainingRows);
  assertRowsInSelectionWindow(validationRows);
  const positionTraining = trainingRows.filter((row) => row.position === position);
  const positionValidation = validationRows.filter((row) => row.position === position);

  const simpleBaselines = evaluateSimpleBaselines(positionTraining, positionValidation);
  const finiteBaselines = simpleBaselines.filter((baseline) => baseline.validationMae != null);
  const strongestSimpleBaseline = [...finiteBaselines].sort((a, b) => a.validationMae! - b.validationMae!)[0]
    ?? simpleBaselines.find((baseline) => baseline.name === "shrinkageBlend")!;

  const ablation = runAblationLadder(position, positionTraining, positionValidation);
  const bestByFamily = bestPerFamily(ablation);

  const rookiePredicate = (row: Row) => historySegment(row) === "rookie-no-prior";
  const weekPredicates: readonly ((row: Row) => boolean)[] = [
    (row) => seasonSegment(row) === "weeks-1-3",
    (row) => seasonSegment(row) === "weeks-4-8",
    (row) => seasonSegment(row) === "weeks-9-plus",
  ];

  const learnedFamilies: ModelFamily[] = ["residual-ridge", "residual-elastic-net", "direct-ridge"];
  const promotable = learnedFamilies
    .map((family) => {
      const candidate = bestByFamily.get(family) ?? null;
      if (!candidate) return null;
      const decision = evaluatePromotion({
        candidateOverall: candidate.evaluation.validation,
        baselineOverall: { rows: 0, scoredRows: 0, coverage: 1, mae: strongestSimpleBaseline.validationMae, rmse: null, bias: null, medianAbsoluteError: null, pearson: null },
        candidateCalibrationGap: calibrationGap(candidate.evaluation.calibration),
        candidateWeekSegmentMae: weekPredicates.map((predicate) => segmentedMae(family, candidate, positionValidation, predicate)),
        baselineWeekSegmentMae: weekPredicates.map((predicate) => baselineSegmentedMae(positionValidation, predicate, strongestSimpleBaseline.name, positionTraining)),
        candidateRookieMae: segmentedMae(family, candidate, positionValidation, rookiePredicate),
        baselineRookieMae: baselineSegmentedMae(positionValidation, rookiePredicate, strongestSimpleBaseline.name, positionTraining),
      });
      return { family, candidate, decision };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const promoted = promotable.filter((entry) => entry.decision.promoted);
  const winner = [...promoted].sort(
    (a, b) => (a.candidate.evaluation.validation.mae ?? Infinity) - (b.candidate.evaluation.validation.mae ?? Infinity),
  )[0];

  const dataUnstable = strongestSimpleBaseline.validationMae == null || !Number.isFinite(strongestSimpleBaseline.validationMae) || positionValidation.length < 20;

  const rookieFallbackPpg = rookieFallbackFromTraining(positionTraining);
  const shrinkageBaselineCandidate = bestByFamily.get("deterministic-shrinkage-baseline") ?? null;
  const fallbackShrinkageK = shrinkageBaselineCandidate?.fitted.shrinkageK ?? SHRINKAGE_K_CANDIDATES[1];

  let frozenSpec: FrozenPositionSpec;
  if (dataUnstable) {
    frozenSpec = freezeSpec({
      position, frozenAt: new Date().toISOString(),
      baselineAuthority: "shrinkage-blend", selectedFamily: "deterministic-shrinkage-baseline",
      selectedFeatureBlocks: ["baseline"], selectedFeatures: featuresForBlocks(position, ["baseline"]),
      hyperparameter: null, l1Ratio: null, shrinkageK: fallbackShrinkageK, candidatePopulationPolicy: "full-universe",
      rookieFallback: { positionMeanPpgFromTraining: rookieFallbackPpg, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
      promotionDecision: { promoted: false, reasons: ["Validation population too small or unstable to responsibly evaluate a learned model (NOT_READY)."] },
    });
  } else if (winner) {
    frozenSpec = freezeSpec({
      position, frozenAt: new Date().toISOString(),
      baselineAuthority: "shrinkage-blend", selectedFamily: winner.family,
      selectedFeatureBlocks: winner.candidate.fitted.blocks, selectedFeatures: featuresForBlocks(position, winner.candidate.fitted.blocks.filter((b) => b !== "baseline")),
      hyperparameter: winner.candidate.fitted.hyperparameter, l1Ratio: winner.candidate.fitted.l1Ratio,
      shrinkageK: winner.candidate.fitted.shrinkageK,
      candidatePopulationPolicy: "full-universe",
      rookieFallback: { positionMeanPpgFromTraining: rookieFallbackPpg, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
      promotionDecision: winner.decision,
    });
  } else {
    frozenSpec = freezeSpec({
      position, frozenAt: new Date().toISOString(),
      baselineAuthority: "shrinkage-blend", selectedFamily: "deterministic-shrinkage-baseline",
      selectedFeatureBlocks: ["baseline"], selectedFeatures: featuresForBlocks(position, ["baseline"]),
      hyperparameter: null, l1Ratio: null, shrinkageK: fallbackShrinkageK, candidatePopulationPolicy: "full-universe",
      rookieFallback: { positionMeanPpgFromTraining: rookieFallbackPpg, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
      promotionDecision: { promoted: false, reasons: promotable.flatMap((entry) => entry.decision.reasons.map((reason) => `${entry.family}: ${reason}`)) },
    });
  }

  const finalState: PositionModelState = dataUnstable
    ? "NOT_READY"
    : frozenSpec.selectedFamily !== "deterministic-shrinkage-baseline" && frozenSpec.promotionDecision.promoted
      ? "READY_FOR_2026_SHADOW"
      : "BASELINE_ONLY";

  return { position, simpleBaselines, strongestSimpleBaseline, ablation, frozenSpec, finalState };
}
