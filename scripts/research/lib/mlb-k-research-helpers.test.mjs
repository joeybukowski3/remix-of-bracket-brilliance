/**
 * RESEARCH ONLY -- tests for the high-line strikeout calibration helpers.
 * Run with: node --test scripts/research/lib/mlb-k-research-helpers.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  americanToImpliedProbability,
  bootstrapMeanCi,
  correlation,
  decomposeWorkloadError,
  filterLeakageSafe,
  gradeDirection,
  isLeakageSafeRow,
  linearRegression,
  lineBucket,
  mean,
  median,
  projectionDirection,
  quantile,
  rmse,
  stdev,
  windowAverage,
  windowKRate,
} from "./mlb-k-research-helpers.mjs";

test("lineBucket assigns each market line to exactly one bucket", () => {
  assert.equal(lineBucket(2.5), "<=3.5");
  assert.equal(lineBucket(3.5), "<=3.5");
  assert.equal(lineBucket(4.5), "4.5");
  assert.equal(lineBucket(5.5), "5.5");
  assert.equal(lineBucket(6.5), "6.5");
  assert.equal(lineBucket(7.5), "7.5");
  assert.equal(lineBucket(8.5), "8.5+");
  assert.equal(lineBucket(9.5), "8.5+");
});

test("lineBucket returns null for missing or non-numeric lines", () => {
  assert.equal(lineBucket(null), null);
  assert.equal(lineBucket(undefined), null);
  assert.equal(lineBucket("abc"), null);
  assert.equal(lineBucket(Number.NaN), null);
});

test("projectionDirection reports over, under and neutral", () => {
  assert.equal(projectionDirection(7.9, 7.5), "over");
  assert.equal(projectionDirection(6.1, 7.5), "under");
  assert.equal(projectionDirection(6, 6), "neutral");
  assert.equal(projectionDirection(null, 7.5), null);
  assert.equal(projectionDirection(7.9, null), null);
});

test("gradeDirection grades wins, losses and pushes", () => {
  assert.equal(gradeDirection("over", 9, 7.5), "WIN");
  assert.equal(gradeDirection("over", 5, 7.5), "LOSS");
  assert.equal(gradeDirection("under", 5, 7.5), "WIN");
  assert.equal(gradeDirection("under", 9, 7.5), "LOSS");
  assert.equal(gradeDirection("over", 6, 6), "PUSH");
  assert.equal(gradeDirection("under", 6, 6), "PUSH");
});

test("gradeDirection returns null for ungradeable input", () => {
  assert.equal(gradeDirection("neutral", 6, 7.5), null);
  assert.equal(gradeDirection("over", null, 7.5), null);
  assert.equal(gradeDirection("over", 6, null), null);
});

test("workload decomposition sums exactly to the total error", () => {
  const result = decomposeWorkloadError({
    projectedKRate: 0.28,
    projectedBF: 22,
    actualKs: 13,
    actualBF: 25,
  });
  assert.ok(result);
  assert.ok(Math.abs(result.workloadError + result.kRateError - result.totalError) < 1e-12);
  assert.ok(Math.abs(result.projectedKs - 6.16) < 1e-12);
  // Under-projected workload contributes a negative (under-projecting) term.
  assert.ok(result.workloadError < 0);
  assert.ok(result.kRateError < 0);
});

test("workload decomposition attributes a pure workload miss entirely to workload", () => {
  const result = decomposeWorkloadError({
    projectedKRate: 0.25,
    projectedBF: 20,
    actualKs: 6,
    actualBF: 24,
  });
  assert.ok(Math.abs(result.kRateError) < 1e-12);
  assert.ok(Math.abs(result.workloadError - -1) < 1e-12);
});

test("workload decomposition never divides by zero and rejects incomplete rows", () => {
  assert.equal(decomposeWorkloadError({ projectedKRate: 0.28, projectedBF: 22, actualKs: 5, actualBF: 0 }), null);
  assert.equal(decomposeWorkloadError({ projectedKRate: 0.28, projectedBF: 22, actualKs: 5, actualBF: null }), null);
  assert.equal(decomposeWorkloadError({ projectedKRate: null, projectedBF: 22, actualKs: 5, actualBF: 20 }), null);
  assert.equal(decomposeWorkloadError({ projectedKRate: 0.28, projectedBF: 22, actualKs: null, actualBF: 20 }), null);
});

test("leakage filter keeps pregame snapshots and drops post-slate ones", () => {
  const base = {
    kLine: 7.5,
    v2ProjectedKs: 6.1,
    actualKs: 9,
    slateDate: "2026-09-06",
    snapshotAt: "2026-09-06T17:31:00Z",
  };
  assert.equal(isLeakageSafeRow(base), true);
  assert.equal(isLeakageSafeRow({ ...base, snapshotAt: "2026-09-07T01:00:00Z" }), false);
  assert.equal(isLeakageSafeRow({ ...base, snapshotAt: "2026-09-05T17:00:00Z" }), true);
});

test("leakage filter drops rows missing a line, a projection or an outcome", () => {
  const base = {
    kLine: 7.5,
    v2ProjectedKs: 6.1,
    actualKs: 9,
    slateDate: "2026-09-06",
    snapshotAt: "2026-09-06T17:31:00Z",
  };
  assert.equal(isLeakageSafeRow({ ...base, kLine: null }), false);
  assert.equal(isLeakageSafeRow({ ...base, v2ProjectedKs: null }), false);
  assert.equal(isLeakageSafeRow({ ...base, actualKs: null }), false);
  assert.equal(isLeakageSafeRow(null), false);
  assert.equal(filterLeakageSafe([base, { ...base, actualKs: null }]).length, 1);
  assert.deepEqual(filterLeakageSafe(null), []);
});

test("summary statistics are null-safe on empty and single-value input", () => {
  assert.equal(mean([]), null);
  assert.equal(median([]), null);
  assert.equal(stdev([1]), null);
  assert.equal(rmse([]), null);
  assert.equal(correlation([]), null);
  assert.equal(linearRegression([[1, 1]]), null);
  assert.equal(bootstrapMeanCi([1]), null);
  assert.equal(quantile([4], 0.9), 4);
});

test("summary statistics ignore null and non-numeric entries", () => {
  assert.equal(mean([1, null, 3, "x", undefined]), 2);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(rmse([3, 4]), Math.sqrt(12.5));
});

test("linearRegression recovers a known slope and correlation", () => {
  const pairs = [[1, 3], [2, 5], [3, 7], [4, 9]];
  const fit = linearRegression(pairs);
  assert.ok(Math.abs(fit.slope - 2) < 1e-9);
  assert.ok(Math.abs(fit.intercept - 1) < 1e-9);
  assert.ok(Math.abs(fit.r - 1) < 1e-9);
  assert.equal(fit.n, 4);
});

test("linearRegression returns null when x has no variance", () => {
  assert.equal(linearRegression([[2, 1], [2, 5], [2, 9]]), null);
});

test("bootstrapMeanCi does not collapse on power-of-two sample sizes", () => {
  // Regression guard: a low-bit LCG index yields a fixed cycle when n is a
  // power of two, which silently produced zero-width confidence intervals.
  for (const n of [8, 16, 32, 64, 128, 256]) {
    const values = Array.from({ length: n }, (_, index) => index);
    const ci = bootstrapMeanCi(values);
    assert.ok(ci.upper - ci.lower > 0, `CI collapsed for n=${n}`);
  }
});

test("bootstrapMeanCi is deterministic across runs", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8];
  const first = bootstrapMeanCi(values);
  const second = bootstrapMeanCi(values);
  assert.deepEqual(first, second);
  assert.ok(first.lower <= first.mean && first.mean <= first.upper);
});

test("americanToImpliedProbability handles both signs and rejects junk", () => {
  assert.ok(Math.abs(americanToImpliedProbability("-158") - 158 / 258) < 1e-12);
  assert.ok(Math.abs(americanToImpliedProbability("+124") - 100 / 224) < 1e-12);
  assert.equal(americanToImpliedProbability(null), null);
  assert.equal(americanToImpliedProbability(""), null);
  assert.equal(americanToImpliedProbability("EVEN"), null);
});

test("windowKRate pools totals rather than averaging per-start rates", () => {
  const starts = [
    { k: 13, bf: 25 },
    { k: 3, bf: 11 },
    { k: 11, bf: 24 },
  ];
  assert.ok(Math.abs(windowKRate(starts, 3) - 27 / 60) < 1e-12);
  assert.ok(Math.abs(windowKRate(starts, 1) - 13 / 25) < 1e-12);
});

test("windowKRate returns null instead of dividing by zero", () => {
  assert.equal(windowKRate([{ k: 5, bf: 0 }], 1), null);
  assert.equal(windowKRate([], 3), null);
  assert.equal(windowKRate(null, 3), null);
  assert.equal(windowAverage(null, 3, "ip"), null);
  assert.equal(windowAverage([{ ip: 6 }, { ip: 4 }], 2, "ip"), 5);
});
