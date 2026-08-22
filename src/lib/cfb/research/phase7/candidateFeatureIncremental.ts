import { fitMultiOls, predictMultiOls, rSquared } from "./regressionUtils";
import type { MissDatasetRow } from "./types";

export type CandidateFeatureRow = MissDatasetRow & { candidateDifferential: number };

export type IncrementalTestResult = {
  n: number;
  marketOnlyR2: number | null;
  marketPlusModelR2: number | null;
  marketPlusModelPlusCandidateR2: number | null;
  modelOnlyR2: number | null;
  modelPlusCandidateR2: number | null;
  /** marketPlusModelPlusCandidateR2 - marketPlusModelR2: positive means the candidate adds information beyond market+IPR. */
  candidateGainOverMarketPlusModel: number | null;
  /** modelPlusCandidateR2 - modelOnlyR2: positive means the candidate improves IPR on its own. */
  candidateGainOverModelAlone: number | null;
};

function fitAndScore(rows: readonly { features: number[]; y: number }[], featureNames: string[]): number | null {
  if (rows.length < featureNames.length + 3) return null;
  const model = fitMultiOls(rows, featureNames);
  const predicted = rows.map((r) => predictMultiOls(model, r.features));
  return rSquared(rows.map((r) => r.y), predicted);
}

/**
 * Section 21/24 — for one candidate feature block (already joined onto
 * `candidateDifferential`, home-minus-away), compares:
 *  A. market-only vs market+IPR vs market+IPR+candidate (does the candidate
 *     carry information the market doesn't already have?)
 *  B. IPR-only vs IPR+candidate (does the candidate improve IPR on its own,
 *     independent of the market question?)
 * Never trains IPR to reproduce the market (Section 23) — this is a
 * read-only diagnostic regression, not fed back into any model output.
 */
export function testCandidateFeatureIncremental(rows: readonly CandidateFeatureRow[]): IncrementalTestResult {
  const usable = rows.filter((r) => r.marketMarginLatestObserved !== null);
  if (usable.length === 0) {
    return {
      n: 0,
      marketOnlyR2: null,
      marketPlusModelR2: null,
      marketPlusModelPlusCandidateR2: null,
      modelOnlyR2: null,
      modelPlusCandidateR2: null,
      candidateGainOverMarketPlusModel: null,
      candidateGainOverModelAlone: null,
    };
  }

  const y = usable.map((r) => r.actualMargin);
  const market = usable.map((r) => r.marketMarginLatestObserved as number);
  const model = usable.map((r) => r.modelMargin);
  const candidate = usable.map((r) => r.candidateDifferential);

  const marketOnlyR2 = fitAndScore(
    usable.map((_, i) => ({ features: [market[i]], y: y[i] })),
    ["market"],
  );
  const marketPlusModelR2 = fitAndScore(
    usable.map((_, i) => ({ features: [market[i], model[i]], y: y[i] })),
    ["market", "model"],
  );
  const marketPlusModelPlusCandidateR2 = fitAndScore(
    usable.map((_, i) => ({ features: [market[i], model[i], candidate[i]], y: y[i] })),
    ["market", "model", "candidate"],
  );
  const modelOnlyR2 = fitAndScore(
    usable.map((_, i) => ({ features: [model[i]], y: y[i] })),
    ["model"],
  );
  const modelPlusCandidateR2 = fitAndScore(
    usable.map((_, i) => ({ features: [model[i], candidate[i]], y: y[i] })),
    ["model", "candidate"],
  );

  return {
    n: usable.length,
    marketOnlyR2,
    marketPlusModelR2,
    marketPlusModelPlusCandidateR2,
    modelOnlyR2,
    modelPlusCandidateR2,
    candidateGainOverMarketPlusModel:
      marketPlusModelPlusCandidateR2 !== null && marketPlusModelR2 !== null ? marketPlusModelPlusCandidateR2 - marketPlusModelR2 : null,
    candidateGainOverModelAlone: modelPlusCandidateR2 !== null && modelOnlyR2 !== null ? modelPlusCandidateR2 - modelOnlyR2 : null,
  };
}
