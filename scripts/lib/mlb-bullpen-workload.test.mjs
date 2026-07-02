/**
 * mlb-bullpen-workload.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-workload.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeBullpenWorkload } from "./mlb-bullpen-workload.mjs";

const ASOF = "2026-07-02";

function appearance({ pitcherId, date, outs = 3, pitches = 15, doubleHeader = "N", gamePk = 1 }) {
  return { pitcherId, officialDate: date, gamePk, outs, numberOfPitches: pitches, doubleHeader };
}

describe("computeBullpenWorkload", () => {
  it("returns a fresh bullpen for no recent appearances", () => {
    const result = computeBullpenWorkload([], { asOfDate: ASOF });
    assert.equal(result.last3BullpenIp, "0.0");
    assert.equal(result.last7BullpenIp, "0.0");
    assert.equal(result.relieversUsedLast3Days, 0);
    assert.equal(result.bullpenFatigueTier, "fresh");
    assert.equal(result.bullpenFatigueScore, 0);
  });

  it("excludes appearances on or after the asOfDate", () => {
    const appearances = [appearance({ pitcherId: 1, date: ASOF, outs: 3 })];
    const result = computeBullpenWorkload(appearances, { asOfDate: ASOF });
    assert.equal(result.last3BullpenIp, "0.0");
  });

  it("counts distinct relievers used in the last 3 days", () => {
    const appearances = [
      appearance({ pitcherId: 1, date: "2026-07-01" }),
      appearance({ pitcherId: 2, date: "2026-06-30" }),
      appearance({ pitcherId: 1, date: "2026-06-29" }), // same pitcher, different day within window
      appearance({ pitcherId: 3, date: "2026-06-20" }), // outside 3-day window
    ];
    const result = computeBullpenWorkload(appearances, { asOfDate: ASOF });
    assert.equal(result.relieversUsedLast3Days, 2);
  });

  it("detects consecutive-day usage for a reliever", () => {
    const appearances = [
      appearance({ pitcherId: 1, date: "2026-06-29" }),
      appearance({ pitcherId: 1, date: "2026-06-30" }),
      appearance({ pitcherId: 1, date: "2026-07-01" }),
      appearance({ pitcherId: 2, date: "2026-06-29" }),
      appearance({ pitcherId: 2, date: "2026-07-01" }), // gap, not consecutive
    ];
    const result = computeBullpenWorkload(appearances, { asOfDate: ASOF });
    assert.deepEqual(result.pitchersUsedOnConsecutiveDays, [1]);
  });

  it("flags high-workload relievers by pitch count or appearance frequency", () => {
    const appearances = [
      appearance({ pitcherId: 1, date: "2026-06-30", pitches: 30 }), // over pitch threshold
      appearance({ pitcherId: 2, date: "2026-06-27" }),
      appearance({ pitcherId: 2, date: "2026-06-29" }),
      appearance({ pitcherId: 2, date: "2026-07-01" }), // 3 appearances in 7 days
      appearance({ pitcherId: 3, date: "2026-06-30", pitches: 10 }), // low workload
    ];
    const result = computeBullpenWorkload(appearances, { asOfDate: ASOF });
    assert.deepEqual(result.highWorkloadRelievers.sort(), [1, 2]);
  });

  it("detects a doubleheader within the last 3 days", () => {
    const appearances = [appearance({ pitcherId: 1, date: "2026-07-01", doubleHeader: "Y" })];
    const result = computeBullpenWorkload(appearances, { asOfDate: ASOF });
    assert.equal(result.doubleHeaderInLast3Days, true);
  });

  it("produces a higher fatigue score for a heavily used bullpen than a lightly used one", () => {
    const tiredAppearances = [
      appearance({ pitcherId: 1, date: "2026-06-29" }),
      appearance({ pitcherId: 1, date: "2026-06-30" }),
      appearance({ pitcherId: 1, date: "2026-07-01" }),
      appearance({ pitcherId: 2, date: "2026-06-29" }),
      appearance({ pitcherId: 2, date: "2026-06-30", pitches: 30 }),
      appearance({ pitcherId: 3, date: "2026-06-30" }),
      appearance({ pitcherId: 3, date: "2026-07-01", doubleHeader: "Y" }),
    ];
    const freshAppearances = [appearance({ pitcherId: 9, date: "2026-06-30", outs: 3, pitches: 10 })];

    const tired = computeBullpenWorkload(tiredAppearances, { asOfDate: ASOF });
    const fresh = computeBullpenWorkload(freshAppearances, { asOfDate: ASOF });
    assert.ok(tired.bullpenFatigueScore > fresh.bullpenFatigueScore);
    assert.equal(tired.bullpenFatigueTier, "tired");
    assert.equal(fresh.bullpenFatigueTier, "fresh");
  });

  it("keeps the fatigue score bounded to [0, 100]", () => {
    const massiveAppearances = Array.from({ length: 20 }, (_, i) =>
      appearance({ pitcherId: i, date: "2026-07-01", pitches: 40, outs: 9 })
    );
    const result = computeBullpenWorkload(massiveAppearances, { asOfDate: ASOF });
    assert.ok(result.bullpenFatigueScore <= 100);
    assert.ok(result.bullpenFatigueScore >= 0);
  });

  it("documents the fatigue formula weights and thresholds in output", () => {
    const result = computeBullpenWorkload([], { asOfDate: ASOF });
    assert.ok(result.fatigueFormula.weights);
    assert.ok(result.fatigueFormula.thresholds);
  });

  it("throws if asOfDate is missing", () => {
    assert.throws(() => computeBullpenWorkload([], {}));
  });
});
