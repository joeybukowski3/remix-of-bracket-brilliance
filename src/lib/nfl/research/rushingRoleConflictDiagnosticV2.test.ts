import { describe, expect, it } from "vitest";
import {
  buildPoolScopedRankPrior,
  buildRushingRoleConflictV2ArchiveEntry,
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

describe("buildRushingRoleConflictV2ArchiveEntry", () => {
  const prior = buildPoolScopedRankPrior([
    { poolKey: "rb", depthRankProxy: 1, shareOfPositionalPool: 0.6685 },
    { poolKey: "rb", depthRankProxy: 2, shareOfPositionalPool: 0.2708 },
    { poolKey: "qb", depthRankProxy: 1, shareOfPositionalPool: 1.4 }, // mixed-in QB row must never leak into rb:1
  ]);

  it("uses the RB-scoped prior, not any cross-position value, for an RB1", () => {
    const entry = buildRushingRoleConflictV2ArchiveEntry({
      poolKey: "rb", depthRank: 1, roleSourced: true, historicalSharePrior: 0.6, teamChanged: false, noHistory: false, poolScopedRankPrior: prior,
    });
    expect(entry.available).toBe(true);
    if (!entry.available) throw new Error("expected available");
    expect(entry.diagnostic.role_prior_share).toBeCloseTo(0.6685);
    expect(entry.diagnostic.role_prior_share).not.toBeCloseTo(1.4);
  });

  it("applies the canonical 0.15/0.35 thresholds to the computed conflict_score", () => {
    const low = buildRushingRoleConflictV2ArchiveEntry({ poolKey: "rb", depthRank: 1, roleSourced: true, historicalSharePrior: 0.66, teamChanged: false, noHistory: false, poolScopedRankPrior: prior });
    const medium = buildRushingRoleConflictV2ArchiveEntry({ poolKey: "rb", depthRank: 1, roleSourced: true, historicalSharePrior: 0.5, teamChanged: false, noHistory: false, poolScopedRankPrior: prior });
    const high = buildRushingRoleConflictV2ArchiveEntry({ poolKey: "rb", depthRank: 1, roleSourced: true, historicalSharePrior: 0.2, teamChanged: true, noHistory: false, poolScopedRankPrior: prior });
    expect(low.available && low.diagnostic.conflict_level).toBe("low");
    expect(medium.available && medium.diagnostic.conflict_level).toBe("medium");
    expect(high.available && high.diagnostic.conflict_level).toBe("high");
  });

  it("is available with a null conflict_score/conflict_level for a legitimate noHistory RB with a sourced depth rank", () => {
    const entry = buildRushingRoleConflictV2ArchiveEntry({
      poolKey: "rb", depthRank: 2, roleSourced: true, historicalSharePrior: null, teamChanged: null, noHistory: true, poolScopedRankPrior: prior,
    });
    expect(entry.available).toBe(true);
    if (!entry.available) throw new Error("expected available");
    expect(entry.diagnostic.conflict_score).toBeNull();
    expect(entry.diagnostic.conflict_level).toBeNull();
    expect(entry.diagnostic.no_history).toBe(true);
  });

  it("is unavailable (unsupported_pool) for a QB or WR/TE rushing row -- V2 is RB-scoped only", () => {
    const qb = buildRushingRoleConflictV2ArchiveEntry({ poolKey: "qb", depthRank: 1, roleSourced: true, historicalSharePrior: 0.9, teamChanged: false, noHistory: false, poolScopedRankPrior: prior });
    expect(qb).toEqual({ available: false, reason: "unsupported_pool" });
    const wrTe = buildRushingRoleConflictV2ArchiveEntry({ poolKey: "wrTe", depthRank: 1, roleSourced: true, historicalSharePrior: 0.3, teamChanged: false, noHistory: false, poolScopedRankPrior: prior });
    expect(wrTe).toEqual({ available: false, reason: "unsupported_pool" });
  });

  it("is unavailable (missing_depth_rank) when no depth rank was sourced", () => {
    const entry = buildRushingRoleConflictV2ArchiveEntry({ poolKey: "rb", depthRank: null, roleSourced: false, historicalSharePrior: 0.5, teamChanged: false, noHistory: false, poolScopedRankPrior: prior });
    expect(entry).toEqual({ available: false, reason: "missing_depth_rank" });
  });

  it("is unavailable (missing_rank_prior) when the pool has no fitted prior for that rank", () => {
    const entry = buildRushingRoleConflictV2ArchiveEntry({ poolKey: "rb", depthRank: 9, roleSourced: true, historicalSharePrior: 0.1, teamChanged: false, noHistory: false, poolScopedRankPrior: prior });
    expect(entry).toEqual({ available: false, reason: "missing_rank_prior" });
  });
});
