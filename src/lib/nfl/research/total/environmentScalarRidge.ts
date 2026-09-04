/**
 * Phase N, Model C -- separately-calibrated scoring-environment scalar.
 *
 * Step 1: fit a ridge on the 5 RELATIVE features only (offense EPA/success,
 * opponent-defense-allowed EPA/success, home) -- no scoringEnvironment
 * column at all, target = actualTeamPoints directly (this is "Model B",
 * reused here as the base for Model C).
 *
 * Step 2: pick a non-negative scalar alpha in [0, 1] from a small
 * pre-specified candidate set via an INTERNAL train/validation split of
 * the training fold itself (never the outer validation season, never
 * 2025). `selectEnvironmentAlpha` takes exactly the internal-train and
 * internal-validation row sets as arguments and is a pure function of
 * them -- it has no way to read any row not passed in, which is what
 * makes it leakage-safe by construction (see environmentScalarRidge.test.ts's
 * "poisoned outer scope" test for a direct proof).
 *
 * Step 3: prediction = baseRelativeRidge(row) + alpha * (row.scoringEnvironment.value - envReferenceMean),
 * where envReferenceMean is the mean scoringEnvironment value over the
 * SAME rows the relative ridge in that step was fit on (internal-train
 * during selection; the full training fold for the final applied model).
 * "Centered" means relative to this reference -- when a row's environment
 * equals the reference, the environment term contributes exactly 0, and
 * alpha controls how much a deviation from that reference shifts the
 * prediction. alpha=0 reproduces Model B exactly; alpha=1 fully trusts the
 * raw environment deviation.
 */
import { fitRidgeModel, scoreRidgeModel, type FittedRidgeModel } from "@/lib/nfl/props/ridge";
import { rawResidualFeatures } from "./residualRidge";
import { mae } from "./metrics";
import type { NflTotalResearchDatasetRow } from "./types";

export function fitRelativeRidgeNoEnvironment(trainRows: readonly NflTotalResearchDatasetRow[], lambda: number): FittedRidgeModel {
  const usable = trainRows.filter((r) => rawResidualFeatures(r) !== null);
  if (usable.length === 0) throw new Error("fitRelativeRidgeNoEnvironment: zero usable training rows.");
  const rawRows = usable.map((r) => [...rawResidualFeatures(r)!]);
  const targets = usable.map((r) => r.actualTeamPoints);
  return fitRidgeModel(rawRows, targets, lambda);
}

export function computeEnvReferenceMean(rows: readonly NflTotalResearchDatasetRow[]): number | null {
  const values = rows.map((r) => r.scoringEnvironment.value).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function scoreWithEnvironmentScalar(
  relativeRidge: FittedRidgeModel,
  envReferenceMean: number,
  alpha: number,
  row: NflTotalResearchDatasetRow,
): number | null {
  const features = rawResidualFeatures(row);
  if (features === null || row.scoringEnvironment.value === null) return null;
  const base = scoreRidgeModel(relativeRidge, features);
  return base + alpha * (row.scoringEnvironment.value - envReferenceMean);
}

export type AlphaSelectionResult = {
  selectedAlpha: number;
  envReferenceMean: number;
  scores: { alpha: number; internalValTeamPointMae: number | null }[];
};

/**
 * Chooses alpha by internal-validation team-point MAE only. Ties (equal
 * MAE within floating-point tolerance) resolve toward the SMALLEST alpha
 * -- the more conservative, environment-trusts-less choice -- documented
 * so the rule is not an unstated implementation detail.
 */
export function selectEnvironmentAlpha(
  internalTrainRows: readonly NflTotalResearchDatasetRow[],
  internalValRows: readonly NflTotalResearchDatasetRow[],
  lambda: number,
  alphaCandidates: readonly number[],
): AlphaSelectionResult {
  const relativeRidge = fitRelativeRidgeNoEnvironment(internalTrainRows, lambda);
  const envReferenceMean = computeEnvReferenceMean(internalTrainRows);
  if (envReferenceMean === null) throw new Error("selectEnvironmentAlpha: internal-train rows have no resolvable scoringEnvironment.");

  const scores = alphaCandidates.map((alpha) => {
    const errors = internalValRows
      .map((r) => {
        const p = scoreWithEnvironmentScalar(relativeRidge, envReferenceMean, alpha, r);
        return p === null ? null : p - r.actualTeamPoints;
      })
      .filter((e): e is number => e !== null);
    return { alpha, internalValTeamPointMae: mae(errors) };
  });

  let best = scores[0];
  for (const s of scores) {
    if (s.internalValTeamPointMae === null) continue;
    if (best.internalValTeamPointMae === null || s.internalValTeamPointMae < best.internalValTeamPointMae - 1e-9) best = s;
  }
  return { selectedAlpha: best.alpha, envReferenceMean, scores };
}
