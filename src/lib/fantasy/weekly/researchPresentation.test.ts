import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";
import {
  matchupGradeHeatTone,
  prepareWeeklyResearchPresentation,
  weeklyHeatStyle,
  weeklyRankHeatTone,
} from "@/lib/fantasy/weekly/researchPresentation";
import { PERCENTILE_TIERS } from "@/lib/mlb/percentileColorScale";

function fixture(relativePath: string) {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8"));
}

const projections = weeklyFantasyProjectionProductionArtifactSchema.parse(
  fixture("public/data/fantasy/projections/2026/week-01.json"),
);
const research = weeklyFantasyResearchArtifactSchema.parse(
  fixture("public/data/fantasy/weekly-research/2026/week-01.json"),
);

describe("weekly fantasy research heat presentation", () => {
  it("maps every requested percentile tier distinctly", () => {
    expect([
      weeklyRankHeatTone(5, 100),
      weeklyRankHeatTone(15, 100),
      weeklyRankHeatTone(30, 100),
      weeklyRankHeatTone(45, 100),
      weeklyRankHeatTone(60, 100),
      weeklyRankHeatTone(75, 100),
      weeklyRankHeatTone(90, 100),
      weeklyRankHeatTone(91, 100),
    ]).toEqual(["gold", "dark-green", "green", "light-green", "neutral", "light-red", "red", "strong-red"]);
  });

  it("uses the explicit 32-team matchup bands", () => {
    expect([
      weeklyRankHeatTone(3, 32),
      weeklyRankHeatTone(6, 32),
      weeklyRankHeatTone(10, 32),
      weeklyRankHeatTone(14, 32),
      weeklyRankHeatTone(18, 32),
      weeklyRankHeatTone(22, 32),
      weeklyRankHeatTone(27, 32),
      weeklyRankHeatTone(28, 32),
    ]).toEqual(["gold", "dark-green", "green", "light-green", "neutral", "light-red", "red", "strong-red"]);
  });

  it("keeps a 40th-ish WR metric visually below a 13th-ranked metric", () => {
    expect(weeklyRankHeatTone(13, 188)).toBe("dark-green");
    expect(weeklyRankHeatTone(40, 188)).toBe("green");
    expect(weeklyRankHeatTone(100, 188)).toBe("neutral");
    expect(weeklyRankHeatTone(40, 188)).not.toBe(weeklyRankHeatTone(13, 188));
  });

  it("reuses the MLB elite, green, and neutral visual tokens", () => {
    const tier = (id: (typeof PERCENTILE_TIERS)[number]["id"]) => PERCENTILE_TIERS.find((entry) => entry.id === id)!.style;
    expect(weeklyHeatStyle("gold").backgroundColor).toBe(tier("elite").backgroundColor);
    expect(weeklyHeatStyle("dark-green").backgroundColor).toBe(tier("excellent").backgroundColor);
    expect(weeklyHeatStyle("green").backgroundColor).toBe(tier("great").backgroundColor);
    expect(weeklyHeatStyle("light-green").backgroundColor).toBe(tier("aboveAverage").backgroundColor);
    expect(weeklyHeatStyle("neutral").backgroundColor).toBe(tier("average").backgroundColor);
  });

  it("aligns categorical matchup grades with gold/green/neutral/red semantics", () => {
    expect(matchupGradeHeatTone("great")).toBe("gold");
    expect(matchupGradeHeatTone("good")).toBe("dark-green");
    expect(matchupGradeHeatTone("neutral")).toBe("neutral");
    expect(matchupGradeHeatTone("tough")).toBe("red");
    expect(matchupGradeHeatTone("very-tough")).toBe("strong-red");
  });

  it("prepares favorable ranks with correct player and 32-team pools without mutating projection tuples", () => {
    const joined = joinWeeklyFantasyResearchRows(projections.rows.WR, research).rows;
    const before = joined.map((row) => [row.playerId, row.positionRank, row.projectedFantasyPoints] as const);
    const prepared = prepareWeeklyResearchPresentation(joined);
    const after = prepared.map(({ row }) => [row.playerId, row.positionRank, row.projectedFantasyPoints] as const);

    expect(after).toEqual(before);
    expect(prepared.every(({ row }, index) => row === joined[index])).toBe(true);
    expect(prepared[0].projectedFantasyPoints).toMatchObject({
      rawValue: joined[0].projectedFantasyPoints,
      displayRank: joined[0].positionRank,
      poolSize: joined.length,
      tone: "gold",
    });
    expect(prepared.at(-1)?.projectedFantasyPoints.displayRank).toBe(joined.at(-1)?.positionRank);
    expect(prepared[0].seasonPpg.poolSize).toBe(joined[0].research.seasonPpg.poolSize);
    expect(prepared[0].seasonPpg.poolSize).not.toBe(32);
    expect(prepared.every((row) => row.opponentFpaSeason.poolSize === 32)).toBe(true);
    expect(prepared.every((row) => row.matchupEdges.epa.poolSize === 32)).toBe(true);

    const bestEpa = prepared.reduce((best, row) =>
      (row.matchupEdges.epa.rawValue ?? Number.NEGATIVE_INFINITY) > (best.matchupEdges.epa.rawValue ?? Number.NEGATIVE_INFINITY) ? row : best,
    );
    expect(bestEpa.matchupEdges.epa.displayRank).toBe(1);
    expect(bestEpa.matchupEdges.epa.tone).toBe("gold");
  });
});
