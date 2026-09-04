import { describe, expect, it } from "vitest";
import {
  buildReceivingRoleConflictArchiveEntry,
  buildReceivingRoleConflictDiagnostic,
  classifyReceivingCombinedConflict,
  classifyReceivingConflictLevel,
  computeReceivingConflictScore,
  receivingRankKey,
  receivingRankOrderingConflict,
  rolePriorShareFor,
  RECEIVING_CONFLICT_LEVEL_THRESHOLDS,
  type ReceivingRoleConflictArchiveEntry,
} from "./receivingRoleConflictDiagnostic";

describe("receivingRankKey", () => {
  it("scopes the rank key by position, never mixing WR and TE", () => {
    expect(receivingRankKey("WR", 1)).toBe("WR:1");
    expect(receivingRankKey("TE", 1)).toBe("TE:1");
    expect(receivingRankKey("WR", 1)).not.toBe(receivingRankKey("TE", 1));
  });

  it("caps deep ranks and maps null to NA", () => {
    expect(receivingRankKey("WR", 9)).toBe("WR:6");
    expect(receivingRankKey("WR", null)).toBe("WR:NA");
  });
});

describe("rolePriorShareFor", () => {
  const rankPrior = new Map([
    ["WR:1", 0.22],
    ["WR:2", 0.14],
    ["TE:1", 0.16],
  ]);

  it("reads the position-scoped prior directly -- no pool rebuilding needed", () => {
    expect(rolePriorShareFor(rankPrior, "WR", 1)).toBeCloseTo(0.22);
    expect(rolePriorShareFor(rankPrior, "TE", 1)).toBeCloseTo(0.16);
  });

  it("returns null for an unknown bucket rather than falling back silently", () => {
    expect(rolePriorShareFor(rankPrior, "RB", 1)).toBeNull();
  });

  it("also accepts a plain record (JSON-artifact shape)", () => {
    expect(rolePriorShareFor({ "WR:1": 0.22 }, "WR", 1)).toBeCloseTo(0.22);
  });
});

describe("computeReceivingConflictScore", () => {
  it("is the absolute gap between two bounded shares", () => {
    expect(computeReceivingConflictScore(0.3, 0.12)).toBeCloseTo(0.18);
  });

  it("returns null when either input is missing", () => {
    expect(computeReceivingConflictScore(null, 0.12)).toBeNull();
    expect(computeReceivingConflictScore(0.3, null)).toBeNull();
  });
});

describe("classifyReceivingConflictLevel", () => {
  it("buckets using the locked structural thresholds", () => {
    expect(classifyReceivingConflictLevel(0.02)).toBe("low");
    expect(classifyReceivingConflictLevel(RECEIVING_CONFLICT_LEVEL_THRESHOLDS.medium)).toBe("medium");
    expect(classifyReceivingConflictLevel(RECEIVING_CONFLICT_LEVEL_THRESHOLDS.high)).toBe("high");
  });

  it("returns null for a null score", () => {
    expect(classifyReceivingConflictLevel(null)).toBeNull();
  });
});

describe("receivingRankOrderingConflict", () => {
  const rankPrior = new Map([
    ["WR:1", 0.24],
    ["WR:2", 0.14],
    ["WR:3", 0.08],
    ["WR:4", 0.05],
  ]);

  it("flags a disagreement when the sourced rank is not the closest-share rank", () => {
    // sourced as WR1 (rank 1) but historical share (0.09) matches WR3 far better than WR1 (0.24).
    const result = receivingRankOrderingConflict({ historicalTargetShare: 0.09, position: "WR", sourcedDepthRank: 1, rankPrior });
    expect(result).toBe(true);
  });

  it("does not flag agreement when the sourced rank is the closest match", () => {
    const result = receivingRankOrderingConflict({ historicalTargetShare: 0.23, position: "WR", sourcedDepthRank: 1, rankPrior });
    expect(result).toBe(false);
  });

  it("returns null when historical share or sourced rank is missing", () => {
    expect(receivingRankOrderingConflict({ historicalTargetShare: null, position: "WR", sourcedDepthRank: 1, rankPrior })).toBeNull();
    expect(receivingRankOrderingConflict({ historicalTargetShare: 0.2, position: "WR", sourcedDepthRank: null, rankPrior })).toBeNull();
  });
});

describe("classifyReceivingCombinedConflict", () => {
  it("escalates a MEDIUM score to HIGH on a rank-ordering reversal", () => {
    expect(classifyReceivingCombinedConflict(RECEIVING_CONFLICT_LEVEL_THRESHOLDS.medium, true)).toBe("high");
  });

  it("does NOT escalate a LOW score on a rank-ordering reversal -- avoids flagging ordinary within-rank variance", () => {
    expect(classifyReceivingCombinedConflict(0.01, true)).toBe("low");
  });

  it("falls back to the score-based level when there is no ordering conflict", () => {
    expect(classifyReceivingCombinedConflict(0.01, false)).toBe("low");
  });

  it("returns null when the score itself is null", () => {
    expect(classifyReceivingCombinedConflict(null, true)).toBeNull();
  });
});

