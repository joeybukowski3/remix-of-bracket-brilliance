// CFB Model V2 — z-score standardization (WU2). Faithful port of
// src/lib/cfb/research/phase2/standardize.ts — generic, no research-specific
// logic. See standardize.test.ts for parity against the research original.

export type CfbV2Standardizer = { mean: number; std: number };

export function fitStandardizer(values: readonly number[]): CfbV2Standardizer {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { mean: 0, std: 1 };
  const mean = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  const variance = finite.reduce((sum, v) => sum + (v - mean) ** 2, 0) / finite.length;
  const std = Math.sqrt(variance);
  return { mean, std: std > 1e-9 ? std : 1 };
}

export function applyStandardizer(value: number, standardizer: CfbV2Standardizer): number {
  return (value - standardizer.mean) / standardizer.std;
}
