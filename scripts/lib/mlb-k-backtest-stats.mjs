/**
 * mlb-k-backtest-stats.mjs
 *
 * Small pure statistics helpers for the Projected K backtest analyzer.
 * Signed error convention throughout: error = actual - projection
 * (positive error => the model UNDER-projected).
 */

export function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

export function rmse(errors) {
  const valid = errors.filter(Number.isFinite);
  return valid.length ? Math.sqrt(valid.reduce((sum, value) => sum + value ** 2, 0) / valid.length) : null;
}

export function pearson(pairs) {
  const valid = pairs.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (valid.length < 3) return null;
  const meanA = mean(valid.map(([a]) => a));
  const meanB = mean(valid.map(([, b]) => b));
  const numerator = valid.reduce((sum, [a, b]) => sum + (a - meanA) * (b - meanB), 0);
  const denomA = Math.sqrt(valid.reduce((sum, [a]) => sum + (a - meanA) ** 2, 0));
  const denomB = Math.sqrt(valid.reduce((sum, [, b]) => sum + (b - meanB) ** 2, 0));
  return denomA > 0 && denomB > 0 ? numerator / (denomA * denomB) : null;
}

export function stddev(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return null;
  const m = mean(valid);
  return Math.sqrt(valid.reduce((sum, value) => sum + (value - m) ** 2, 0) / (valid.length - 1));
}

/**
 * Full error profile for one projection view.
 * @param {Array<{actual:number, projection:number}>} rows
 */
export function errorProfile(rows) {
  const usable = rows.filter((row) => Number.isFinite(row.actual) && Number.isFinite(row.projection));
  if (!usable.length) return { sampleSize: 0 };
  const errors = usable.map((row) => row.actual - row.projection);
  return {
    sampleSize: usable.length,
    meanActual: round(mean(usable.map((row) => row.actual)), 3),
    meanProjection: round(mean(usable.map((row) => row.projection)), 3),
    bias: round(mean(errors), 4),
    mae: round(mean(errors.map(Math.abs)), 4),
    rmse: round(rmse(errors), 4),
    medianAbsError: round(median(errors.map(Math.abs)), 4),
    correlation: round(pearson(usable.map((row) => [row.projection, row.actual])), 4),
  };
}

/** Ordinary least squares: y ~ 1 + X. Returns intercept + per-column coeffs. */
export function ols(y, columns) {
  const n = y.length;
  const k = columns.length + 1;
  const design = y.map((_, index) => [1, ...columns.map((column) => column[index])]);
  const xtx = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty = new Array(k).fill(0);
  for (let row = 0; row < n; row += 1) {
    for (let i = 0; i < k; i += 1) {
      xty[i] += design[row][i] * y[row];
      for (let j = 0; j < k; j += 1) xtx[i][j] += design[row][i] * design[row][j];
    }
  }
  const solved = solveLinearSystem(xtx, xty);
  if (!solved) return null;
  return { intercept: solved[0], coefficients: solved.slice(1) };
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) maxRow = row;
    }
    if (Math.abs(augmented[maxRow][pivot]) < 1e-12) return null;
    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot] / augmented[pivot][pivot];
      for (let col = pivot; col <= n; col += 1) augmented[row][col] -= factor * augmented[pivot][col];
    }
  }
  return augmented.map((row, index) => row[n] / row[index]);
}

/** Split values into `count` roughly equal-size buckets by rank; returns bucket index per value. */
export function tercileEdges(values, count = 3) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < count) return [];
  const edges = [];
  for (let i = 1; i < count; i += 1) edges.push(sorted[Math.floor((sorted.length * i) / count)]);
  return edges;
}

export function bucketByEdges(value, edges) {
  if (!Number.isFinite(value)) return "unknown";
  let index = 0;
  for (const edge of edges) {
    if (value >= edge) index += 1;
  }
  return `q${index + 1}`;
}
