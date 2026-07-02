/**
 * mlb-bullpen-season-aggregate.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-season-aggregate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateSeasonBullpenStats } from "./mlb-bullpen-season-aggregate.mjs";

function stat({ ip, er, hr, k, bb, h }) {
  return { inningsPitched: ip, earnedRuns: er, homeRuns: hr, strikeOuts: k, baseOnBalls: bb, hits: h };
}

describe("aggregateSeasonBullpenStats", () => {
  it("computes rate stats from summed totals, not averaged per-pitcher rates", () => {
    // Pitcher A: 40 IP (120 outs), 10 ER -> ERA 2.25 alone
    // Pitcher B: 2 IP (6 outs), 2 ER -> ERA 9.00 alone
    // Naive average of individual ERAs would be way off; totals-based
    // ERA should be dominated by the much larger sample (A).
    const statsById = new Map([
      [1, stat({ ip: "40.0", er: 10, hr: 4, k: 45, bb: 12, h: 30 })],
      [2, stat({ ip: "2.0", er: 2, hr: 1, k: 1, bb: 1, h: 3 })],
    ]);
    const result = aggregateSeasonBullpenStats([1, 2], statsById, { rosterPitcherCount: 13 });
    // totalOuts = 126, decimalInnings = 42, totalER = 12
    assert.equal(result.seasonBullpenIp, "42.0");
    assert.equal(result.seasonBullpenEra, Math.round((12 * 9 / 42) * 100) / 100);
    assert.equal(result.coverageMetadata.relieverCount, 2);
    assert.equal(result.coverageMetadata.contributingPitcherCount, 2);
  });

  it("excludes missing-stat pitchers from totals but records them as a warning", () => {
    const statsById = new Map([[1, stat({ ip: "10.0", er: 3, hr: 1, k: 12, bb: 4, h: 8 })]]);
    const result = aggregateSeasonBullpenStats([1, 2], statsById, { rosterPitcherCount: 13 });
    assert.equal(result.coverageMetadata.contributingPitcherCount, 1);
    assert.equal(result.coverageMetadata.missingStatsCount, 1);
    assert.ok(result.warnings.some((w) => w.includes("missing season stats")));
  });

  it("marks dataQuality insufficient when there is no usable data", () => {
    const result = aggregateSeasonBullpenStats([1], new Map(), {});
    assert.equal(result.dataQuality, "insufficient");
    assert.equal(result.seasonBullpenEra, null);
    assert.ok(result.warnings.some((w) => w.includes("insufficient for a high-confidence")));
  });

  it("marks dataQuality low for thin coverage below thresholds", () => {
    const statsById = new Map([[1, stat({ ip: "3.0", er: 1, hr: 0, k: 3, bb: 1, h: 2 })]]);
    const result = aggregateSeasonBullpenStats([1], statsById, {});
    assert.equal(result.dataQuality, "low");
  });

  it("marks dataQuality high for solid coverage with complete stats", () => {
    const statsById = new Map([
      [1, stat({ ip: "25.0", er: 8, hr: 3, k: 28, bb: 9, h: 20 })],
      [2, stat({ ip: "22.0", er: 7, hr: 2, k: 24, bb: 8, h: 18 })],
      [3, stat({ ip: "20.0", er: 6, hr: 2, k: 22, bb: 7, h: 16 })],
    ]);
    const result = aggregateSeasonBullpenStats([1, 2, 3], statsById, { rosterPitcherCount: 13 });
    assert.equal(result.dataQuality, "high");
  });

  it("handles zero-walks gracefully for K/BB (avoids divide-by-zero)", () => {
    const statsById = new Map([[1, stat({ ip: "10.0", er: 2, hr: 1, k: 12, bb: 0, h: 6 })]]);
    const result = aggregateSeasonBullpenStats([1], statsById, {});
    assert.equal(result.seasonBullpenKbb, null);
  });

  it("retains contributingPitcherIds internally for auditability", () => {
    const statsById = new Map([[1, stat({ ip: "10.0", er: 2, hr: 1, k: 12, bb: 3, h: 6 })]]);
    const result = aggregateSeasonBullpenStats([1], statsById, {});
    assert.deepEqual(result.contributingPitcherIds, [1]);
  });

  it("handles an empty reliever pool", () => {
    const result = aggregateSeasonBullpenStats([], new Map(), { rosterPitcherCount: 13 });
    assert.equal(result.dataQuality, "insufficient");
    assert.equal(result.coverageMetadata.relieverCount, 0);
    assert.equal(result.seasonBullpenIp, "0.0");
  });
});
