import { describe, expect, it } from "vitest";
import { buildDstRow, buildOffensiveRow } from "./optimizer/__fixtures__/optimizerRowFactory";
import { DFS_POSITION_RANK_CAPS, filterDfsCandidatePool, isDfsCandidatePoolPlayer } from "./dfsPlayerPool";

const baseOffense = { team: "aaa", gameKey: "g1", salary: 5000, projectedFantasyPoints: 10 } as const;

describe("DFS_POSITION_RANK_CAPS", () => {
  it("matches the specified hard caps", () => {
    expect(DFS_POSITION_RANK_CAPS).toEqual({ QB: 24, RB: 50, WR: 72, TE: 30 });
  });
});

describe("isDfsCandidatePoolPlayer", () => {
  it("excludes QB25 and beyond", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "q25", position: "QB", jkbWeeklyPositionRank: 25 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("includes QB24 (at the cap)", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "q24", position: "QB", jkbWeeklyPositionRank: 24 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(true);
  });
  it("excludes RB51 and beyond", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "r51", position: "RB", jkbWeeklyPositionRank: 51 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("includes RB50 (at the cap)", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "r50", position: "RB", jkbWeeklyPositionRank: 50 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(true);
  });
  it("excludes WR73 and beyond", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "w73", position: "WR", jkbWeeklyPositionRank: 73 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("includes WR72 (at the cap)", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "w72", position: "WR", jkbWeeklyPositionRank: 72 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(true);
  });
  it("excludes TE31 and beyond", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "t31", position: "TE", jkbWeeklyPositionRank: 31 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("includes TE30 (at the cap)", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "t30", position: "TE", jkbWeeklyPositionRank: 30 });
    expect(isDfsCandidatePoolPlayer(row)).toBe(true);
  });
  it("excludes a rank-eligible player who is OUT", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "out1", position: "QB", jkbWeeklyPositionRank: 1, dkStatus: "OUT" });
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("excludes a rank-eligible player who is IR", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "ir1", position: "WR", jkbWeeklyPositionRank: 1, dkStatus: "IR" });
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("excludes a rank-eligible player whose sourced role-context availability is 'out'", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "roleout", position: "RB", jkbWeeklyPositionRank: 1 });
    row.roleContext = { ...row.roleContext!, availability: "out" };
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("excludes a player with no canonical JKB Weekly Position Rank (prefers the false negative)", () => {
    const row = buildOffensiveRow({ ...baseOffense, dkId: "norank", position: "WR", jkbWeeklyPositionRank: null });
    expect(isDfsCandidatePoolPlayer(row)).toBe(false);
  });
  it("keeps a valid DST regardless of rank fields", () => {
    const dst = buildDstRow({ dkId: "d1", team: "no", gameKey: "g1", salary: 3000, percentile: 50 });
    expect(isDfsCandidatePoolPlayer(dst)).toBe(true);
  });
  it("still excludes a DST marked OUT/IR", () => {
    const dst = buildDstRow({ dkId: "d2", team: "no", gameKey: "g1", salary: 3000, percentile: 50 });
    dst.dkStatus = "OUT";
    expect(isDfsCandidatePoolPlayer(dst)).toBe(false);
  });
});

describe("filterDfsCandidatePool", () => {
  it("removes only the players the gate excludes, preserving order", () => {
    const keep = buildOffensiveRow({ ...baseOffense, dkId: "keep", position: "QB", jkbWeeklyPositionRank: 5 });
    const drop = buildOffensiveRow({ ...baseOffense, dkId: "drop", position: "QB", jkbWeeklyPositionRank: 30 });
    expect(filterDfsCandidatePool([keep, drop])).toEqual([keep]);
  });
});
