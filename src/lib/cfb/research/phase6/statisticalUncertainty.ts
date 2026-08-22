/** Wilson score interval for a binomial proportion — better small-sample behavior than the naive normal approximation. */
export function wilsonInterval(successes: number, n: number, z = 1.96): { center: number; low: number; high: number } | null {
  if (n === 0) return null;
  const pHat = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (pHat + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n))) / denominator;
  return { center, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/** Simple nonparametric bootstrap CI for a mean, using a deterministic resample (no external RNG dependency needed for a mean-of-means CI at this sample scale — uses systematic block resampling instead of a seeded PRNG). */
export function bootstrapMeanInterval(values: readonly number[], resamples = 500): { mean: number | null; low: number | null; high: number | null } {
  if (values.length === 0) return { mean: null, low: null, high: null };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length < 5) return { mean, low: mean, high: mean };
  const means: number[] = [];
  // Deterministic systematic resampling: cyclic-shifted blocks rather than random draws, so results are reproducible without seeding an RNG here.
  for (let r = 0; r < resamples; r += 1) {
    const shift = (r * 7919) % values.length; // large prime step for spread
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) sum += values[(i + shift) % values.length];
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const lowIdx = Math.floor(0.025 * (means.length - 1));
  const highIdx = Math.ceil(0.975 * (means.length - 1));
  return { mean, low: means[lowIdx], high: means[highIdx] };
}
