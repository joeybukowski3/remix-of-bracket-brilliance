/** Dense Gaussian elimination with partial pivoting. n is small here (~260), so this is fast and numerically fine. */
export function solveLinearSystem(matrix: readonly (readonly number[])[], vector: readonly number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row) => [...row]);
  const b = [...vector];

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > pivotValue) {
        pivotRow = row;
        pivotValue = Math.abs(a[row][col]);
      }
    }
    if (pivotValue < 1e-12) continue; // singular direction — leave as-is, ridge penalty should prevent this
    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow], a[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }
    const pivot = a[col][col];
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / pivot;
      if (factor === 0) continue;
      for (let k = col; k < n; k += 1) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let col = row + 1; col < n; col += 1) sum -= a[row][col] * x[col];
    x[row] = Math.abs(a[row][row]) < 1e-12 ? 0 : sum / a[row][row];
  }
  return x;
}
