import { shrinkageBlend } from "../model/baselines";
import { deploymentFitColumnOrder, scoreDeploymentResidual, type PositionDeploymentBundle } from "../model/deploymentFit";
import { featureBlocksForPosition } from "../model/featureSets";
import { getCurrentFrozenModelAuthority, type FrozenModelAuthoritySpec } from "../model/frozenSpec";
import { encodeRow } from "../model/scaling";
import { evaluateResidualActivation, getCurrentInferencePolicy } from "./inferencePolicy";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { FeatureBlockName, FeatureKey } from "../model/types";
import type { WeeklyFantasyProjectionTrainingRow } from "../contract";
import type { WeeklyFantasyProjectionShadowRow } from "./artifactContract";

/**
 * Phase 3 shadow scoring. Reads ONLY the frozen spec, the deployment bundle,
 * and pregame Week 1 row data -- never `positionResearch.ts`,
 * `candidateModels.ts`'s grid-search fitters, `ablation.ts`, or
 * `preregistration.ts` (no live model-selection code is reachable from this
 * module's import graph).
 *
 * For QB (`BASELINE_ONLY`), `bundle` MUST be `null` and every learned
 * adjustment is structurally zero (the function never even looks at usage
 * features for QB) -- see `frozenSpec.test.ts`-style invariant in
 * `qbGovernance.test.ts`.
 */

export type ShadowBaselineAuthority = "ros-projected-ppg" | "shrinkage-blend-fallback";

function featureBlockLookup(position: FantasyPosition): ReadonlyMap<FeatureKey, FeatureBlockName> {
  const map = new Map<FeatureKey, FeatureBlockName>();
  for (const block of featureBlocksForPosition(position)) {
    for (const feature of block.features) map.set(feature, block.name);
  }
  return map;
}

function resolveBaseline(
  row: WeeklyFantasyProjectionTrainingRow,
  rosProjectedPpg: number | null,
  spec: FrozenModelAuthoritySpec,
): { value: number; authority: ShadowBaselineAuthority } {
  if (rosProjectedPpg != null) return { value: rosProjectedPpg, authority: "ros-projected-ppg" };
  return { value: shrinkageBlend(row, spec.shrinkageK, spec.rookieFallback.positionMeanPpgFromTraining), authority: "shrinkage-blend-fallback" };
}

