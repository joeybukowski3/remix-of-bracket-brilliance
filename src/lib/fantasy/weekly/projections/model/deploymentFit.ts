import { shrinkageBlend } from "./baselines";
import { getFrozenModelAuthority, WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, type FrozenModelAuthoritySpec } from "./frozenSpec";
import { fitRidge, scoreLinearModel } from "./linear";
import { encodeRow, fitScalers, flattenEncodedRow } from "./scaling";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { FeatureKey, FittedScaler, Row } from "./types";

/**
 * Phase 3 DEPLOYMENT REFIT (spec section 2): refits the already-frozen
 * `weekly-fantasy-projection-v1` specification's coefficients/intercept/
 * scalers on ALL historical modeled seasons (2023-2025), for positions
 * whose frozen state is a learned `residual-ridge` model (RB/WR/TE). This
 * module NEVER performs model selection, hyperparameter search, feature
 * selection, or promotion evaluation -- it only imports the frozen spec,
 * `fitRidge` (closed-form ridge, no grid), and preprocessing primitives.
 * QB (`BASELINE_ONLY`) never produces a bundle; it has no learned deployment
 * fit by design (see `frozenSpec.ts` and shadow inference invariant tests).
 */

export const WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION =
  "weekly-fantasy-projection-v1-deployment-fit" as const;

/** The exact seasons folded into the deployment refit; frozen by the Phase 3 spec, never derived. */
export const DEPLOYMENT_FIT_TRAINING_SEASONS: readonly number[] = [2023, 2024, 2025];

export type DeploymentFitPosition = "RB" | "WR" | "TE";

/** One encoded design-matrix column, in the exact order used to build both `coefficients` and `scaler`. */
export type DeploymentFitColumn = {
  feature: FeatureKey;
  kind: "value" | "missingIndicator";
};

export type PositionDeploymentBundle = {
  position: DeploymentFitPosition;
  modelVersion: typeof WEEKLY_FANTASY_PROJECTION_MODEL_VERSION;
  deploymentFitVersion: typeof WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION;
  family: "residual-ridge";
  alpha: number;
  featureBlocks: FrozenModelAuthoritySpec["featureBlocks"];
  featureNamesInOrder: readonly FeatureKey[];
  intercept: number;
  /** Aligned 1:1 with `columnsInOrder` (values first, then missingness indicators). */
  coefficients: readonly number[];
  columnsInOrder: readonly DeploymentFitColumn[];
  scaler: {
    means: readonly number[];
    standardDeviations: readonly number[];
    featureNamesInOrder: readonly FeatureKey[];
    missingRatesInTraining: readonly number[];
  };
  baselineAuthority: FrozenModelAuthoritySpec["baselineAuthority"];
  shrinkageK: number;
  rookieFallbackPpg: number;
  missingnessAuthority: "zero-after-standardized-missingness-indicator-v1";
  preprocessingAuthority: FrozenModelAuthoritySpec["preprocessingAuthority"];
  trainingSeasons: readonly number[];
  trainingRowCount: number;
  scoringVersion: FrozenModelAuthoritySpec["scoringVersion"];
  datasetSchemaVersion: FrozenModelAuthoritySpec["datasetSchemaVersion"];
  generatedAt: string;
  inputFingerprint: string;
};

export const WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_BUNDLE_SCHEMA_VERSION =
  "weekly-fantasy-projection-deployment-bundle-v1" as const;

export type WeeklyFantasyProjectionDeploymentBundle = {
  schemaVersion: typeof WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_BUNDLE_SCHEMA_VERSION;
  modelVersion: typeof WEEKLY_FANTASY_PROJECTION_MODEL_VERSION;
  deploymentFitVersion: typeof WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION;
  generatedAt: string;
  trainingSeasons: readonly number[];
  positions: {
    RB: PositionDeploymentBundle;
    WR: PositionDeploymentBundle;
    TE: PositionDeploymentBundle;
  };
};

function orderedColumns(scalers: readonly FittedScaler[]): readonly DeploymentFitColumn[] {
  const values: DeploymentFitColumn[] = scalers.map((scaler) => ({ feature: scaler.feature, kind: "value" as const }));
  const indicators: DeploymentFitColumn[] = scalers
    .filter((scaler) => scaler.hasMissingIndicator)
    .map((scaler) => ({ feature: scaler.feature, kind: "missingIndicator" as const }));
  return [...values, ...indicators];
}

export { orderedColumns as deploymentFitColumnOrder };

