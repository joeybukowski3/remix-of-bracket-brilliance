import { solveLinearSystem } from "../phase2/linearSolver";

export type IncrementalRegressionResult = {
  n: number;
  intercept: number;
  modelCoefficient: number;
  marketCoefficient: number;
  /** R² of the combined fit vs. market-only fit — a positive gain means the model retains information beyond the market. */
  combinedR2: number;
  marketOnlyR2: number;
  modelOnlyR2: number;
};

function fitOls(rows: readonly { x1: number; x2: number; y: number }[]): { intercept: number; b1: number; b2: number } {
  const n = rows.length;
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atb = [0, 0, 0];
  for (const row of rows) {
    const x = [1, row.x1, row.x2];
    for (let i = 0; i < 3; i += 1) {
      atb[i] += x[i] * row.y;
      for (let j = 0; j < 3; j += 1) ata[i][j] += x[i] * x[j];
    }
  }
  const [intercept, b1, b2] = solveLinearSystem(ata, atb);
  void n;
  return { intercept, b1, b2 };
}

function rSquared(rows: readonly { y: number }[], predictions: readonly number[]): number {
  const n = rows.length;
  const meanY = rows.reduce((s, r) => s + r.y, 0) / n;
  const ssTot = rows.reduce((s, r) => s + (r.y - meanY) ** 2, 0);
  const ssRes = rows.reduce((s, r, i) => s + (r.y - predictions[i]) ** 2, 0);
  return ssTot < 1e-9 ? 0 : 1 - ssRes / ssTot;
}

/**
 * Section 13: diagnostic-only regression actualMargin = a + b1*modelMargin
 * + b2*marketMargin. Explicitly NOT part of IPR and never fed back into
 * any model output — a research diagnostic answering whether the
 * independent model retains information once the market is known.
 */
export function fitIncrementalInformationRegression(
  rows: readonly { modelMargin: number; marketMargin: number; actualMargin: number }[],
): IncrementalRegressionResult {
  const combined = fitOls(rows.map((r) => ({ x1: r.modelMargin, x2: r.marketMargin, y: r.actualMargin })));
  const combinedPredictions = rows.map((r) => combined.intercept + combined.b1 * r.modelMargin + combined.b2 * r.marketMargin);

  const marketOnly = fitOls(rows.map((r) => ({ x1: r.marketMargin, x2: 0, y: r.actualMargin })));
  const marketOnlyPredictions = rows.map((r) => marketOnly.intercept + marketOnly.b1 * r.marketMargin);

  const modelOnly = fitOls(rows.map((r) => ({ x1: r.modelMargin, x2: 0, y: r.actualMargin })));
  const modelOnlyPredictions = rows.map((r) => modelOnly.intercept + modelOnly.b1 * r.modelMargin);

  const yRows = rows.map((r) => ({ y: r.actualMargin }));
  return {
    n: rows.length,
    intercept: combined.intercept,
    modelCoefficient: combined.b1,
    marketCoefficient: combined.b2,
    combinedR2: rSquared(yRows, combinedPredictions),
    marketOnlyR2: rSquared(yRows, marketOnlyPredictions),
    modelOnlyR2: rSquared(yRows, modelOnlyPredictions),
  };
}
