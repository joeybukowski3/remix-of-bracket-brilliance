export type Standardizer = { mean: number; std: number };

/** Training-window-only z-score fit — never call with test-window values (Section 7/11). */
export function fitStandardizer(values: readonly number[]): Standardizer {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { mean: 0, std: 1 };
  const mean = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  const variance = finite.reduce((sum, v) => sum + (v - mean) ** 2, 0) / finite.length;
  const std = Math.sqrt(variance);
  return { mean, std: std > 1e-9 ? std : 1 };
}

export function applyStandardizer(value: number, standardizer: Standardizer): number {
  return (value - standardizer.mean) / standardizer.std;
}
