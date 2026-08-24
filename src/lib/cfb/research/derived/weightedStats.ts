/** Shared weighted-average / weighted-rate helpers used by every Phase 1 metric aggregator. */

export type WeightedNumeric = { value: number | null; weight: number };

export function weightedMean(rows: readonly WeightedNumeric[]): { mean: number | null; totalWeight: number } {
  let sumWeightedValue = 0;
  let totalWeight = 0;
  for (const row of rows) {
    if (row.value === null || row.weight <= 0) continue;
    sumWeightedValue += row.value * row.weight;
    totalWeight += row.weight;
  }
  return { mean: totalWeight === 0 ? null : sumWeightedValue / totalWeight, totalWeight };
}

export function weightedRate(
  rows: readonly { value: boolean | null; weight: number }[],
): { rate: number | null; totalWeight: number } {
  const { mean, totalWeight } = weightedMean(
    rows.map((row) => ({ value: row.value === null ? null : row.value ? 1 : 0, weight: row.weight })),
  );
  return { rate: mean, totalWeight };
}