describe("buildReceivingRoleConflictDiagnostic", () => {
  const rankPrior = new Map([
    ["WR:1", 0.24],
    ["WR:2", 0.14],
    ["TE:1", 0.16],
  ]);

  it("assembles a full diagnostic row for a same-team established WR1", () => {
    const diag = buildReceivingRoleConflictDiagnostic({
      playerId: "p1", playerName: "Established WR1", team: "KC", position: "WR", depthRank: 1, roleSourced: true,
      historicalTargetShare: 0.25, teamChanged: false, noHistory: false, limitedHistory: false, rankPrior,
    });
    expect(diag.rolePriorShare).toBeCloseTo(0.24);
    expect(diag.conflictScore).toBeCloseTo(0.01);
    expect(diag.conflictLevel).toBe("low");
    expect(diag.rankDisagrees).toBe(false);
  });

  it("flags a team-changed player whose sourced role conflicts with old-team usage", () => {
    const diag = buildReceivingRoleConflictDiagnostic({
      playerId: "p2", playerName: "Team-Changed WR", team: "DAL", position: "WR", depthRank: 1, roleSourced: true,
      historicalTargetShare: 0.06, teamChanged: true, noHistory: false, limitedHistory: false, rankPrior,
    });
    expect(diag.conflictScore).toBeCloseTo(0.18);
    expect(diag.conflictLevel).toBe("high");
  });

  it("never mixes WR and TE priors for the same depth rank", () => {
    const wr = buildReceivingRoleConflictDiagnostic({
      playerId: "p3", playerName: "WR1", team: "SF", position: "WR", depthRank: 1, roleSourced: true,
      historicalTargetShare: 0.2, teamChanged: false, noHistory: false, limitedHistory: false, rankPrior,
    });
    const te = buildReceivingRoleConflictDiagnostic({
      playerId: "p4", playerName: "TE1", team: "SF", position: "TE", depthRank: 1, roleSourced: true,
      historicalTargetShare: 0.2, teamChanged: false, noHistory: false, limitedHistory: false, rankPrior,
    });
    expect(wr.rolePriorShare).not.toBe(te.rolePriorShare);
  });

  it("returns a null conflict score/level when historical share is unavailable (noHistory)", () => {
    const diag = buildReceivingRoleConflictDiagnostic({
      playerId: "p5", playerName: "Rookie WR", team: "MIA", position: "WR", depthRank: 2, roleSourced: true,
      historicalTargetShare: null, teamChanged: null, noHistory: true, limitedHistory: false, rankPrior,
    });
    expect(diag.conflictScore).toBeNull();
    expect(diag.conflictLevel).toBeNull();
  });

  it("is deterministic for identical inputs", () => {
    const args = {
      playerId: "p6", playerName: "X", team: "NYJ", position: "WR" as const, depthRank: 2, roleSourced: false,
      historicalTargetShare: 0.11, teamChanged: false, noHistory: false, limitedHistory: false, rankPrior,
    };
    expect(buildReceivingRoleConflictDiagnostic(args)).toEqual(buildReceivingRoleConflictDiagnostic(args));
  });
});

describe("buildReceivingRoleConflictArchiveEntry", () => {
  const rankPrior = new Map([
    ["WR:1", 0.24],
    ["WR:2", 0.14],
    ["TE:1", 0.16],
  ]);
  const base = {
    hasAllocationDiagnostics: true, position: "WR", depthRank: 1, roleSourced: true,
    historicalTargetShare: 0.25, teamChanged: false, noHistory: false, limitedHistory: false, rankPrior,
  };

  it("is available with a real diagnostic for a normal row", () => {
    const entry = buildReceivingRoleConflictArchiveEntry(base);
    expect(entry.available).toBe(true);
    if (entry.available) {
      expect(entry.diagnostic.role_prior_share).toBeCloseTo(0.24);
      expect(entry.diagnostic.conflict_level).toBe("low");
    }
  });

  it("is available (not unavailable) for a noHistory player with a legitimately null conflict score", () => {
    const entry = buildReceivingRoleConflictArchiveEntry({ ...base, historicalTargetShare: null, noHistory: true });
    expect(entry.available).toBe(true);
    if (entry.available) {
      expect(entry.diagnostic.historical_share).toBeNull();
      expect(entry.diagnostic.conflict_score).toBeNull();
      expect(entry.diagnostic.conflict_level).toBeNull();
      expect(entry.diagnostic.no_history).toBe(true);
    }
  });

  it("is unavailable with missing_prior_share when the row never went through v2 allocation", () => {
    const entry = buildReceivingRoleConflictArchiveEntry({ ...base, hasAllocationDiagnostics: false });
    expect(entry).toEqual<ReceivingRoleConflictArchiveEntry>({ available: false, reason: "missing_prior_share" });
  });

  it("is unavailable with missing_depth_rank when no depth rank could be sourced", () => {
    const entry = buildReceivingRoleConflictArchiveEntry({ ...base, depthRank: null });
    expect(entry).toEqual<ReceivingRoleConflictArchiveEntry>({ available: false, reason: "missing_depth_rank" });
  });

  it("is unavailable with missing_rank_prior when the fitted model has no bucket for that position+rank", () => {
    const entry = buildReceivingRoleConflictArchiveEntry({ ...base, position: "RB", depthRank: 1 });
    expect(entry).toEqual<ReceivingRoleConflictArchiveEntry>({ available: false, reason: "missing_rank_prior" });
  });

  it("is unavailable with unsupported_position for a non-receiving position", () => {
    const entry = buildReceivingRoleConflictArchiveEntry({ ...base, position: "QB" });
    expect(entry).toEqual<ReceivingRoleConflictArchiveEntry>({ available: false, reason: "unsupported_position" });
  });

  it("mirrors production values through without recomputing them", () => {
    const entry = buildReceivingRoleConflictArchiveEntry({ ...base, teamChanged: true, roleSourced: true, historicalTargetShare: 0.05 });
    expect(entry.available).toBe(true);
    if (entry.available) {
      expect(entry.diagnostic.team_changed).toBe(true);
      expect(entry.diagnostic.role_sourced).toBe(true);
      expect(entry.diagnostic.historical_share).toBeCloseTo(0.05);
    }
  });

  it("is deterministic for identical inputs", () => {
    expect(buildReceivingRoleConflictArchiveEntry(base)).toEqual(buildReceivingRoleConflictArchiveEntry(base));
  });
});