/**
 * Fits one position's frozen `residual-ridge` specification on ALL rows
 * passed in (caller is responsible for restricting to `DEPLOYMENT_FIT_TRAINING_SEASONS`
 * and the position's own rows -- this function performs no season/position
 * filtering itself so its behavior stays fully auditable from its inputs).
 * `shrinkageK` and `rookieFallbackPpg` are read directly from the frozen
 * spec (never re-selected); only the ridge coefficients/intercept and the
 * scaler means/scales are refit here.
 */
export function fitPositionDeploymentBundle(
  position: DeploymentFitPosition,
  trainingRows: readonly Row[],
  options: { generatedAt: string; inputFingerprint: string },
): PositionDeploymentBundle {
  const spec = getFrozenModelAuthority(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, position);
  if (spec.family !== "residual-ridge" || spec.hyperparameter == null) {
    throw new Error(`Position "${position}" is not a frozen residual-ridge position; it has no deployment bundle.`);
  }
  if (trainingRows.some((row) => row.position !== position)) {
    throw new Error(`fitPositionDeploymentBundle received rows for a position other than "${position}".`);
  }

  const rookieFallbackPpg = spec.rookieFallback.positionMeanPpgFromTraining;
  const shrinkageK = spec.shrinkageK;
  const scalers = fitScalers(trainingRows, spec.features);
  const designMatrix = trainingRows.map((row) => flattenEncodedRow(encodeRow(row, scalers)));
  const residualTargets = trainingRows.map(
    (row) => row.actualFantasyPoints - shrinkageBlend(row, shrinkageK, rookieFallbackPpg),
  );

  const model = fitRidge(designMatrix, residualTargets, spec.hyperparameter);

  return {
    position,
    modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
    deploymentFitVersion: WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION,
    family: "residual-ridge",
    alpha: spec.hyperparameter,
    featureBlocks: spec.featureBlocks,
    featureNamesInOrder: spec.features,
    intercept: model.intercept,
    coefficients: model.coefficients,
    columnsInOrder: orderedColumns(scalers),
    scaler: {
      means: scalers.map((scaler) => scaler.mean),
      standardDeviations: scalers.map((scaler) => scaler.scale),
      featureNamesInOrder: scalers.map((scaler) => scaler.feature),
      missingRatesInTraining: scalers.map((scaler) => scaler.missingRateInTraining),
    },
    baselineAuthority: spec.baselineAuthority,
    shrinkageK,
    rookieFallbackPpg,
    missingnessAuthority: "zero-after-standardized-missingness-indicator-v1",
    preprocessingAuthority: spec.preprocessingAuthority,
    trainingSeasons: DEPLOYMENT_FIT_TRAINING_SEASONS,
    trainingRowCount: trainingRows.length,
    scoringVersion: spec.scoringVersion,
    datasetSchemaVersion: spec.datasetSchemaVersion,
    generatedAt: options.generatedAt,
    inputFingerprint: options.inputFingerprint,
  };
}

/** Score a single row's learned residual contribution against a fitted bundle (does NOT add the baseline). */
export function scoreDeploymentResidual(bundle: PositionDeploymentBundle, row: Row): number {
  const scalers: FittedScaler[] = bundle.scaler.featureNamesInOrder.map((feature, index) => ({
    feature,
    mean: bundle.scaler.means[index],
    scale: bundle.scaler.standardDeviations[index],
    missingRateInTraining: bundle.scaler.missingRatesInTraining[index],
    hasMissingIndicator: bundle.columnsInOrder.some((column) => column.feature === feature && column.kind === "missingIndicator"),
  }));
  return scoreLinearModel({ intercept: bundle.intercept, coefficients: [...bundle.coefficients], width: bundle.coefficients.length }, encodeRow(row, scalers));
}

export function buildWeeklyFantasyProjectionDeploymentBundle(
  allModeledRows: readonly Row[],
  options: { generatedAt: string; inputFingerprint: string },
): WeeklyFantasyProjectionDeploymentBundle {
  const seasons = new Set(DEPLOYMENT_FIT_TRAINING_SEASONS);
  const rowsFor = (position: DeploymentFitPosition): Row[] =>
    allModeledRows.filter((row) => row.position === position && seasons.has(row.season));

  return {
    schemaVersion: WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_BUNDLE_SCHEMA_VERSION,
    modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
    deploymentFitVersion: WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION,
    generatedAt: options.generatedAt,
    trainingSeasons: DEPLOYMENT_FIT_TRAINING_SEASONS,
    positions: {
      RB: fitPositionDeploymentBundle("RB", rowsFor("RB"), options),
      WR: fitPositionDeploymentBundle("WR", rowsFor("WR"), options),
      TE: fitPositionDeploymentBundle("TE", rowsFor("TE"), options),
    },
  };
}

export type { FantasyPosition };
