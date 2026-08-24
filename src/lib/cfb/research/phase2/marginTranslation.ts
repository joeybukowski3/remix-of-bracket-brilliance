import { solveLinearSystem } from "./linearSolver";

export type MarginTranslationInput = { ratingDifferential: number; actualMargin: number; isHome: boolean; isNeutral: boolean };
export type MarginTranslationCoefficients = { intercept: number; slope: number; hfa: number };

/**
 * Section 3: actualMargin = a + b*ratingDifferential (+ single transparent
 * HFA term), fit strictly on the rows passed in (caller must pass only
 * training-window rows — this module has no season/week awareness of its
 * own, so leakage is prevented by construction at the call site).
 */
export function fitMarginTranslation(rows: readonly MarginTranslationInput[]): MarginTranslationCoefficients {
  if (rows.length === 0) return { intercept: 0, slope: 0, hfa: 0 };
  // [intercept, slope, hfa] via normal equations on design [1, ratingDiff, homeIndicator]
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atb = [0, 0, 0];
  for (const row of rows) {
    const hfaValue = row.isNeutral ? 0 : row.isHome ? 1 : -1;
    const x = [1, row.ratingDifferential, hfaValue];
    for (let i = 0; i < 3; i += 1) {
      atb[i] += x[i] * row.actualMargin;
      for (let j = 0; j < 3; j += 1) ata[i][j] += x[i] * x[j];
    }
  }
  const [intercept, slope, hfa] = solveLinearSystem(ata, atb);
  return { intercept, slope, hfa };
}

export function predictMargin(
  ratingDifferential: number,
  isHome: boolean,
  isNeutral: boolean,
  coefficients: MarginTranslationCoefficients,
): number {
  const hfaValue = isNeutral ? 0 : isHome ? 1 : -1;
  return coefficients.intercept + coefficients.slope * ratingDifferential + coefficients.hfa * hfaValue;
}
