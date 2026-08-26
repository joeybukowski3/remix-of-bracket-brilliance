import { describe, expect, it } from "vitest";
import { FANTASY_PAR_ROWS } from "@/lib/fantasy/parRankings";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { buildRosIdentityCrosswalk } from "@/lib/fantasy/rosResearch/identity";
import { buildHistoricalBaseline } from "@/lib/fantasy/rosResearch/historicalBaseline";
import { buildUsageRoleContext } from "@/lib/fantasy/rosResearch/usageRoleContext";
import { buildTeamMarketContext } from "@/lib/fantasy/rosResearch/teamMarketContext";
import { buildScheduleFpaContext } from "@/lib/fantasy/rosResearch/scheduleFpaContext";

describe("Phase 1/2 ROS research safety", () => {
  it("does not mutate the live workbook rows or PAR rows while building the identity crosswalk", () => {
    const rankingsBefore = structuredClone(FANTASY_RANKINGS.rows);
    const parBefore = structuredClone(FANTASY_PAR_ROWS);
    buildRosIdentityCrosswalk({ rankingRows: FANTASY_RANKINGS.rows, parRows: [], playerRows: [], rosterRows: [] });
    expect(FANTASY_RANKINGS.rows).toEqual(rankingsBefore);
    expect(FANTASY_PAR_ROWS).toEqual(parBefore);
  });

  it("retains known canonical ranking and PAR anchors (unchanged by this feature)", () => {
    const gibbs = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs).toMatchObject({ overallRank: 1, positionRank: 1, projectionRank: 1 });
    const gibbsPar = FANTASY_PAR_ROWS.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbsPar.parPerGame).toBeCloseTo(10.72, 2);
  });

  it("Phase 2 builders do not mutate their inputs", () => {
    const rankingRows = structuredClone(FANTASY_RANKINGS.rows.slice(0, 5));
    buildHistoricalBaseline([], []);
    buildUsageRoleContext([], []);
    buildTeamMarketContext([], [], { source: "x", generatedAt: "2026-01-01T00:00:00.000Z" });
    buildScheduleFpaContext(new Map(), new Map(), 2025);
    expect(FANTASY_RANKINGS.rows.slice(0, 5)).toEqual(rankingRows);
  });

  it("replacement levels referenced by this feature match the frozen, unchanged values", () => {
    const byPosition = Object.fromEntries(FANTASY_PAR_ROWS.map((row) => [row.position, row.replacementPpg]));
    expect(byPosition.QB).toBeCloseTo(17.5667, 3);
    expect(byPosition.RB).toBeCloseTo(12.1667, 3);
    expect(byPosition.WR).toBeCloseTo(11.5667, 3);
    expect(byPosition.TE).toBeCloseTo(9.9333, 3);
  });
});
