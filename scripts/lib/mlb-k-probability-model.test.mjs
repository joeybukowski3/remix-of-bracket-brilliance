import { describe, expect, it } from "vitest";
import {
  computeIpStandardDeviation,
  computeKPerIpStandardDeviation,
  computeTrust,
  createSeededRng,
  describeProbabilityConfidence,
  distributionSummary,
  probabilityFromCounts,
  simulateStrikeoutDistribution,
} from "./mlb-k-probability-model.mjs";

const STABLE_PITCHER = {
  pitcherId: 12345,
  slateDate: "2026-09-11",
  finalProjectedIP: 5.8,
  finalProjectedKPerIP: 1.05,
  bfPerIP: 4.3,
  seasonIPPerStart: 5.8,
  last10IPPerStart: 5.7,
  last5IPPerStart: 5.9,
  seasonGamesStarted: 28,
  seasonKPerIP: 1.05,
  last10KPerIP: 1.02,
  last5KPerIP: 1.08,
  seasonInnings: 160,
};

const VOLATILE_PITCHER = {
  pitcherId: 67890,
  slateDate: "2026-09-11",
  finalProjectedIP: 5.8,
  finalProjectedKPerIP: 1.05,
  bfPerIP: 4.3,
  seasonIPPerStart: 5.8,
  last10IPPerStart: 4.2,
  last5IPPerStart: 3.1,
  seasonGamesStarted: 3,
  seasonKPerIP: 1.05,
  last10KPerIP: 0.7,
  last5KPerIP: 0.5,
  seasonInnings: 14,
};

describe("createSeededRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createSeededRng("seed-a");
    const b = createSeededRng("seed-a");
    const drawsA = Array.from({ length: 10 }, () => a());
    const drawsB = Array.from({ length: 10 }, () => b());
    expect(drawsA).toEqual(drawsB);
  });

  it("differs across seeds", () => {
    const a = createSeededRng("seed-a");
    const b = createSeededRng("seed-b");
    expect(a()).not.toBeCloseTo(b(), 6);
  });

  it("stays within [0, 1)", () => {
    const rng = createSeededRng("bounds-check");
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("computeTrust", () => {
  it("increases toward 1 as sample size grows", () => {
    expect(computeTrust(0, 3)).toBe(0);
    expect(computeTrust(3, 3)).toBeCloseTo(0.5, 6);
    expect(computeTrust(27, 3)).toBeCloseTo(0.9, 6);
  });
});

describe("computeIpStandardDeviation / computeKPerIpStandardDeviation", () => {
  it("produces a tighter IP spread for a stable, well-sampled pitcher", () => {
    const stable = computeIpStandardDeviation(STABLE_PITCHER);
    const volatile = computeIpStandardDeviation(VOLATILE_PITCHER);
    expect(stable.sd).toBeLessThan(volatile.sd);
  });

  it("produces a tighter K-rate spread for a stable, well-sampled pitcher", () => {
    const stable = computeKPerIpStandardDeviation(STABLE_PITCHER);
    const volatile = computeKPerIpStandardDeviation(VOLATILE_PITCHER);
    expect(stable.sd).toBeLessThan(volatile.sd);
  });

  it("never produces NaN/Infinity and stays within configured clamps", () => {
    const result = computeIpStandardDeviation({});
    expect(Number.isFinite(result.sd)).toBe(true);
    expect(result.sd).toBeGreaterThanOrEqual(0.8);
    expect(result.sd).toBeLessThanOrEqual(2.6);
  });
});

describe("simulateStrikeoutDistribution", () => {
  it("is deterministic for identical inputs", () => {
    const runA = simulateStrikeoutDistribution(STABLE_PITCHER, { simulations: 2000 });
    const runB = simulateStrikeoutDistribution(STABLE_PITCHER, { simulations: 2000 });
    expect(runA.counts).toEqual(runB.counts);
    expect(runA.seed).toEqual(runB.seed);
  });

  it("produces different distributions for different pitcher identity (different seed)", () => {
    const a = simulateStrikeoutDistribution(STABLE_PITCHER, { simulations: 2000 });
    const b = simulateStrikeoutDistribution({ ...STABLE_PITCHER, pitcherId: 99999 }, { simulations: 2000 });
    expect(a.counts).not.toEqual(b.counts);
  });

  it("a volatile/thin-sample pitcher produces a wider outcome distribution than a stable one with the same mean", () => {
    const stable = simulateStrikeoutDistribution(STABLE_PITCHER, { simulations: 6000 });
    const volatile = simulateStrikeoutDistribution(VOLATILE_PITCHER, { simulations: 6000 });
    const stableSummary = distributionSummary(stable.counts, stable.simulations);
    const volatileSummary = distributionSummary(volatile.counts, volatile.simulations);
    expect(stableSummary.stdev).toBeLessThan(volatileSummary.stdev);
  });

  it("returns ok:false with no NaN/Infinity when projection inputs are missing", () => {
    const result = simulateStrikeoutDistribution({ pitcherId: 1, slateDate: "2026-09-11" }, { simulations: 500 });
    expect(result.ok).toBe(false);
    expect(result.counts).toEqual([]);
  });

  it("handles missing historical variance windows without NaN/Infinity (fallback-shaped input)", () => {
    const result = simulateStrikeoutDistribution(
      { pitcherId: 5, slateDate: "2026-09-11", finalProjectedIP: 5.0, finalProjectedKPerIP: 1.0, bfPerIP: 4.3 },
      { simulations: 1000 },
    );
    expect(result.ok).toBe(true);
    expect(result.counts.every((n) => Number.isFinite(n))).toBe(true);
    const summary = distributionSummary(result.counts, result.simulations);
    expect(Number.isFinite(summary.mean)).toBe(true);
  });
});

describe("probabilityFromCounts", () => {
  it("sums Over + Under to ~1 for a half-point line", () => {
    const result = simulateStrikeoutDistribution(STABLE_PITCHER, { simulations: 8000 });
    const { overProbability, underProbability } = probabilityFromCounts(result.counts, result.simulations, 5.5);
    expect(overProbability + underProbability).toBeCloseTo(1, 6);
  });

  it("excludes push mass from Over/Under for an integer line", () => {
    const result = simulateStrikeoutDistribution(STABLE_PITCHER, { simulations: 8000 });
    const { overProbability, underProbability, pushProbability } = probabilityFromCounts(result.counts, result.simulations, 5);
    expect(overProbability + underProbability + pushProbability).toBeCloseTo(1, 3);
    expect(pushProbability).toBeGreaterThan(0);
  });

  it("returns nulls for a missing line", () => {
    const result = probabilityFromCounts([1, 2, 3], 6, null);
    expect(result.overProbability).toBeNull();
    expect(result.underProbability).toBeNull();
  });
});

describe("describeProbabilityConfidence", () => {
  it("grades HIGH/MEDIUM/LOW consistently with the configured thresholds", () => {
    expect(describeProbabilityConfidence(0.9, 0.9).grade).toBe("HIGH");
    expect(describeProbabilityConfidence(0.5, 0.5).grade).toBe("MEDIUM");
    expect(describeProbabilityConfidence(0.1, 0.1).grade).toBe("LOW");
  });

  it("a mid-range (52%-style) probability can still carry HIGH confidence -- confidence describes the estimate's precision, not win likelihood", () => {
    const confidence = describeProbabilityConfidence(0.95, 0.95);
    expect(confidence.grade).toBe("HIGH");
  });
});
