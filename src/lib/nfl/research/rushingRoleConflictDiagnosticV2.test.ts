import { describe, expect, it } from "vitest";
import {
  buildPoolScopedRankPrior,
  classifyCombinedConflict,
  classifyConflictLevel,
  computeNormalizedRoleConflictScore,
  historicalRankDisagreesWithSourcedRank,
  poolScopedRankPriorFor,
  type PoolScopedTrainingRow,
} from "./rushingRoleConflictDiagnosticV2";

describe("buildPoolScopedRankPrior", () => {
  it("keeps QB and RB rank-1 priors separate instead of blending them", () => {
    const rows: PoolScopedTrainingRow[] = [
      { poolKey: "qb", depthRankProxy: 1, shareOfPositionalPool: 1.0 },
      { poolKey: "qb", depthRankProxy: 1, shareOfPositionalPool: 1.4 },
      { poolKey: "rb", depthRankProxy: 1, shareOfPositionalPool: 0.6 },
      { poolKey: "rb", depthRankProxy: 1, shareOfPositionalPool: 0.7 },
    ];
    const prior = buildPoolScopedRankPrior(rows);
    expect(prior.get("qb:1")).toBeCloseTo(1.2);
    expect(prior.get("rb:1")).toBeCloseTo(0.65);
    // The old bug: a single unscoped "rank:1" key would have averaged all four together.
    expect(prior.get("rb:1")).not.toBeCloseTo(prior.get("qb:1")!);
  });

  it("caps deep ranks into a single bucket, matching the allocation model's own rank cap", () => {
    const rows: PoolScopedTrainingRow[] = [
      { poolKey: "rb", depthRankProxy: 6, shareOfPositionalPool: 0.0 },
      { poolKey: "rb", depthRankProxy: 9, shareOfPositionalPool: 0.02 },
    ];
    const prior = buildPoolScopedRankPrior(rows);
    expect(prior.has("rb:6")).toBe(true);
    expect(prior.get("rb:6")).toBeCloseTo(0.01);
  });
});

describe("poolScopedRankPriorFor", () => {
  const prior = buildPoolScopedRankPrior([
    { poolKey: "rb", depthRankProxy: 1, shareOfPositionalPool: 0.67 },
    { poolKey: "rb", depthRankProxy: null, shareOfPositionalPool: 0.27 },
  ]);
  it("looks up the pool-and-rank-specific prior", () => {
    expect(poolScopedRankPriorFor(prior, "rb", 1)).toBeCloseTo(0.67);
  });
  it("falls back to the pool's NA bucket for a null rank", () => {
    expect(poolScopedRankPriorFor(prior, "rb", null)).toBeCloseTo(0.27);
  });
  it("returns null when the pool has no training data at all", () => {
    expect(poolScopedRankPriorFor(prior, "wrTe", 1)).toBeNull();
  });
});

describe("computeNormalizedRoleConflictScore", () => {
  it("is a small, sane number for an established starter matching their pool-scoped prior (no false-high-conflict)", () => {
    // Real RB1 pool-scoped prior from the training data is ~0.6685.
    const score = computeNormalizedRoleConflictScore(0.65, 0.6685);
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(0.15);
    expect(classifyConflictLevel(score)).toBe("low");
  });

  it("flags a real disagreement as MEDIUM (Montgomery-shaped case: sourced RB1, but own history reads like a committee back)", () => {
    // Real David Montgomery value from WU4F: historical share 0.358 vs the
    // real RB1 pool-scoped prior 0.6685 -- a genuine, meaningful gap
    // (0.31), but below the structural HIGH threshold (0.35). Not tuned to
    // force a particular bucket -- this is what the locked thresholds say.
    const score = computeNormalizedRoleConflictScore(0.358, 0.6685);
    expect(classifyConflictLevel(score)).toBe("medium");
  });

  it("flags a starker disagreement as HIGH", () => {
    const score = computeNormalizedRoleConflictScore(0.2, 0.6685);
    expect(classifyConflictLevel(score)).toBe("high");
  });

  it("returns null rather than a misleading number when either input is missing", () => {
    expect(computeNormalizedRoleConflictScore(null, 0.6685)).toBeNull();
    expect(computeNormalizedRoleConflictScore(0.5, null)).toBeNull();
  });
});

describe("historicalRankDisagreesWithSourcedRank", () => {
  const prior = buildPoolScopedRankPrior([
    { poolKey: "rb", depthRankProxy: 1, shareOfPositionalPool: 0.67 },
    { poolKey: "rb", depthRankProxy: 2, shareOfPositionalPool: 0.27 },
    { poolKey: "rb", depthRankProxy: 3, shareOfPositionalPool: 0.09 },
  ]);

  it("flags a rank reversal: sourced RB1 whose own history reads like an RB2", () => {
    const disagrees = historicalRankDisagreesWithSourcedRank(0.27, "rb", 1, prior);
    expect(disagrees).toBe(true);
  });

  it("does not flag an established sourced RB1 whose history matches RB1 usage", () => {
    const disagrees = historicalRankDisagreesWithSourcedRank(0.66, "rb", 1, prior);
    expect(disagrees).toBe(false);
  });

  it("returns null when there is no historical share to compare (a true no-history rookie)", () => {
    expect(historicalRankDisagreesWithSourcedRank(null, "rb", 1, prior)).toBeNull();
  });
});

describe("classifyCombinedConflict", () => {
  it("escalates to HIGH on a rank reversal even if the raw share gap is small", () => {
    // Small gap (0.1) would normally be LOW, but a rank reversal overrides it.
    const result = classifyCombinedConflict(0.1, true);
    expect(result).toBe("high");
  });

  it("uses the plain share-gap classification when ranks agree", () => {
    expect(classifyCombinedConflict(0.05, false)).toBe("low");
    expect(classifyCombinedConflict(0.4, false)).toBe("high");
  });
});
