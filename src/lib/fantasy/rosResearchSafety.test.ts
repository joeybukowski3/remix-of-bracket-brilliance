import { describe, expect, it } from "vitest";
import { FANTASY_PAR_ROWS } from "@/lib/fantasy/parRankings";
import { buildOverallRowContext } from "@/lib/fantasy/overallRowContext";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";

describe("ROS research presentation safety", () => {
  it("does not mutate canonical ranks, PAR/G, or projection fields while preparing history", () => {
    const rankingsBefore = structuredClone(FANTASY_RANKINGS.rows);
    const parBefore = structuredClone(FANTASY_PAR_ROWS);
    buildOverallRowContext(FANTASY_PAR_ROWS, FANTASY_RANKINGS.rows);
    expect(FANTASY_RANKINGS.rows).toEqual(rankingsBefore);
    expect(FANTASY_PAR_ROWS).toEqual(parBefore);
  });

  it("retains known canonical ranking and projection anchors", () => {
    const gibbs = FANTASY_RANKINGS.rows.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbs).toMatchObject({ overallRank: 1, positionRank: 1, projectionRank: 1 });
    const gibbsPar = FANTASY_PAR_ROWS.find((row) => row.player === "Jahmyr Gibbs")!;
    expect(gibbsPar.parPerGame).toBeCloseTo(10.72, 2);
  });
});
