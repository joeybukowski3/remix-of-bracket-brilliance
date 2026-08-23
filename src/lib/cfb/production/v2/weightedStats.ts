// CFB Model V2 — weighted mean helper (WU2). Faithful port of
// src/lib/cfb/research/derived/weightedStats.ts's weightedMean. Generic,
// no research-specific logic. With gameWeighted aggregation every weight is
// 1, so this reduces to a plain mean over non-null values.

export type CfbV2WeightedNumeric = { value: number | null; weight: number };

export function weightedMean(rows: readonly CfbV2WeightedNumeric[]): { mean: number | null; totalWeight: number } {
  let sumWeightedValue = 0;
  let totalWeight = 0;
  for (const row of rows) {
    if (row.value === null || row.weight <= 0) continue;
    sumWeightedValue += row.value * row.weight;
    totalWeight += row.weight;
  }
  return { mean: totalWeight === 0 ? null : sumWeightedValue / totalWeight, totalWeight };
}
