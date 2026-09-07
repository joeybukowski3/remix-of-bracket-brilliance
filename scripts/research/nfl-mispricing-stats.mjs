/**
 * Statistics and false-discovery control for the market-mispricing search.
 *
 * This search deliberately tests dozens of niches, so uncorrected significance
 * is meaningless here. Discovery p-values go through Benjamini-Hochberg, and
 * anything that survives is then re-tested on seasons never used for discovery.
 * A hypothesis discovered on a set of games can never be validated on those
 * same games.
 */

export const mean = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0);
export const sd = (values) => {
  if (values.length < 2) return 0;
  const centre = mean(values);
  return Math.sqrt(values.reduce((total, value) => total + (value - centre) ** 2, 0) / (values.length - 1));
};
export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Abramowitz & Stegun 7.1.26; ample for p-values on samples of this size. */
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
export const twoSidedP = (z) => 2 * (1 - normalCdf(Math.abs(z)));

export function correlation(xs, ys) {
  if (xs.length < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  const sx = sd(xs);
  const sy = sd(ys);
  if (sx === 0 || sy === 0) return 0;
  return xs.reduce((total, x, i) => total + (x - mx) * (ys[i] - my), 0) / ((xs.length - 1) * sx * sy);
}

const slope = (a, b) => {
  const ma = mean(a);
  const mb = mean(b);
  const variance = a.reduce((total, value) => total + (value - ma) ** 2, 0);
  return variance > 0 ? a.reduce((total, value, i) => total + (value - ma) * (b[i] - mb), 0) / variance : 0;
};
const residualise = (values, control) => {
  const beta = slope(control, values);
  const intercept = mean(values) - beta * mean(control);
  return values.map((value, i) => value - (intercept + beta * control[i]));
};

/**
 * Correlation between a feature and market error after projecting the spread
 * out of both. This is the number that matters: a feature that only predicts
 * football lands near zero here because the spread already carries it.
 */
export function partialCorrelation(values, target, control) {
  if (values.length < 10) return { r: 0, n: values.length, p: 1 };
  const rv = residualise(values, control);
  const rt = residualise(target, control);
  const r = correlation(rv, rt);
  // Two degrees of freedom are spent on the control, hence n - 3.
  const df = values.length - 3;
  const z = df > 0 && Math.abs(r) < 1 ? r * Math.sqrt(df / (1 - r * r)) : 0;
  return { r, n: values.length, p: twoSidedP(z) };
}

/** Mean market error in the backed direction, with a one-sample test against zero. */
export function segmentStats(signs, marketError) {
  const picked = [];
  for (let i = 0; i < signs.length; i += 1) if (signs[i] !== 0 && Number.isFinite(marketError[i])) picked.push(signs[i] * marketError[i]);
  if (picked.length === 0) return { n: 0, mean: 0, median: 0, p: 1, wins: 0, losses: 0, pushes: 0, cover: 0, ci: [0, 0] };
  const m = mean(picked);
  const s = sd(picked);
  const se = s / Math.sqrt(picked.length);
  const wins = picked.filter((value) => value > 0).length;
  const losses = picked.filter((value) => value < 0).length;
  const pushes = picked.filter((value) => value === 0).length;
  return {
    n: picked.length, mean: m, median: median(picked),
    p: se > 0 ? twoSidedP(m / se) : 1,
    wins, losses, pushes, cover: wins + losses > 0 ? wins / (wins + losses) : 0,
    ci: [m - 1.96 * se, m + 1.96 * se],
    atsCi: wilson(wins, wins + losses),
  };
}

export function wilson(wins, total) {
  if (total === 0) return [0, 0];
  const p = wins / total;
  const z = 1.96;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return [centre - half, centre + half];
}

/**
 * Benjamini-Hochberg. Returns each entry with its BH critical value and whether
 * it survives at the given false-discovery rate.
 */
export function benjaminiHochberg(entries, q = 0.10) {
  const sorted = [...entries].sort((a, b) => a.p - b.p);
  const m = sorted.length;
  let lastSurviving = -1;
  sorted.forEach((entry, index) => {
    entry.bhCritical = ((index + 1) / m) * q;
    if (entry.p <= entry.bhCritical) lastSurviving = index;
  });
  sorted.forEach((entry, index) => { entry.survivesFdr = index <= lastSurviving; });
  return sorted;
}

/**
 * Permutation null: shuffle market error within season, so any seasonal
 * structure is preserved while the game-level pairing is destroyed. Reports how
 * often the shuffled data produces a statistic at least as extreme.
 */
export function permutationP(statistic, values, target, seasons, iterations = 2000, seed = 12345) {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const bySeason = new Map();
  seasons.forEach((season, index) => {
    if (!bySeason.has(season)) bySeason.set(season, []);
    bySeason.get(season).push(index);
  });
  const observed = Math.abs(statistic(values, target));
  let extreme = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffled = target.slice();
    for (const indices of bySeason.values()) {
      for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const a = indices[i];
        const b = indices[j];
        [shuffled[a], shuffled[b]] = [shuffled[b], shuffled[a]];
      }
    }
    if (Math.abs(statistic(values, shuffled)) >= observed) extreme += 1;
  }
  return (extreme + 1) / (iterations + 1);
}

/** Bootstrap interval for the mean, resampling games with replacement. */
export function bootstrapMeanCi(values, iterations = 2000, seed = 999) {
  if (values.length < 5) return [0, 0];
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const means = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let i = 0; i < values.length; i += 1) total += values[Math.floor(random() * values.length)];
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * means.length)], means[Math.floor(0.975 * means.length)]];
}
