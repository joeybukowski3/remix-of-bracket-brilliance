import { describe, expect, it } from "vitest";
import shadowRosProjectionsArtifact from "../../../../data/fantasy/ros-research/2026/shadow-ros-projections.json";
import { FANTASY_PAR_RANKINGS } from "@/lib/fantasy/parRankings";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import {
  computeF2PromotedModelRanks,
  type PromotedModelRankInput,
} from "@/lib/fantasy/rosResearch/shadowProjection";
import { getShadowModelRankRow } from "@/lib/fantasy/rosResearch/shadowModelRankJoin";

type ArtifactPlayer = PromotedModelRankInput & {
  currentOverallRank: number;
  shadowPositionRank: number | null;
  shadowModelRank: number | null;
};

const artifactPlayers = shadowRosProjectionsArtifact.players as unknown as readonly ArtifactPlayer[];

describe("getShadowModelRankRow", () => {
  it("resolves Justin Jefferson to a rank-eligible historical-model row", () => {
    const jefferson = FANTASY_RANKINGS.rows.find((row) => row.player === "Justin Jefferson")!;
    const model = getShadowModelRankRow(jefferson.overallRank);
    expect(model).toBeDefined();
    expect(model!.rankEligible).toBe(true);
    expect(model!.projectionSource).toBe("historical-model");
    expect(model!.modelRank).not.toBeNull();
  });

  it("keeps every promoted artifact rank aligned with the same F2 authority exposed by the live join", () => {
    const expectedRanks = new Map(
      computeF2PromotedModelRanks(artifactPlayers).map((rank) => [rank.canonicalPlayerId, rank]),
    );
    for (const player of artifactPlayers) {
      const expected = expectedRanks.get(player.canonicalPlayerId);
      expect(player.shadowPositionRank).toBe(expected?.shadowPositionRank ?? null);
      expect(player.shadowModelRank).toBe(expected?.shadowModelRank ?? null);

      const f2 = player.refinedCandidates.find((candidate) => candidate.candidate === "F2")!;
      const replacementPpg = FANTASY_PAR_RANKINGS[player.position][0].replacementPpg;
      if (f2.projectedPpg != null) {
        expect(f2.shadowParPerGame).toBeCloseTo(f2.projectedPpg - replacementPpg, 12);
      }
      const joined = getShadowModelRankRow(player.currentOverallRank)!;
      expect(joined.modelProjectedPpg).toBe(f2.projectedPpg);
      expect(joined.modelParPerGame).toBe(f2.shadowParPerGame);
      expect(joined.modelPositionRank).toBe(expected?.shadowPositionRank ?? null);
      expect(joined.modelRank).toBe(expected?.shadowModelRank ?? null);
    }
  });

  it("withholds rank (but not the diagnostic PPG) for Tyreek Hill (confirmed free agent)", () => {
    const hill = FANTASY_RANKINGS.rows.find((row) => row.player === "Tyreek Hill");
    if (!hill) return;
    const model = getShadowModelRankRow(hill.overallRank)!;
    expect(model.rankEligible).toBe(false);
    expect(model.modelRank).toBeNull();
    expect(model.modelPositionRank).toBeNull();
    expect(model.modelProjectedPpg).not.toBeNull();
    expect(model.availabilityStatus).toBe("FREE_AGENT");
  });

  it("surfaces the Brandon Aiyuk status conflict rather than silently resolving it", () => {
    const aiyuk = FANTASY_RANKINGS.rows.find((row) => row.player === "Brandon Aiyuk");
    if (!aiyuk) return;
    const model = getShadowModelRankRow(aiyuk.overallRank)!;
    expect(model.rankEligible).toBe(false);
    expect(model.modelRank).toBeNull();
    expect(model.modelPositionRank).toBeNull();
    expect(model.modelProjectedPpg).not.toBeNull();
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
