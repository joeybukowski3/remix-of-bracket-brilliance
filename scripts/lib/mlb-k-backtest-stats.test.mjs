import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { errorProfile, ols, pearson, tercileEdges, bucketByEdges } from "./mlb-k-backtest-stats.mjs";

describe("errorProfile", () => {
  it("computes bias/MAE/RMSE with the actual − projection convention", () => {
    const profile = errorProfile([
      { actual: 6, projection: 5 }, // +1
      { actual: 4, projection: 5 }, // -1
      { actual: 7, projection: 5 }, // +2
    ]);
    assert.equal(profile.sampleSize, 3);
    assert.equal(profile.bias, 0.6667);
    assert.equal(profile.mae, 1.3333);
    assert.equal(profile.rmse, 1.4142);
  });

  it("ignores rows missing either value", () => {
    const profile = errorProfile([{ actual: 6, projection: null }, { actual: null, projection: 4 }, { actual: 5, projection: 5 }]);
    assert.equal(profile.sampleSize, 1);
  });
});

describe("ols", () => {
  it("recovers a known linear relationship", () => {
    const x = [1, 2, 3, 4, 5, 6];
    const y = x.map((value) => 2 + 3 * value);
    const fit = ols(y, [x]);
    assert.ok(Math.abs(fit.intercept - 2) < 1e-6);
    assert.ok(Math.abs(fit.coefficients[0] - 3) < 1e-6);
  });
});

describe("pearson", () => {
  it("returns 1 for a perfectly correlated series and null for tiny samples", () => {
    assert.ok(Math.abs(pearson([[1, 2], [2, 4], [3, 6], [4, 8]]) - 1) < 1e-9);
    assert.equal(pearson([[1, 2]]), null);
  });
});

describe("tercile bucketing", () => {
  it("splits into three ordered buckets", () => {
    const values = Array.from({ length: 30 }, (_, index) => index);
    const edges = tercileEdges(values);
    assert.equal(edges.length, 2);
    assert.equal(bucketByEdges(0, edges), "q1");
    assert.equal(bucketByEdges(15, edges), "q2");
    assert.equal(bucketByEdges(29, edges), "q3");
    assert.equal(bucketByEdges(NaN, edges), "unknown");
  });
});
