import { describe, expect, it } from "vitest";
import { fitElasticNet, fitRidge, scoreLinearModel } from "./linear";
import type { EncodedRow } from "./scaling";

function toEncoded(values: number[]): EncodedRow {
  return { values, indicators: [] };
}

describe("linear models: determinism", () => {
  const rows = [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, -1],
    [-1, 2],
    [0.5, 0.5],
  ];
  const targets = [3, 1, 4, 5, -1, 2];

  it("fitRidge is a pure deterministic function of its inputs", () => {
    const first = fitRidge(rows, targets, 1);
    const second = fitRidge(rows, targets, 1);
    expect(second).toEqual(first);
  });

  it("fitElasticNet is a pure deterministic function of its inputs", () => {
    const first = fitElasticNet(rows, targets, 0.1, 0.5);
    const second = fitElasticNet(rows, targets, 0.1, 0.5);
    expect(second).toEqual(first);
  });

  it("recovers a near-perfect linear signal with negligible regularization", () => {
    // Zero-mean columns: fitRidge (like the standardized-feature pipeline it's designed for) centers
    // the TARGET via the intercept but does not itself mean-center columns, so recovery requires
    // zero-mean features -- exactly what `scaling.ts` guarantees for every real caller.
    const perfectRows = [[1, 0], [2, 0], [3, 0], [-1, 0], [-2, 0], [-3, 0], [0, 1], [0, 2], [0, 3], [0, -1], [0, -2], [0, -3]];
    const perfectTargets = perfectRows.map(([a, b]) => 2 * a + 3 * b);
    const model = fitRidge(perfectRows, perfectTargets, 0.001);
    expect(scoreLinearModel(model, toEncoded([4, 0]))).toBeCloseTo(8, 0);
    expect(scoreLinearModel(model, toEncoded([0, 4]))).toBeCloseTo(12, 0);
  });

  it("elastic net with a high L1 ratio drives an irrelevant coefficient toward zero", () => {
    const noisyRows = Array.from({ length: 40 }, (_, index) => [index % 5, (index * 7) % 11]);
    const noisyTargets = noisyRows.map(([signal]) => 2 * signal);
    const model = fitElasticNet(noisyRows, noisyTargets, 0.5, 0.95);
    expect(Math.abs(model.coefficients[1])).toBeLessThan(Math.abs(model.coefficients[0]));
  });
});
