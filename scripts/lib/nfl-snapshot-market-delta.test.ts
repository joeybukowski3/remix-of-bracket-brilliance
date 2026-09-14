import { describe, expect, it } from "vitest";
import { computeMarketDelta } from "./nfl-snapshot-market-delta";
import type { SnapshotMarketState } from "./nfl-snapshot-types";

const PREVIOUS: SnapshotMarketState = {
  sportsbook: "draftkings",
  spread: { homeLine: 3.5, awayLine: -3.5 },
  total: { line: 44.5 },
  moneyline: { homePrice: -160, awayPrice: 140 },
  asOf: "2026-09-09T10:00:00.000Z",
};

describe("computeMarketDelta", () => {
  it("returns null previous/delta fields for an initial snapshot with no prior state", () => {
    const result = computeMarketDelta(null, PREVIOUS);
    expect(result.previousSpread).toBeNull();
    expect(result.previousTotal).toBeNull();
    expect(result.spreadDelta).toBeNull();
    expect(result.totalDelta).toBeNull();
    expect(result.sportsbookChanged).toBe(false);
    expect(result.asOfDeltaMs).toBeNull();
  });

  it("computes the exact spread delta (current - previous)", () => {
    const current: SnapshotMarketState = { ...PREVIOUS, spread: { homeLine: 3, awayLine: -3 } };
    const result = computeMarketDelta(PREVIOUS, current);
    expect(result.spreadDelta).toBe(-0.5);
    expect(result.previousSpread).toEqual({ homeLine: 3.5, awayLine: -3.5 });
  });

  it("computes the exact total delta (current - previous)", () => {
    const current: SnapshotMarketState = { ...PREVIOUS, total: { line: 45 } };
    const result = computeMarketDelta(PREVIOUS, current);
    expect(result.totalDelta).toBe(0.5);
    expect(result.previousTotal).toBe(44.5);
  });

  it("preserves the exact historical market line (previousSpread) rather than collapsing to a team label", () => {
    const fridayState: SnapshotMarketState = { ...PREVIOUS, spread: { homeLine: -3.5, awayLine: 3.5 } }; // IND +3.5 (as away's perspective in this fixture)
    const sundayState: SnapshotMarketState = { ...PREVIOUS, spread: { homeLine: -2.5, awayLine: 2.5 } }; // IND +2.5
    const result = computeMarketDelta(fridayState, sundayState);
    expect(result.previousSpread).toEqual({ homeLine: -3.5, awayLine: 3.5 });
    expect(result.spread).toEqual({ homeLine: -2.5, awayLine: 2.5 });
    expect(result.spreadDelta).toBe(1);
  });

  it("computes moneyline deltas when both snapshots have moneyline data", () => {
    const current: SnapshotMarketState = { ...PREVIOUS, moneyline: { homePrice: -170, awayPrice: 150 } };
    const result = computeMarketDelta(PREVIOUS, current);
    expect(result.moneylineHomeDelta).toBe(-10);
    expect(result.moneylineAwayDelta).toBe(10);
  });

  it("degrades a delta to null rather than guessing when either side is missing", () => {
    const current: SnapshotMarketState = { ...PREVIOUS, moneyline: null };
    const result = computeMarketDelta(PREVIOUS, current);
    expect(result.moneylineHomeDelta).toBeNull();
    expect(result.moneylineAwayDelta).toBeNull();
  });

  it("flags a sportsbook change", () => {
    const current: SnapshotMarketState = { ...PREVIOUS, sportsbook: "fanduel" };
    const result = computeMarketDelta(PREVIOUS, current);
    expect(result.sportsbookChanged).toBe(true);
  });

  it("computes the asOf timestamp delta in milliseconds", () => {
    const current: SnapshotMarketState = { ...PREVIOUS, asOf: "2026-09-10T10:00:00.000Z" };
    const result = computeMarketDelta(PREVIOUS, current);
    expect(result.asOfDeltaMs).toBe(24 * 60 * 60 * 1000);
  });

  it("never mutates the previous or current input", () => {
    const beforePrevious = JSON.stringify(PREVIOUS);
    const current: SnapshotMarketState = { ...PREVIOUS, spread: { homeLine: 3, awayLine: -3 } };
    const beforeCurrent = JSON.stringify(current);
    computeMarketDelta(PREVIOUS, current);
    expect(JSON.stringify(PREVIOUS)).toBe(beforePrevious);
    expect(JSON.stringify(current)).toBe(beforeCurrent);
  });
});
