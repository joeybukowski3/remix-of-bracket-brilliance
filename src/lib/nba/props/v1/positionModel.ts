/**
 * A small ridge logistic regression with deterministic cross-validation, for the position-review proposals.
 *
 * It exists to answer one narrow question with a measured error rate: given that ESPN lists a player as a guard (or a
 * forward), do his box-score rates look like a PG or SG (SF or PF) among players whose position is already known? The
 * out-of-fold probabilities say how often that answer is right, so a proposal can be held to a stated precision and
 * left unassigned below it. Nothing here touches the board or the position files.
 */

export interface LogisticModel {
  /** Weights for the standardized features; `bias` is separate and not penalized. */
  weights: number[];
  bias: number;
  mean: number[];
  sd: number[];
}

const MAX_ITERATIONS = 50;
const CONVERGED = 1e-9;
const MIN_SD = 1e-9;
const MAX_HALVINGS = 20;

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

/** Solves a x = b by Gaussian elimination with partial pivoting. The matrices here are at most ~10 x 10. */
export function solveLinear(a: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("singular system");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c += 1) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

function standardizer(x: readonly (readonly number[])[]): { mean: number[]; sd: number[] } {
  const d = x[0].length;
  const mean = Array.from({ length: d }, (_, j) => x.reduce((s, row) => s + row[j], 0) / x.length);
  const sd = Array.from({ length: d }, (_, j) => Math.max(MIN_SD, Math.sqrt(x.reduce((s, row) => s + (row[j] - mean[j]) ** 2, 0) / x.length)));
  return { mean, sd };
}

/** Fits P(y = 1) by Newton's method (IRLS) on standardized features, with an L2 penalty `lambda` on the weights. */
export function fitLogistic(x: readonly (readonly number[])[], y: readonly number[], lambda: number): LogisticModel {
  if (x.length === 0 || x.length !== y.length) throw new Error("fitLogistic needs matching, non-empty x and y");
  const { mean, sd } = standardizer(x);
  const z = x.map((row) => [1, ...row.map((v, j) => (v - mean[j]) / sd[j])]);
  const d = z[0].length;
  let w = new Array<number>(d).fill(0);
  /** The penalized negative log-likelihood the fit minimizes; a Newton step that raises it is halved. */
  const loss = (v: readonly number[]): number =>
    z.reduce((s, row, i) => {
      const t = row.reduce((acc, value, j) => acc + value * v[j], 0);
      return s + Math.log1p(Math.exp(-Math.abs(t))) + Math.max(t, 0) - y[i] * t;
    }, 0) + 0.5 * lambda * v.slice(1).reduce((s, value) => s + value * value, 0);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const p = z.map((row) => sigmoid(row.reduce((s, v, j) => s + v * w[j], 0)));
    const gradient = Array.from({ length: d }, (_, j) => z.reduce((s, row, i) => s + row[j] * (p[i] - y[i]), 0) + (j === 0 ? 0 : lambda * w[j]));
    const hessian = Array.from({ length: d }, (_, j) => Array.from({ length: d }, (_, k) => z.reduce((s, row, i) => s + row[j] * row[k] * (p[i] * (1 - p[i]) + 1e-9), 0) + (j === k && j > 0 ? lambda : 0)));
    const step = solveLinear(hessian, gradient);
    const before = loss(w);
    let scale = 1;
    let next = w.map((v, j) => v - step[j]);
    for (let halvings = 0; halvings < MAX_HALVINGS && loss(next) > before; halvings += 1) {
      scale /= 2;
      next = w.map((v, j) => v - scale * step[j]);
    }
    w = next;
    if (Math.max(...step.map(Math.abs)) * scale < CONVERGED) break;
  }
  return { bias: w[0], weights: w.slice(1), mean, sd };
}

export function standardized(model: LogisticModel, row: readonly number[]): number[] {
  return row.map((v, j) => (v - model.mean[j]) / model.sd[j]);
}

export function predictProbability(model: LogisticModel, row: readonly number[]): number {
  return sigmoid(model.bias + standardized(model, row).reduce((s, v, j) => s + v * model.weights[j], 0));
}

/**
 * Out-of-fold probabilities: every row is predicted by a model that never saw it. Folds are stratified by class and
 * assigned in the given row order, so the result is deterministic and does not depend on a random seed.
 */
export function outOfFold(x: readonly (readonly number[])[], y: readonly number[], lambda: number, folds: number): number[] {
  const fold = new Array<number>(y.length).fill(0);
  const seen = [0, 0];
  y.forEach((label, i) => {
    fold[i] = seen[label] % folds;
    seen[label] += 1;
  });
  const out = new Array<number>(y.length).fill(0.5);
  for (let f = 0; f < folds; f += 1) {
    const train = y.map((_, i) => i).filter((i) => fold[i] !== f);
    const test = y.map((_, i) => i).filter((i) => fold[i] === f);
    if (test.length === 0) continue;
    const model = fitLogistic(train.map((i) => x[i]), train.map((i) => y[i]), lambda);
    for (const i of test) out[i] = predictProbability(model, x[i]);
  }
  return out;
}

export interface ThresholdRow {
  threshold: number;
  /** Out-of-fold rows whose more likely class has at least this probability. */
  n: number;
  /** Share of all rows that clear the threshold. */
  coverage: number;
  /** Share of those rows whose more likely class was right. */
  precision: number | null;
  /** Lower end of the 95% Wilson interval of the precision: how low the true rate could plausibly be on this few players. */
  precisionLow: number | null;
}

/** Lower bound of the 95% Wilson score interval for `successes` out of `n`. */
export function wilsonLower(successes: number, n: number): number | null {
  if (n === 0) return null;
  const z = 1.959963984540054;
  const p = successes / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
}

/** Precision and coverage of "the more likely class" at each confidence threshold, from out-of-fold probabilities. */
export function thresholdTable(probabilities: readonly number[], y: readonly number[], thresholds: readonly number[]): ThresholdRow[] {
  return thresholds.map((threshold) => {
    const picked = probabilities.map((p, i) => ({ confidence: Math.max(p, 1 - p), right: (p >= 0.5 ? 1 : 0) === y[i] })).filter((r) => r.confidence >= threshold);
    const right = picked.filter((r) => r.right).length;
    return { threshold, n: picked.length, coverage: picked.length / Math.max(1, probabilities.length), precision: picked.length === 0 ? null : right / picked.length, precisionLow: wilsonLower(right, picked.length) };
  });
}

export const accuracy = (probabilities: readonly number[], y: readonly number[]): number => probabilities.filter((p, i) => (p >= 0.5 ? 1 : 0) === y[i]).length / Math.max(1, y.length);
