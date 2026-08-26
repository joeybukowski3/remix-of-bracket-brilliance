import { describe, expect, it } from "vitest";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { getShadowModelRankRow } from "@/lib/fantasy/rosResearch/shadowModelRankJoin";

describe("getShadowModelRankRow", () => {
  it("resolves Justin Jefferson to a rank-eligible historical-model row", () => {
    const jefferson = FANTASY_RANKINGS.rows.find((row) => row.player === "Justin Jefferson")!;
    const model = getShadowModelRankRow(jefferson.overallRank);
    expect(model).toBeDefined();
    expect(model!.rankEligible).toBe(true);
    expect(model!.projectionSource).toBe("historical-model");
    expect(model!.modelRank).not.toBeNull();
  });

  it("withholds rank (but not the diagnostic PPG) for Tyreek Hill (confirmed free agent)", () => {
    const hill = FANTASY_RANKINGS.rows.find((row) => row.player === "Tyreek Hill");
    if (!hill) return;
    const model = getShadowModelRankRow(hill.overallRank)!;
    expect(model.rankEligible).toBe(false);
    expect(model.modelRank).toBeNull();
    expect(model.availabilityStatus).toBe("FREE_AGENT");
  });

  it("surfaces the Brandon Aiyuk status conflict rather than silently resolving it", () => {
    const aiyuk = FANTASY_RANKINGS.rows.find((row) => row.player === "Brandon Aiyuk");
    if (!aiyuk) return;
    const model = getShadowModelRankRow(aiyuk.overallRank)!;
    expect(model.rankEligible).toBe(false);
    expect(model.modelRank).toBeNull();
    expect(model.statusConflict).toBe(true);
    expect(model.statusConflictReason).toMatch(/released/i);
  });

  it("fails closed (undefined) for an overallRank absent from the artifact, never a fuzzy/nearest match", () => {
    expect(getShadowModelRankRow(-1)).toBeUndefined();
    expect(getShadowModelRankRow(999999)).toBeUndefined();
  });

  it("never mutates FANTASY_RANKINGS", () => {
    const before = structuredClone(FANTASY_RANKINGS.rows);
    for (const row of FANTASY_RANKINGS.rows) getShadowModelRankRow(row.overallRank);
    expect(FANTASY_RANKINGS.rows).toEqual(before);
  });
});
