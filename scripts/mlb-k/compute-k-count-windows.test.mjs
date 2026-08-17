/**
 * compute-k-count-windows.test.mjs
 * Run via: node --test scripts/mlb-k/compute-k-count-windows.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateCountWindow, buildKCountWindows } from "./compute-k-count-windows.mjs";

function start(date, { strikeouts = 5, inningsPitched = 6, pitches = 90 } = {}) {
  return { date, isStart: true, strikeouts, pitches, inningsPitched };
}

describe("aggregateCountWindow", () => {
  it("recovers real outs from 6.0 decimal innings (18 outs)", () => {
    const window = aggregateCountWindow([start("2026-04-01", { inningsPitched: 6.0 })]);
    assert.equal(window.outs, 18);
  });
  it("recovers real outs from 6.3333 decimal innings (19 outs, i.e. 6.1)", () => {
    const window = aggregateCountWindow([start("2026-04-01", { inningsPitched: 6 + 1 / 3 })]);
    assert.equal(window.outs, 19);
  });
  it("recovers real outs from 6.6667 decimal innings (20 outs, i.e. 6.2)", () => {
    const window = aggregateCountWindow([start("2026-04-01", { inningsPitched: 6 + 2 / 3 })]);
    assert.equal(window.outs, 20);
  });
  it("aggregates outs across multiple partial-inning starts via outs, not decimal addition drift", () => {
    const window = aggregateCountWindow([
      start("2026-04-01", { inningsPitched: 6 + 1 / 3, strikeouts: 6 }),
      start("2026-04-07", { inningsPitched: 5 + 2 / 3, strikeouts: 7 }),
    ]);
    assert.equal(window.outs, 19 + 17);
    assert.equal(window.strikeouts, 13);
  });
});

describe("buildKCountWindows", () => {
  it("builds Season/L8/L4 from the full appearance list, not a pre-capped window", () => {
    const appearances = Array.from({ length: 12 }, (_, i) => start(`2026-04-${String(i + 1).padStart(2, "0")}`, { strikeouts: i + 1 }));
    const { season, last8, last4 } = buildKCountWindows(appearances);
    assert.equal(season.starts, 12);
    assert.equal(last8.starts, 8);
    assert.equal(last4.starts, 4);
    // Last 4 strikeouts should be the 4 highest-indexed entries (9,10,11,12 -> Ks 9..12)
    assert.equal(last4.strikeouts, 9 + 10 + 11 + 12);
  });

  it("returns null windows when there are no appearances at all", () => {
    const { season, last8, last4 } = buildKCountWindows([]);
    assert.equal(season, null);
    assert.equal(last8, null);
    assert.equal(last4, null);
  });
});
