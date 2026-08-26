/**
 * Phase 11A: descriptive-accuracy and incremental-value metrics for the
 * JKB-vs-sportsbook research framework. Pure functions, no production/model
 * dependency. `bias` is defined as mean(prediction - actual): positive means
 * the predictor over-projects.
 */

function paired(actuals, predictions) {
  const n = Math.min(actuals.length, predictions.length);
  const a = [];
  const p = [];
  for (let i = 0; i < n; i += 1) {
    if (actuals[i] == null || predictions[i] == null) continue;
    a.push(actuals[i]);
    p.push(predictions[i]);
  }
  return { a, p };
}

export function mae(actuals, predictions) {
  const { a, p } = paired(actuals, predictions);
  if (a.length === 0) return null;
  return a.reduce((sum, actual, i) => sum + Math.abs(p[i] - actual), 0) / a.length;
}

export function rmse(actuals, predictions) {
  const { a, p } = paired(actuals, predictions);
  if (a.length === 0) return null;
  return Math.sqrt(a.reduce((sum, actual, i) => sum + (p[i] - actual) ** 2, 0) / a.length);
}

export function bias(actuals, predictions) {
  const { a, p } = paired(actuals, predictions);
  if (a.length === 0) return null;
  return a.reduce((sum, actual, i) => sum + (p[i] - actual), 0) / a.length;
}

export function pearsonCorrelation(x, y) {
  const { a: xs, p: ys } = paired(x, y);
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/** Fraction of predicted over/under sides matching the actual over/under side. Pushes are excluded from both numerator and denominator. */
export function directionHitRate(predictedSides, actualSides) {
  let n = 0;
  let hits = 0;
  const len = Math.min(predictedSides.length, actualSides.length);
  for (let i = 0; i < len; i += 1) {
    const predicted = predictedSides[i];
    const actual = actualSides[i];
    if (predicted == null || actual == null || actual === "push") continue;
    n += 1;
    if (predicted === actual) hits += 1;
  }
  return { n, hitRate: n === 0 ? null : hits / n };
}

/**
 * Ordinary least squares via the normal equations, with an intercept term
 * prepended automatically. `X` is an array of feature-vectors (arrays),
 * `y` the target vector. Returns null when the design matrix is singular
 * or under-determined -- callers must not silently substitute a fallback.
 */
export function fitOls(X, y) {
  const n = X.length;
  if (n === 0 || n !== y.length) return null;
  const p = X[0].length + 1; // +intercept
  if (n < p) return null;

  // Build XtX (p x p) and Xty (p) directly -- avoids a general matrix library dependency.
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = [1, ...X[i]];
    for (let a = 0; a < p; a += 1) {
      Xty[a] += row[a] * y[i];
      for (let b = 0; b < p; b += 1) XtX[a][b] += row[a] * row[b];
    }
  }

  const coefficients = solveLinearSystem(XtX, Xty);
  if (!coefficients) return null;

  const predictions = X.map((row) => coefficients[0] + row.reduce((s, v, i) => s + v * coefficients[i + 1], 0));
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  const ssTot = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - predictions[i]) ** 2, 0);
  const r2 = ssTot === 0 ? null : 1 - ssRes / ssTot;

  return { coefficients, r2, predictions };
}

/** Gaussian elimination with partial pivoting. Returns null for a singular matrix. */
function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
    }
    if (Math.abs(M[pivotRow][col]) < 1e-10) return null;
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = M[row][col] / M[col][col];
      for (let c = col; c <= n; c += 1) M[row][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Compares R² of `actual ~ baseFeatures` vs `actual ~ extendedFeatures`
 * (extendedFeatures must be a superset of baseFeatures' information, e.g.
 * [line] vs [line, projection]). Both fits use the SAME rows.
 */
export function incrementalR2(baseX, extendedX, y) {
  const baseFit = fitOls(baseX, y);
  const extendedFit = fitOls(extendedX, y);
  if (!baseFit || !extendedFit || baseFit.r2 == null || extendedFit.r2 == null) return null;
  return { baseR2: baseFit.r2, extendedR2: extendedFit.r2, incrementalR2: extendedFit.r2 - baseFit.r2, baseFit, extendedFit };
}
