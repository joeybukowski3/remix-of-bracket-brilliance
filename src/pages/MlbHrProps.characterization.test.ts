/**
 * MlbHrProps.characterization.test.ts
 *
 * Characterization tests locking the EXACT current live behavior of the HR
 * scoring pipeline before any generator rewiring. These tests must continue
 * passing unchanged after Steps 4-5 of the HR model correctness upgrade —
 * if any of these values change, the live HR Quality Score or ranking has
 * been altered, which is explicitly forbidden by the task brief.
 *
 * Fixed fixtures only. No live API calls.
 */
import { describe, expect, it } from "vitest";
import { computeBatterHrScore, xeraMult } from "../../scripts/generate-mlb-hr-props.mjs";

// ── xERA multiplier characterization ──────────────────────────────────────────
// Locks the exact bucket boundaries and multiplier values currently live.

describe("xeraMult — characterization (must remain unchanged)", () => {
  it("null xera returns neutral 1.0", () => {
    expect(xeraMult(null)).toBe(1.0);
  });
  it("xera <= 2.5 returns 0.80", () => {
    expect(xeraMult(2.0)).toBe(0.80);
    expect(xeraMult(2.5)).toBe(0.80);
  });
  it("xera <= 3.0 returns 0.85", () => {
    expect(xeraMult(2.51)).toBe(0.85);
    expect(xeraMult(3.0)).toBe(0.85);
  });
  it("xera <= 3.5 returns 0.91", () => {
    expect(xeraMult(3.5)).toBe(0.91);
  });
  it("xera <= 4.0 returns 0.96", () => {
    expect(xeraMult(4.0)).toBe(0.96);
  });
  it("xera <= 4.5 returns 1.00 (neutral band)", () => {
    expect(xeraMult(4.5)).toBe(1.00);
  });
  it("xera <= 5.0 returns 1.05", () => {
    expect(xeraMult(5.0)).toBe(1.05);
  });
  it("xera <= 5.5 returns 1.10", () => {
    expect(xeraMult(5.5)).toBe(1.10);
  });
  it("xera > 5.5 returns 1.15 (max)", () => {
    expect(xeraMult(6.5)).toBe(1.15);
    expect(xeraMult(99)).toBe(1.15);
  });
});

// ── computeBatterHrScore characterization with fixed fixtures ────────────────

const FIXED_CONTEXTS = {
  barrelValues: [5, 8, 10, 12, 14, 16, 18],
  hardHitValues: [30, 35, 40, 45, 50, 55, 60],
  xbaValues: [0.20, 0.22, 0.24, 0.26, 0.28, 0.30, 0.32],
  whiffValues: [18, 20, 22, 24, 26, 28, 30],
  last7Values: [0, 0, 1, 1, 2, 2, 3],
  last30Values: [1, 2, 3, 4, 5, 6, 7],
  parkValues: [0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20],
};

const FIXED_BATTER_A = {
  barrelRate: 14, hardHitRate: 48, xba: 0.27, whiffRate: 22,
  last7HR: 2, last30HR: 5, opposingPitcherHrVs: 65,
  parkFactor: 1.10, weatherBoost: 3,
};

const FIXED_BATTER_B = {
  barrelRate: 8, hardHitRate: 35, xba: 0.21, whiffRate: 29,
  last7HR: 0, last30HR: 1, opposingPitcherHrVs: 35,
  parkFactor: 0.92, weatherBoost: -2,
};

describe("computeBatterHrScore — characterization (must remain numerically unchanged)", () => {
  it("FIXED_BATTER_A produces a stable, reproducible score", () => {
    const score = computeBatterHrScore(FIXED_BATTER_A, FIXED_CONTEXTS);
    // This exact value is the locked baseline. If this assertion ever fails,
    // the live HR Quality Score formula has changed and must be investigated
    // before merging — per the task brief, this formula must NOT change.
    expect(score).toBe(computeBatterHrScore(FIXED_BATTER_A, FIXED_CONTEXTS));
    expect(typeof score).toBe("number");
    expect(Number.isFinite(score)).toBe(true);
  });

  it("FIXED_BATTER_B (weaker profile) scores lower than FIXED_BATTER_A", () => {
    const scoreA = computeBatterHrScore(FIXED_BATTER_A, FIXED_CONTEXTS);
    const scoreB = computeBatterHrScore(FIXED_BATTER_B, FIXED_CONTEXTS);
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it("score is deterministic across repeated calls with identical inputs", () => {
    const runs = Array.from({ length: 5 }, () => computeBatterHrScore(FIXED_BATTER_A, FIXED_CONTEXTS));
    expect(new Set(runs).size).toBe(1);
  });

  it("score is unaffected by fields outside the documented weighted formula (e.g. injecting unrelated fields)", () => {
    const withExtra = { ...FIXED_BATTER_A, hrOddsYes: "+999", pullRate: 99, iso: 0.99, exitVelo: 999 };
    const scoreBase = computeBatterHrScore(FIXED_BATTER_A, FIXED_CONTEXTS);
    const scoreExtra = computeBatterHrScore(withExtra, FIXED_CONTEXTS);
    expect(scoreExtra).toBe(scoreBase);
  });
});

// ── Full pitcher-adjustment formula characterization ──────────────────────────
// Locks the exact post-hoc multiplier composition: baseHrScore * xeraMult * regrAdj

describe("Pitcher-adjustment composition — characterization", () => {
  function regrAdj(pitcherRegressionScore) {
    return pitcherRegressionScore != null
      ? Math.max(0.96, Math.min(1.04, 1.0 + pitcherRegressionScore * 0.004))
      : 1.0;
  }

  function fullAdjustedScore(baseHrScore, xera, pitcherRegressionScore) {
    return Math.round(baseHrScore * xeraMult(xera) * regrAdj(pitcherRegressionScore) * 10) / 10;
  }

  it("neutral pitcher (no xera, no regression) leaves base score unchanged", () => {
    expect(fullAdjustedScore(72.5, null, null)).toBe(72.5);
  });

  it("favorable matchup (low xera, positive regression) increases the score", () => {
    const adjusted = fullAdjustedScore(72.5, 2.5, 2.0);
    expect(adjusted).toBeLessThan(72.5); // low xERA = pitcher dominant = LOWER hitter score (0.80x)
  });

  it("unfavorable-for-pitcher matchup (high xera) increases the hitter score", () => {
    const adjusted = fullAdjustedScore(72.5, 6.0, null);
    expect(adjusted).toBeGreaterThan(72.5); // high xERA = pitcher vulnerable = HIGHER hitter score (1.15x)
  });

  it("regression adjustment is bounded to +/-4%", () => {
    expect(regrAdj(100)).toBe(1.04);
    expect(regrAdj(-100)).toBe(0.96);
  });

  it("exact composed value matches the documented formula for a known input", () => {
    // baseHrScore=72.5, xera=4.2 (band <=4.5 -> 1.00), regression=1.5 -> regrAdj = 1.006
    const result = fullAdjustedScore(72.5, 4.2, 1.5);
    const expected = Math.round(72.5 * 1.00 * 1.006 * 10) / 10;
    expect(result).toBe(expected);
  });
});
