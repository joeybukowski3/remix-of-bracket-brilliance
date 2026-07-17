import { describe, expect, it } from "vitest";
import {
  evaluateKValuePlayEligibility,
  getKValueEdgeInfo,
  K_VALUE_EXCLUSION_REASON,
  MIN_PROJECTED_IP,
  selectConfirmedKRows,
} from "../../../scripts/lib/mlb-k-x-selection-core.mjs";

function kRow(overrides: Record<string, unknown> = {}) {
  return {
    pitcher: "Zack Wheeler",
    team: "PHI",
    opponent: "DET",
    status: "VALID",
    kLine: 6.5,
    oddsOver: "-115",
    oddsUnder: "-105",
    // projectedKs - kLine = +1.7 (OVER) by default. Side is derived
    // strictly from this sign -- set projectedKs/kLine directly to control
    // both the edge magnitude and the resulting side.
    projectedKs: 8.2,
    projectedIP: 6.0,
    isCurrentStarter: true,
    gameStarted: false,
    opposingLineupConfirmed: true,
    ...overrides,
  };
}

describe("K value-play eligibility (getKValueEdgeInfo / evaluateKValuePlayEligibility)", () => {
  it("derives OVER for a positive edge, UNDER for a negative edge, from projectedKs - kLine directly", () => {
    expect(getKValueEdgeInfo(kRow({ projectedKs: 8, kLine: 6.5 })).side).toBe("OVER");
    expect(getKValueEdgeInfo(kRow({ projectedKs: 4, kLine: 6.5 })).side).toBe("UNDER");
  });

  it("computes the edge magnitude from projectedKs - kLine", () => {
    expect(getKValueEdgeInfo({ projectedKs: 8, kLine: 6.5 }).edge).toBeCloseTo(1.5);
    expect(getKValueEdgeInfo({ projectedKs: 4, kLine: 6.5 }).edge).toBeCloseTo(-2.5);
  });

  it("OVER uses oddsOver, UNDER uses oddsUnder -- odds on the opposite side don't qualify", () => {
    expect(evaluateKValuePlayEligibility(kRow({ projectedKs: 8, kLine: 6.5, oddsOver: "-115" })).eligible).toBe(true);
    expect(evaluateKValuePlayEligibility(kRow({ projectedKs: 8, kLine: 6.5, oddsOver: "" })).eligible).toBe(false);
    expect(evaluateKValuePlayEligibility(kRow({ projectedKs: 4, kLine: 6.5, oddsUnder: "+100" })).eligible).toBe(true);
    expect(evaluateKValuePlayEligibility(kRow({ projectedKs: 4, kLine: 6.5, oddsUnder: null })).eligible).toBe(false);
  });

  it("excludes lines below 3.5", () => {
    expect(evaluateKValuePlayEligibility(kRow({ kLine: 3.5, projectedKs: 5 })).eligible).toBe(true);
    expect(evaluateKValuePlayEligibility(kRow({ kLine: 3.0, projectedKs: 5 })).eligible).toBe(false);
  });

  it("excludes non-VALID rows", () => {
    expect(evaluateKValuePlayEligibility(kRow({ status: "LOW_CONFIDENCE" })).eligible).toBe(false);
  });

  it("requires projected IP strictly greater than 3.0 -- exactly 3.0 excluded, missing excluded", () => {
    expect(evaluateKValuePlayEligibility(kRow({ projectedIP: MIN_PROJECTED_IP })).eligible).toBe(false);
    expect(evaluateKValuePlayEligibility(kRow({ projectedIP: 3.1 })).eligible).toBe(true);
    expect(evaluateKValuePlayEligibility(kRow({ projectedIP: null })).eligible).toBe(false);
  });

  it("requires a non-zero projection edge", () => {
    const result = evaluateKValuePlayEligibility(kRow({ projectedKs: 6.5, kLine: 6.5 }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(K_VALUE_EXCLUSION_REASON.INVALID_MARKET);
  });

  it("excludes already-started games and non-current starters", () => {
    expect(evaluateKValuePlayEligibility(kRow({ gameStarted: true })).reason).toBe(K_VALUE_EXCLUSION_REASON.STALE_STARTER);
    expect(evaluateKValuePlayEligibility(kRow({ isCurrentStarter: false })).reason).toBe(K_VALUE_EXCLUSION_REASON.STALE_STARTER);
  });
});

describe("selectConfirmedKRows ranking + confirmation", () => {
  it("ranks by strongest absolute projection edge, OVER/UNDER both eligible", () => {
    const rows = [
      kRow({ pitcher: "A", projectedKs: 7.5 }), // edge +1.0
      kRow({ pitcher: "B", oddsUnder: "-120", projectedKs: 4.0 }), // edge -2.5
      kRow({ pitcher: "C", projectedKs: 8.3 }), // edge +1.8
    ];
    const { selected } = selectConfirmedKRows({ rows });
    expect(selected.map((r) => r.pitcher)).toEqual(["B", "C", "A"]);
    expect(selected.map((r) => r.direction)).toEqual(["UNDER", "OVER", "OVER"]);
  });

  it("excludes a replaced/stale starter", () => {
    const rows = [kRow({ pitcher: "current" }), kRow({ pitcher: "replaced", isCurrentStarter: false })];
    const { selected, excludedStaleStarterCount } = selectConfirmedKRows({ rows });
    expect(selected.map((r) => r.pitcher)).toEqual(["current"]);
    expect(excludedStaleStarterCount).toBe(1);
  });

  it("during polling, prefers rows whose opposing lineup is confirmed and holds the rest", () => {
    const rows = [
      kRow({ pitcher: "confirmedOpp", opposingLineupConfirmed: true, projectedKs: 7.7 }), // edge +1.2
      kRow({ pitcher: "pendingOpp", opposingLineupConfirmed: false, projectedKs: 9.5 }), // edge +3.0
    ];
    const { selected, heldForOpposingCount } = selectConfirmedKRows({ rows, atCutoff: false });
    expect(selected.map((r) => r.pitcher)).toEqual(["confirmedOpp"]);
    expect(heldForOpposingCount).toBe(1);
  });

  it("at the cutoff, allows valid current starters even without a confirmed opposing lineup", () => {
    const rows = [
      kRow({ pitcher: "confirmedOpp", opposingLineupConfirmed: true, projectedKs: 7.7 }), // edge +1.2
      kRow({ pitcher: "pendingOpp", opposingLineupConfirmed: false, projectedKs: 9.5 }), // edge +3.0
    ];
    const { selected, heldForOpposingCount } = selectConfirmedKRows({ rows, atCutoff: true });
    expect(selected.map((r) => r.pitcher)).toEqual(["pendingOpp", "confirmedOpp"]);
    expect(heldForOpposingCount).toBe(0);
  });

  it("posts fewer rows safely and posts nothing when zero qualify", () => {
    expect(selectConfirmedKRows({ rows: [kRow()] }).selected).toHaveLength(1);
    const noneValid = selectConfirmedKRows({ rows: [kRow({ status: "NO_MARKET" })] });
    expect(noneValid.selected).toHaveLength(0);
    expect(noneValid.validStarterCount).toBe(0);
  });

  it("respects maxTableSize", () => {
    const rows = Array.from({ length: 8 }, (_, i) => kRow({ pitcher: `P${i}`, projectedKs: 6.5 + (i + 1) }));
    expect(selectConfirmedKRows({ rows, maxTableSize: 5 }).selected).toHaveLength(5);
  });
});

describe("selectConfirmedKRows deterministic tie-breaks (edge -> projected IP -> pitcher name)", () => {
  it("breaks a tied absolute edge by higher projected IP, descending", () => {
    const rows = [
      kRow({ pitcher: "LowerIP", projectedKs: 8.1, kLine: 6.5, projectedIP: 5.0 }), // edge +1.6
      kRow({ pitcher: "HigherIP", projectedKs: 8.1, kLine: 6.5, projectedIP: 6.5 }), // edge +1.6, same magnitude
    ];
    const { selected } = selectConfirmedKRows({ rows });
    expect(selected.map((r) => r.pitcher)).toEqual(["HigherIP", "LowerIP"]);
  });

  it("falls through to alphabetical pitcher name when both edge and projected IP tie exactly", () => {
    const rows = [
      kRow({ pitcher: "Zeta", projectedKs: 8.1, kLine: 6.5, projectedIP: 5.5 }),
      kRow({ pitcher: "Alpha", projectedKs: 8.1, kLine: 6.5, projectedIP: 5.5 }),
      kRow({ pitcher: "Mike", projectedKs: 8.1, kLine: 6.5, projectedIP: 5.5 }),
    ];
    const { selected } = selectConfirmedKRows({ rows });
    expect(selected.map((r) => r.pitcher)).toEqual(["Alpha", "Mike", "Zeta"]);
  });

  it("edge takes priority over projected IP -- a bigger edge always wins regardless of IP", () => {
    const rows = [
      kRow({ pitcher: "BigEdgeLowIP", projectedKs: 10.5, kLine: 6.5, projectedIP: 3.1 }), // edge +4.0
      kRow({ pitcher: "SmallEdgeHighIP", projectedKs: 7.0, kLine: 6.5, projectedIP: 7.0 }), // edge +0.5
    ];
    const { selected } = selectConfirmedKRows({ rows });
    expect(selected.map((r) => r.pitcher)).toEqual(["BigEdgeLowIP", "SmallEdgeHighIP"]);
  });
});
