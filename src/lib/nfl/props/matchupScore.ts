/**
 * Leakage-safe primitives for Phase 8 yardage Matchup Scores.
 *
 * A score is built from pregame-only football indicators. Each indicator is
 * mapped through a fixed empirical reference distribution before dimension
 * scores are combined. Nothing here accepts projected yards, actual yards,
 * sportsbook data, or uncertainty estimates.
 */

export type MatchupIndicatorDirection = "higherIsBetter" | "lowerIsBetter";

export type MatchupIndicatorDefinition<Row> = {
  key: string;
  direction: MatchupIndicatorDirection;
  value: (row: Row) => number | null;
};

export type MatchupIndicatorReference = {
  key: string;
  direction: MatchupIndicatorDirection;
  sortedValues: readonly number[];
};

export type MatchupDimensionReference = {
  key: string;
  indicators: readonly MatchupIndicatorReference[];
};

export type MatchupDimensionScore = {
  key: string;
  score: number;
  indicatorScores: Readonly<Record<string, number>>;
};

export type MatchupCandidateScore = {
  score: number;
  weights: Readonly<Record<string, number>>;
};

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Matchup score must be finite.");
  return Math.min(100, Math.max(0, value));
}

export function buildDimensionReference<Row>(
  key: string,
  rows: readonly Row[],
  indicators: readonly MatchupIndicatorDefinition<Row>[],
): MatchupDimensionReference {
  if (rows.length === 0) throw new Error(`Cannot build ${key} reference from zero rows.`);
  return {
    key,
    indicators: indicators.map((indicator) => {
      const sortedValues = rows
        .map(indicator.value)
        .filter((value): value is number => value != null && Number.isFinite(value))
        .sort((left, right) => left - right);
      if (sortedValues.length === 0) throw new Error(`Indicator ${indicator.key} has no finite reference values.`);
      return { key: indicator.key, direction: indicator.direction, sortedValues };
    }),
  };
}

export function buildGroupedDimensionReferences<Row>(
  key: string,
  rows: readonly Row[],
  indicators: readonly MatchupIndicatorDefinition<Row>[],
  group: (row: Row) => string,
): Readonly<Record<string, MatchupDimensionReference>> {
  const groups = [...new Set(rows.map(group))];
  if (groups.length === 0) throw new Error(`Cannot build grouped ${key} reference from zero rows.`);
  return Object.fromEntries(groups.map((groupKey) => [
    groupKey,
    buildDimensionReference(key, rows.filter((row) => group(row) === groupKey), indicators),
  ]));
}

export function assertSelectionExcludesSeason<Row extends { season: number }>(
  rows: readonly Row[],
  excludedSeason: number,
): void {
  if (rows.some((row) => row.season === excludedSeason)) {
    throw new Error(`Selection rows must exclude frozen season ${excludedSeason}.`);
  }
}

/** Mid-rank empirical percentile. Missing current-row values are neutral (50). */
export function empiricalPercentile(
  value: number | null,
  reference: MatchupIndicatorReference,
): number {
  if (value == null || !Number.isFinite(value)) return 50;
  const values = reference.sortedValues;
  if (values.length === 0) throw new Error(`Indicator ${reference.key} has an empty reference.`);

  let lower = 0;
  while (lower < values.length && values[lower] < value) lower += 1;
  let upper = lower;
  while (upper < values.length && values[upper] === value) upper += 1;
  const percentile = (lower + (upper - lower) / 2) / values.length * 100;
  return clampScore(reference.direction === "higherIsBetter" ? percentile : 100 - percentile);
}

export function scoreDimension<Row>(
  row: Row,
  definitions: readonly MatchupIndicatorDefinition<Row>[],
  reference: MatchupDimensionReference,
): MatchupDimensionScore {
  if (definitions.length !== reference.indicators.length) {
    throw new Error(`Dimension ${reference.key} definition/reference width mismatch.`);
  }
  const indicatorScores: Record<string, number> = {};
  definitions.forEach((definition, index) => {
    const indicatorReference = reference.indicators[index];
    if (definition.key !== indicatorReference.key) {
      throw new Error(`Dimension ${reference.key} indicator order mismatch at ${definition.key}.`);
    }
    indicatorScores[definition.key] = empiricalPercentile(definition.value(row), indicatorReference);
  });
  const scores = Object.values(indicatorScores);
  return {
    key: reference.key,
    score: clampScore(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    indicatorScores,
  };
}

export function combineDimensionScores(
  dimensions: Readonly<Record<string, number>>,
  weights: Readonly<Record<string, number>>,
): MatchupCandidateScore {
  const entries = Object.entries(weights);
  if (entries.length === 0) throw new Error("A Matchup Score requires at least one dimension weight.");
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) throw new Error("Matchup Score weights must sum to a positive finite value.");
  let weighted = 0;
  for (const [key, weight] of entries) {
    const value = dimensions[key];
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`Weight ${key} must be finite and non-negative.`);
    if (!Number.isFinite(value)) throw new Error(`Dimension ${key} is missing or non-finite.`);
    weighted += value * weight;
  }
  return { score: clampScore(weighted / totalWeight), weights: Object.fromEntries(entries.map(([key, weight]) => [key, weight / totalWeight])) };
}

/** Deterministic non-negative weight grid used for transparent development-fold research. */
export function enumerateSimpleWeights(
  keys: readonly string[],
  step = 0.1,
  constraints: { maxByKey?: Readonly<Record<string, number>>; minWeight?: number } = {},
): Readonly<Record<string, number>>[] {
  if (keys.length === 0) throw new Error("Cannot enumerate weights for zero dimensions.");
  const units = Math.round(1 / step);
  if (Math.abs(units * step - 1) > 1e-9) throw new Error("Weight step must divide 1 exactly.");
  const minUnits = Math.round((constraints.minWeight ?? step) / step);
  const results: Record<string, number>[] = [];
  const visit = (index: number, remaining: number, current: number[]) => {
    if (index === keys.length - 1) {
      const unitsForKey = remaining;
      const max = constraints.maxByKey?.[keys[index]] ?? 1;
      if (unitsForKey < minUnits || unitsForKey * step > max + 1e-9) return;
      const all = [...current, unitsForKey];
      results.push(Object.fromEntries(keys.map((key, i) => [key, Number((all[i] * step).toFixed(10))])));
      return;
    }
    const max = constraints.maxByKey?.[keys[index]] ?? 1;
    for (let value = minUnits; value <= remaining; value += 1) {
      if (value * step > max + 1e-9) break;
      visit(index + 1, remaining - value, [...current, value]);
    }
  };
  visit(0, units, []);
  return results;
}

export function pearsonCorrelation(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? covariance / denominator : null;
}
