import { featureValue } from "./featureSets";
import type { FeatureKey, FittedScaler, Row } from "./types";

/**
 * Explicit missingness handling (spec section 8): "zero after standardized
 * missingness indicator". For every feature, fit mean/scale from the PRESENT
 * (non-null) training values only. At apply time, a present value is
 * standardized normally; a missing value becomes 0 (the standardized mean)
 * AND a paired 0/1 missingness indicator is emitted for any feature that had
 * >0% missingness in training. This never substitutes a league/position
 * average value for the feature itself -- the indicator lets a linear model
 * learn a distinct, explicit offset for "missing" rather than silently
 * pretending it was average.
 *
 * Scalers MUST be fit on training (2023) rows only during model selection
 * (spec section 8) -- callers must never pass 2024 or 2025 rows here before a
 * position's spec is frozen.
 */

export function fitScalers(trainingRows: readonly Row[], features: readonly FeatureKey[]): readonly FittedScaler[] {
  return features.map((feature) => {
    const present = trainingRows
      .map((row) => featureValue(row, feature))
      .filter((value): value is number => value != null);
    const missingRateInTraining = trainingRows.length ? 1 - present.length / trainingRows.length : 0;
    const mean = present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : 0;
    const variance = present.length ? present.reduce((sum, value) => sum + (value - mean) ** 2, 0) / present.length : 0;
    const scale = Math.sqrt(variance) || 1;
    return { feature, mean, scale, missingRateInTraining, hasMissingIndicator: missingRateInTraining > 0 };
  });
}

export type EncodedRow = {
  values: number[]; // standardized feature values, one per scaler, missing -> 0
  indicators: number[]; // 1 if that feature was missing on this row, only for scalers with hasMissingIndicator
};

export function encodeRow(row: Row, scalers: readonly FittedScaler[]): EncodedRow {
  const values: number[] = [];
  const indicators: number[] = [];
  for (const scaler of scalers) {
    const raw = featureValue(row, scaler.feature);
    if (raw == null) {
      values.push(0);
      if (scaler.hasMissingIndicator) indicators.push(1);
    } else {
      values.push((raw - scaler.mean) / scaler.scale);
      if (scaler.hasMissingIndicator) indicators.push(0);
    }
  }
  return { values, indicators };
}

/** Total encoded design-matrix width: one column per feature, plus one column per feature that had training missingness. */
export function encodedWidth(scalers: readonly FittedScaler[]): number {
  return scalers.length + scalers.filter((scaler) => scaler.hasMissingIndicator).length;
}

export function flattenEncodedRow(encoded: EncodedRow): number[] {
  return [...encoded.values, ...encoded.indicators];
}
