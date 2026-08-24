import { describe, expect, it } from "vitest";
import { stalenessAdjustmentMultiplier } from "./stalenessMultiplier";
import { computeStaleness } from "./stalenessDiagnostic";

const params = { floor: 0.5, thresholdLow: 0.3, thresholdHigh: 1.0 };

describe("stalenessAdjustmentMultiplier", () => {
  it("NONE form always returns 1 regardless of staleness", () => {
    expect(stalenessAdjustmentMultiplier("NONE", 5, params)).toBe(1);
  });

  it("null adjustedStaleness (no evidence yet) never accelerates decay", () => {
    expect(stalenessAdjustmentMultiplier("THRESHOLD_RAMP", null, params)).toBe(1);
  });

  it("THRESHOLD_RAMP stays at 1 below the low threshold", () => {
    expect(stalenessAdjustmentMultiplier("THRESHOLD_RAMP", 0.1, params)).toBe(1);
  });

  it("THRESHOLD_RAMP reaches the floor at/above the high threshold", () => {
    expect(stalenessAdjustmentMultiplier("THRESHOLD_RAMP", 2, params)).toBe(0.5);
  });

  it("THRESHOLD_RAMP is monotonically non-increasing between thresholds", () => {
    const mid = stalenessAdjustmentMultiplier("THRESHOLD_RAMP", 0.6, params);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0.5);
  });

  it("BOUNDED_LOGISTIC stays within [floor, 1]", () => {
    for (const s of [0, 0.1, 0.5, 1, 5, 100]) {
      const m = stalenessAdjustmentMultiplier("BOUNDED_LOGISTIC", s, params);
      expect(m).toBeGreaterThanOrEqual(params.floor - 1e-9);
      expect(m).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("computeStaleness — Section 9 safety", () => {
  it("a single Week-1 game (low reliability) heavily discounts adjustedStaleness even with a large raw disagreement", () => {
    const oneGame = computeStaleness(5, 0, 1); // huge raw staleness=5, but only 1 game played
    const fullyReliable = computeStaleness(5, 0, 4); // same raw staleness, 4+ games played (full reliability)
    expect(oneGame.staleness).toBe(5);
    expect(oneGame.adjustedStaleness!).toBeLessThan(fullyReliable.adjustedStaleness!);
    expect(oneGame.reliability).toBeLessThan(1);
    expect(fullyReliable.reliability).toBe(1);
  });

  it("returns null staleness (never fabricated) when current evidence is unavailable", () => {
    const result = computeStaleness(null, 0, 0);
    expect(result.staleness).toBeNull();
    expect(result.adjustedStaleness).toBeNull();
  });
});