export function computeShadowProjection(
  row: WeeklyFantasyProjectionTrainingRow,
  rosProjectedPpg: number | null,
  bundle: PositionDeploymentBundle | null,
): Omit<WeeklyFantasyProjectionShadowRow,
  "playerId" | "playerName" | "team" | "opponent" | "homeAway" | "kickoff" | "availability" | "provenance"> {
  const spec = getCurrentFrozenModelAuthority(row.position);
  const baseline = resolveBaseline(row, rosProjectedPpg, spec);

  const missingInputs: string[] = [];
  if (rosProjectedPpg == null) missingInputs.push("rosProjectedPpg");
  if (row.rookieOrNoPriorHistory) missingInputs.push("priorSeasonPpg (rookie/no prior history)");

  const inferencePolicy = getCurrentInferencePolicy();

  if (spec.state === "BASELINE_ONLY") {
    if (bundle) throw new Error("QB (BASELINE_ONLY) must never be scored with a learned deployment bundle.");
    const projectedFantasyPoints = baseline.value;
    return {
      position: row.position,
      projectedFantasyPoints,
      baselineFantasyPoints: baseline.value,
      rosProjectedPpg, priorSeasonPpg: row.priorSeasonPpg, seasonPpgPrior: row.seasonPpgPrior,
      priorGames: row.priorSeasonGames ?? 0,
      modelAuthority: { state: spec.state, family: spec.family, featureBlocks: spec.featureBlocks, alpha: spec.hyperparameter },
      components: { baseline: baseline.value, usageAdjustment: 0, teamContextAdjustment: 0, opponentAdjustment: 0, otherAdjustment: 0 },
      inferencePolicyVersion: inferencePolicy.inferencePolicyVersion,
      residualActivated: false,
      residualActivationReason: "model-state-baseline-only",
      confidence: {
        level: row.rookieOrNoPriorHistory || rosProjectedPpg == null ? "low" : "medium",
        reasons: [`baselineAuthority:${baseline.authority}`, "QB is BASELINE_ONLY; no learned adjustment is applied"],
        missingInputs,
      },
    };
  }

  if (!bundle) throw new Error(`Position "${row.position}" is READY_FOR_2026_SHADOW and requires a deployment bundle.`);

  const activation = evaluateResidualActivation(row.position as Exclude<FantasyPosition, "QB">, row);
  if (!activation.activated) {
    const projectedFantasyPoints = baseline.value;
    return {
      position: row.position,
      projectedFantasyPoints,
      baselineFantasyPoints: baseline.value,
      rosProjectedPpg, priorSeasonPpg: row.priorSeasonPpg, seasonPpgPrior: row.seasonPpgPrior,
      priorGames: row.priorSeasonGames ?? 0,
      modelAuthority: { state: spec.state, family: spec.family, featureBlocks: spec.featureBlocks, alpha: spec.hyperparameter },
      components: { baseline: baseline.value, usageAdjustment: 0, teamContextAdjustment: 0, opponentAdjustment: 0, otherAdjustment: 0 },
      inferencePolicyVersion: inferencePolicy.inferencePolicyVersion,
      residualActivated: false,
      residualActivationReason: activation.reason,
      confidence: {
        level: row.rookieOrNoPriorHistory || rosProjectedPpg == null ? "low" : "medium",
        reasons: [`baselineAuthority:${baseline.authority}`, `residualActivationReason:${activation.reason}`],
        missingInputs,
      },
    };
  }

  const blockOf = featureBlockLookup(row.position);
  const scalers = bundle.scaler.featureNamesInOrder.map((feature, index) => ({
    feature, mean: bundle.scaler.means[index], scale: bundle.scaler.standardDeviations[index],
    missingRateInTraining: bundle.scaler.missingRatesInTraining[index],
    hasMissingIndicator: bundle.columnsInOrder.some((c) => c.feature === feature && c.kind === "missingIndicator"),
  }));
  const encoded = encodeRow(row, scalers);
  const flat = [...encoded.values, ...encoded.indicators];
  const columns = deploymentFitColumnOrder(scalers);
  if (flat.length !== bundle.coefficients.length || columns.length !== bundle.coefficients.length) {
    throw new Error(`Deployment bundle/coefficient width mismatch for "${row.position}".`);
  }

  let usageAdjustment = 0;
  let teamContextAdjustment = 0;
  let opponentAdjustment = 0;
  let otherAdjustment = bundle.intercept;
  for (let index = 0; index < columns.length; index += 1) {
    const contribution = flat[index] * bundle.coefficients[index];
    const block = blockOf.get(columns[index].feature);
    if (block === "usage") usageAdjustment += contribution;
    else if (block === "teamContext") teamContextAdjustment += contribution;
    else if (block === "opponentContext") opponentAdjustment += contribution;
    else otherAdjustment += contribution;
  }

  const residualCheck = scoreDeploymentResidual(bundle, row);
  const residualSum = usageAdjustment + teamContextAdjustment + opponentAdjustment + otherAdjustment;
  if (Math.abs(residualCheck - residualSum) > 1e-6) {
    throw new Error(`Residual component reconciliation failed for "${row.position}"/"${row.playerId}".`);
  }

  const projectedFantasyPoints = baseline.value + residualSum;
  if (!Number.isFinite(projectedFantasyPoints)) missingInputs.push("projectedFantasyPoints is not finite");

  return {
    position: row.position,
    projectedFantasyPoints,
    baselineFantasyPoints: baseline.value,
    rosProjectedPpg, priorSeasonPpg: row.priorSeasonPpg, seasonPpgPrior: row.seasonPpgPrior,
    priorGames: row.priorSeasonGames ?? 0,
    modelAuthority: { state: spec.state, family: spec.family, featureBlocks: spec.featureBlocks, alpha: spec.hyperparameter },
    components: { baseline: baseline.value, usageAdjustment, teamContextAdjustment, opponentAdjustment, otherAdjustment },
    inferencePolicyVersion: inferencePolicy.inferencePolicyVersion,
    residualActivated: true,
    residualActivationReason: activation.reason,
    confidence: {
      level: row.rookieOrNoPriorHistory || rosProjectedPpg == null ? "low" : "medium",
      reasons: [`baselineAuthority:${baseline.authority}`, `residual family:${spec.family} alpha:${spec.hyperparameter}`],
      missingInputs,
    },
  };
}
