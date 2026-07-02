/**
 * mlb-ml-performance-summary.test.mjs
 * Deterministic tests for the pure ML performance summary logic.
 * No live API calls. Run via: node --test scripts/lib/mlb-ml-performance-summary.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPerformanceSummary, summarizeRecordGroup, EDGE_STRENGTH_NOTE, EDGE_TIERS } from "./mlb-ml-performance-summary.mjs";

function makeRecord(overrides = {}) {
  return {
    date: "2026-06-30",
    confidence: 65, // "moderate" tier
    result: {
      status: "win",
      clv: {
        sportsbook: { impliedProbabilityDelta: 0.02, beatClose: true },
        polymarket: { priceDelta: 0.03, beatClose: true },
      },
    },
    ...overrides,
  };
}

describe("EDGE_STRENGTH_NOTE", () => {
  it("explicitly says Edge Strength is not a calibrated probability", () => {
    assert.ok(EDGE_STRENGTH_NOTE.toLowerCase().includes("not been calibrated"));
    assert.ok(EDGE_STRENGTH_NOTE.toLowerCase().includes("win probability"));
  });
});

describe("summarizeRecordGroup", () => {
  it("tallies wins/losses/pushes and computes win% excluding pushes from the denominator", () => {
    const records = [
      makeRecord({ result: { status: "win" } }),
      makeRecord({ result: { status: "win" } }),
      makeRecord({ result: { status: "loss" } }),
      makeRecord({ result: { status: "push" } }),
    ];
    const summary = summarizeRecordGroup(records);
    assert.equal(summary.wins, 2);
    assert.equal(summary.losses, 1);
    assert.equal(summary.pushes, 1);
    assert.equal(summary.totalGraded, 4);
    assert.equal(summary.winPct, Math.round((2 / 3) * 1000) / 10);
  });

  it("excludes pending/postponed/cancelled/unresolved from totalGraded and winPct", () => {
    const records = [
      makeRecord({ result: { status: "win" } }),
      makeRecord({ result: { status: "pending" } }),
      makeRecord({ result: { status: "postponed" } }),
      makeRecord({ result: { status: "cancelled" } }),
      makeRecord({ result: { status: "unresolved" } }),
    ];
    const summary = summarizeRecordGroup(records);
    assert.equal(summary.totalPicks, 5);
    assert.equal(summary.totalGraded, 1);
    assert.equal(summary.winPct, 100);
  });

  it("returns null winPct when there are zero decided (win/loss) records", () => {
    const summary = summarizeRecordGroup([makeRecord({ result: { status: "push" } })]);
    assert.equal(summary.winPct, null);
  });

  it("returns null CLV blocks when no graded record has CLV data", () => {
    const summary = summarizeRecordGroup([makeRecord({ result: { status: "win", clv: null } })]);
    assert.equal(summary.sportsbookClv, null);
    assert.equal(summary.polymarketClv, null);
  });

  it("computes sportsbook CLV avg delta and beat-close rate", () => {
    const records = [
      makeRecord({ result: { status: "win", clv: { sportsbook: { impliedProbabilityDelta: 0.04, beatClose: true }, polymarket: null } } }),
      makeRecord({ result: { status: "loss", clv: { sportsbook: { impliedProbabilityDelta: -0.02, beatClose: false }, polymarket: null } } }),
    ];
    const summary = summarizeRecordGroup(records);
    assert.equal(summary.sportsbookClv.sampleSize, 2);
    assert.equal(summary.sportsbookClv.avgImpliedProbabilityDelta, 0.01);
    assert.equal(summary.sportsbookClv.beatCloseRate, 50);
  });

  it("computes Polymarket CLV avg delta and beat-close rate independently of sportsbook", () => {
    const records = [
      makeRecord({ result: { status: "win", clv: { sportsbook: null, polymarket: { priceDelta: 0.05, beatClose: true } } } }),
      makeRecord({ result: { status: "win", clv: { sportsbook: null, polymarket: { priceDelta: 0.05, beatClose: true } } } }),
    ];
    const summary = summarizeRecordGroup(records);
    assert.equal(summary.polymarketClv.sampleSize, 2);
    assert.equal(summary.polymarketClv.avgPriceDelta, 0.05);
    assert.equal(summary.polymarketClv.beatCloseRate, 100);
  });

  it("handles an empty group gracefully", () => {
    const summary = summarizeRecordGroup([]);
    assert.equal(summary.totalPicks, 0);
    assert.equal(summary.totalGraded, 0);
    assert.equal(summary.winPct, null);
    assert.equal(summary.sportsbookClv, null);
  });
});

describe("buildPerformanceSummary", () => {
  it("always includes the Edge Strength note", () => {
    const summary = buildPerformanceSummary([]);
    assert.equal(summary.note, EDGE_STRENGTH_NOTE);
  });

  it("splits records into the four Edge Strength tiers using the shared tier thresholds", () => {
    const records = [
      makeRecord({ confidence: 75, result: { status: "win" } }), // strong
      makeRecord({ confidence: 68, result: { status: "win" } }), // moderate
      makeRecord({ confidence: 58, result: { status: "loss" } }), // slight
      makeRecord({ confidence: 50, result: { status: "loss" } }), // coin-flip
    ];
    const summary = buildPerformanceSummary(records);
    assert.deepEqual(Object.keys(summary.byEdgeTier).sort(), [...EDGE_TIERS].sort());
    assert.equal(summary.byEdgeTier.strong.totalGraded, 1);
    assert.equal(summary.byEdgeTier.moderate.totalGraded, 1);
    assert.equal(summary.byEdgeTier.slight.totalGraded, 1);
    assert.equal(summary.byEdgeTier["coin-flip"].totalGraded, 1);
  });

  it("computes rolling 7-day and 30-day windows relative to an injectable reference date", () => {
    const records = [
      makeRecord({ date: "2026-06-30", result: { status: "win" } }), // today
      makeRecord({ date: "2026-06-25", result: { status: "win" } }), // 5 days ago -- inside 7d
      makeRecord({ date: "2026-06-01", result: { status: "loss" } }), // 29 days ago -- inside 30d, outside 7d
      makeRecord({ date: "2026-01-01", result: { status: "loss" } }), // way outside both windows
    ];
    const summary = buildPerformanceSummary(records, "2026-06-30T12:00:00Z");
    assert.equal(summary.rolling7Day.totalGraded, 2);
    assert.equal(summary.rolling30Day.totalGraded, 3);
    assert.equal(summary.overall.totalGraded, 4);
  });

  it("tallies otherStatuses (pending/postponed/cancelled/unresolved) separately from win/loss/push", () => {
    const records = [
      makeRecord({ result: { status: "pending" } }),
      makeRecord({ result: { status: "postponed" } }),
      makeRecord({ result: { status: "cancelled" } }),
      makeRecord({ result: { status: "unresolved" } }),
      makeRecord({ result: { status: "win" } }),
    ];
    const summary = buildPerformanceSummary(records);
    assert.deepEqual(summary.otherStatuses, { pending: 1, postponed: 1, cancelled: 1, unresolved: 1 });
    assert.equal(summary.totalArchivedPicks, 5);
    assert.equal(summary.totalGradedPicks, 1);
  });

  it("handles an empty archive gracefully", () => {
    const summary = buildPerformanceSummary([]);
    assert.equal(summary.totalArchivedPicks, 0);
    assert.equal(summary.totalGradedPicks, 0);
    assert.equal(summary.overall.winPct, null);
  });
});
