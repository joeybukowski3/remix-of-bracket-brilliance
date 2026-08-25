import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";

function fixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8"));
}

describe("weekly fantasy research presentation join", () => {
  const projection = weeklyFantasyProjectionProductionArtifactSchema.parse(
    fixture("public/data/fantasy/projections/2026/week-01.json"),
  );
  const research = weeklyFantasyResearchArtifactSchema.parse(
    fixture("public/data/fantasy/weekly-research/2026/week-01.json"),
  );

  it("joins by exact playerId without changing order, rank, or projected points", () => {
    const source = (["QB", "RB", "WR", "TE"] as const).flatMap((position) => projection.rows[position]);
    const joined = joinWeeklyFantasyResearchRows(source, research);
    expect(joined.missingPlayerIds).toEqual([]);
    expect(joined.rows.map((row) => [row.playerId, row.positionRank, row.projectedFantasyPoints, row.baselineFantasyPoints]))
      .toEqual(source.map((row) => [row.playerId, row.positionRank, row.projectedFantasyPoints, row.baselineFantasyPoints]));
  });

  it("degrades a missing research row to N/A-shaped nulls without failing projection rows", () => {
    const source = projection.rows.RB.slice(0, 2);
    const missingTopRow = { ...research, rows: research.rows.filter((row) => row.playerId !== source[0].playerId) };
    const joined = joinWeeklyFantasyResearchRows(source, missingTopRow);
    expect(joined.rows).toHaveLength(2);
    expect(joined.missingPlayerIds).toEqual([source[0].playerId]);
    expect(joined.rows[0].projectedFantasyPoints).toBe(source[0].projectedFantasyPoints);
    expect(joined.rows[0].research.seasonPpg.value).toBeNull();
    expect(joined.rows[0].matchupRating).toBeNull();
    expect(joined.rows[0].matchupEdges.trenches.score).toBeNull();
  });

  it("rejects position-mismatched research from the presentation row", () => {
    const source = projection.rows.QB.slice(0, 1);
    const altered = {
      ...research,
      rows: research.rows.map((row) => row.playerId === source[0].playerId ? { ...row, position: "RB" as const } : row),
    };
    const joined = joinWeeklyFantasyResearchRows(source, altered);
    expect(joined.mismatchedPlayerIds).toEqual([source[0].playerId]);
    expect(joined.rows[0].research.seasonPpg.value).toBeNull();
  });
});
