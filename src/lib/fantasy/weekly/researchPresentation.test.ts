import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";
import {
  matchupGradeHeatTone,
  prepareWeeklyResearchPresentation,
  weeklyHeatTextClass,
  weeklyHeatStyle,
  weeklyMatchupComponentHeatTone,
  weeklyMatchupDifferenceHeatTone,
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

  it("normalizes offense and opponent-defense ranks to the fantasy player's perspective", () => {
    expect(weeklyMatchupComponentHeatTone(3, "offense")).toBe("gold");
    expect(weeklyMatchupComponentHeatTone(29, "offense")).toBe("strong-red");
    expect(weeklyMatchupComponentHeatTone(29, "opponent-defense")).toBe("dark-green");
    expect(weeklyMatchupComponentHeatTone(3, "opponent-defense")).toBe("strong-red");
  });

  it("maps signed matchup differences through the established 32-team quality bands", () => {
    expect(weeklyMatchupDifferenceHeatTone(31)).toBe("gold");
    expect(weeklyMatchupDifferenceHeatTone(12)).toBe("green");
    expect(weeklyMatchupDifferenceHeatTone(0)).toBe("neutral");
    expect(weeklyMatchupDifferenceHeatTone(-15)).toBe("red");
    expect(weeklyMatchupDifferenceHeatTone(-31)).toBe("strong-red");
    expect(weeklyHeatTextClass("gold")).toContain("amber");
    expect(weeklyHeatTextClass("strong-red")).toContain("red");
  });

  it("keeps weekly matchup edge rank one gold and rank thirty strong red", () => {
    expect(weeklyRankHeatTone(1, 32)).toBe("gold");
    expect(weeklyRankHeatTone(30, 32)).toBe("strong-red");
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

  it("keeps representative heat foregrounds readable without changing their fills", () => {
    const parseColor = (color: string) => {
      const hex = color.match(/^#([0-9a-f]{6})$/i);
      if (hex) {
        const value = Number.parseInt(hex[1], 16);
        return { rgb: [(value >> 16) & 255, (value >> 8) & 255, value & 255], alpha: 1 };
      }
      const rgba = color.match(/[\d.]+/g)!.map(Number);
      return { rgb: rgba.slice(0, 3), alpha: rgba[3] ?? 1 };
    };
    const luminance = (rgb: number[]) => {
      const [red, green, blue] = rgb
        .map((channel) => channel / 255)
        .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrast = (tone: "gold" | "green" | "neutral" | "red" | "strong-red") => {
      const style = weeklyHeatStyle(tone);
      const background = parseColor(style.backgroundColor);
      const foreground = parseColor(style.color);
      const compositedBackground = background.rgb.map(
        (channel) => channel * background.alpha + 255 * (1 - background.alpha),
      );
      const left = luminance(compositedBackground);
      const right = luminance(foreground.rgb);
      return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
    };

    for (const tone of ["gold", "green", "neutral", "red", "strong-red"] as const) {
      expect(contrast(tone), tone).toBeGreaterThanOrEqual(4.5);
    }
    expect(weeklyHeatStyle("green").backgroundColor).toBe("#10b981");
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
    expect(bestEpa.matchupEdges.epa.tone).toBe(weeklyMatchupDifferenceHeatTone(bestEpa.matchupEdges.epa.rawValue));
  });
});
