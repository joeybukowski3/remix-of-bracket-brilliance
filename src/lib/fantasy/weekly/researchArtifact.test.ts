import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMatchupGrade } from "@/lib/fantasy/matchupGrade";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import {
  assertWeeklyFantasyResearchArtifactIdentity,
  weeklyFantasyResearchArtifactPath,
  weeklyFantasyResearchArtifactSchema,
} from "@/lib/fantasy/weekly/researchArtifact";

function fixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8"));
}

describe("weekly fantasy research artifact", () => {
  const projection = weeklyFantasyProjectionProductionArtifactSchema.parse(
    fixture("public/data/fantasy/projections/2026/week-01.json"),
  );
  const research = weeklyFantasyResearchArtifactSchema.parse(
    fixture("public/data/fantasy/weekly-research/2026/week-01.json"),
  );

  it("uses a separate versioned path and contains no projection authority fields", () => {
    expect(weeklyFantasyResearchArtifactPath(2026, 1)).toBe("/data/fantasy/weekly-research/2026/week-01.json");
    expect(research.schemaVersion).toBe("weekly-fantasy-research-artifact-v1");
    for (const row of research.rows) {
      expect(row).not.toHaveProperty("positionRank");
      expect(row).not.toHaveProperty("projectedFantasyPoints");
    }
  });

  it("has an exact one-to-one canonical playerId set for all 498 projection rows", () => {
    assertWeeklyFantasyResearchArtifactIdentity(research);
    const projectionRows = (["QB", "RB", "WR", "TE"] as const).flatMap((position) => projection.rows[position]);
    expect(research.rows).toHaveLength(498);
    expect(new Set(research.rows.map((row) => row.playerId))).toEqual(new Set(projectionRows.map((row) => row.playerId)));
    const positions = new Map(research.rows.map((row) => [row.playerId, row.position]));
    expect(projectionRows.every((row) => positions.get(row.playerId) === row.position)).toBe(true);
  });

  it("stores the unchanged FPA-only matchup grade semantics", () => {
    for (const row of research.rows) {
      expect(row.matchupGrade).toBe(getMatchupGrade(row.context.opponentFpaSeason.rank)?.id ?? null);
    }
    expect(research.matchupGradeAuthority.input).toBe("opponentFpaSeason.rank");
  });

  it("keeps red-zone touches missing because the canonical history has no source field", () => {
    const runningBacks = research.rows.filter((row) => row.position === "RB");
    expect(runningBacks.length).toBeGreaterThan(0);
    expect(runningBacks.every((row) => row.context.evidence.redZoneTouches.value === null)).toBe(true);
    expect(runningBacks.every((row) => row.context.evidence.redZoneTouches.rank === null)).toBe(true);
  });
});
