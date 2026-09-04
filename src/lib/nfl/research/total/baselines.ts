/**
 * Phase D -- Baseline 0 (scoring environment only) and Baseline 1
 * (transparent standardized-composite heuristic).
 *
 * Both baselines are fit on a TRAIN set (their only "parameters" are
 * train-fold summary statistics) and scored on arbitrary rows -- never
 * using the row's own outcome or any statistic computed across train+test
 * together, matching the ridge model's discipline in ridgeModel.ts.
 */
import type { NflTotalResearchDatasetRow } from "./types";

export type Baseline0Model = { kind: "baseline0" };

export function fitBaseline0(): Baseline0Model {
  return { kind: "baseline0" };
}

export function scoreBaseline0(_model: Baseline0Model, row: NflTotalResearchDatasetRow): number | null {
  return row.scoringEnvironment.value;
}

/**
 * Baseline 1: projectedTeamPoints = scoringEnvironment + slope * compositeDiff,
 * where compositeDiff = mean(z(offEpa), z(offSuccess), z(offExplosive)) -
 * mean(z(defEpaAllowed), z(defSuccessAllowed), z(defExplosiveAllowed)),
 * z-scored using TRAIN-FOLD mean/std for each of the 6 raw metrics, and
 * `slope` is the single closed-form OLS coefficient of
 * (actualTeamPoints - scoringEnvironment) on compositeDiff, fit on the
 * train fold. This is intentionally a ONE-parameter fit (not six
 * hand-picked weights) so it stays an interpretable benchmark rather than
 * a hand-tuned model -- the six raw metrics are pre-combined into a single
 * composite by simple equal-weighted averaging (no weight search) before
 * that one slope is fit.
 */
export type Baseline1Model = {
  kind: "baseline1";
  featureMeans: { offEpa: number; offSuccess: number; offExplosive: number; defEpa: number; defSuccess: number; defExplosive: number };
  featureStds: { offEpa: number; offSuccess: number; offExplosive: number; defEpa: number; defSuccess: number; defExplosive: number };
  slope: number;
};

function meanStd(values: readonly number[]): { mean: number; std: number } {
  const n = values.length;
  const m = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return { mean: m, std: std > 1e-9 ? std : 1 };
}

/** Rows with any null/insufficient input are excluded from fitting -- never imputed to zero. */
function usableRows(rows: readonly NflTotalResearchDatasetRow[]): NflTotalResearchDatasetRow[] {
  return rows.filter(
    (r) =>
      r.scoringEnvironment.value !== null &&
      r.offense.epaPerPlay !== null &&
      r.offense.successRate !== null &&
      r.offense.explosiveRate !== null &&
      r.opponentDefenseAllowed.epaPerPlay !== null &&
      r.opponentDefenseAllowed.successRate !== null &&
      r.opponentDefenseAllowed.explosiveRate !== null,
  );
}

function compositeDiff(row: NflTotalResearchDatasetRow, model: Pick<Baseline1Model, "featureMeans" | "featureStds">): number {
  const z = (v: number, mean: number, std: number) => (v - mean) / std;
  const offZ =
    (z(row.offense.epaPerPlay!, model.featureMeans.offEpa, model.featureStds.offEpa) +
      z(row.offense.successRate!, model.featureMeans.offSuccess, model.featureStds.offSuccess) +
      z(row.offense.explosiveRate!, model.featureMeans.offExplosive, model.featureStds.offExplosive)) /
    3;
  const defZ =
    (z(row.opponentDefenseAllowed.epaPerPlay!, model.featureMeans.defEpa, model.featureStds.defEpa) +
      z(row.opponentDefenseAllowed.successRate!, model.featureMeans.defSuccess, model.featureStds.defSuccess) +
      z(row.opponentDefenseAllowed.explosiveRate!, model.featureMeans.defExplosive, model.featureStds.defExplosive)) /
    3;
  return offZ - defZ;
}

export function fitBaseline1(trainRows: readonly NflTotalResearchDatasetRow[]): Baseline1Model {
  const usable = usableRows(trainRows);
  if (usable.length === 0) {
    throw new Error("fitBaseline1: zero usable training rows (every row had a null/insufficient feature) -- cannot fit, refusing to silently produce NaN.");
  }
  const offEpa = meanStd(usable.map((r) => r.offense.epaPerPlay!));
  const offSuccess = meanStd(usable.map((r) => r.offense.successRate!));
  const offExplosive = meanStd(usable.map((r) => r.offense.explosiveRate!));
  const defEpa = meanStd(usable.map((r) => r.opponentDefenseAllowed.epaPerPlay!));
  const defSuccess = meanStd(usable.map((r) => r.opponentDefenseAllowed.successRate!));
  const defExplosive = meanStd(usable.map((r) => r.opponentDefenseAllowed.explosiveRate!));

  const model: Baseline1Model = {
    kind: "baseline1",
    featureMeans: { offEpa: offEpa.mean, offSuccess: offSuccess.mean, offExplosive: offExplosive.mean, defEpa: defEpa.mean, defSuccess: defSuccess.mean, defExplosive: defExplosive.mean },
    featureStds: { offEpa: offEpa.std, offSuccess: offSuccess.std, offExplosive: offExplosive.std, defEpa: defEpa.std, defSuccess: defSuccess.std, defExplosive: defExplosive.std },
    slope: 0,
  };

  const diffs = usable.map((r) => compositeDiff(r, model));
  const residualPoints = usable.map((r) => r.actualTeamPoints - (r.scoringEnvironment.value ?? 0));
  const meanDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  const meanResidual = residualPoints.reduce((s, v) => s + v, 0) / residualPoints.length;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < diffs.length; i += 1) {
    covariance += (diffs[i] - meanDiff) * (residualPoints[i] - meanResidual);
    variance += (diffs[i] - meanDiff) ** 2;
  }
  model.slope = variance > 1e-9 ? covariance / variance : 0;
  return model;
}

export function scoreBaseline1(model: Baseline1Model, row: NflTotalResearchDatasetRow): number | null {
  if (
    row.scoringEnvironment.value === null ||
    row.offense.epaPerPlay === null ||
    row.offense.successRate === null ||
    row.offense.explosiveRate === null ||
    row.opponentDefenseAllowed.epaPerPlay === null ||
    row.opponentDefenseAllowed.successRate === null ||
    row.opponentDefenseAllowed.explosiveRate === null
  ) {
    return null;
  }
  return row.scoringEnvironment.value + model.slope * compositeDiff(row, model);
}
