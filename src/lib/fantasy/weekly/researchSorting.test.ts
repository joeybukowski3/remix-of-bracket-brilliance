import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";
import { prepareWeeklyResearchPresentation } from "@/lib/fantasy/weekly/researchPresentation";
import {
  defaultWeeklySortDirection,
  sortWeeklyResearchPresentation,
  type WeeklyResearchSortKey,
} from "@/lib/fantasy/weekly/researchSorting";

function fixture(relativePath: string) {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8"));
}

const projections = weeklyFantasyProjectionProductionArtifactSchema.parse(
  fixture("public/data/fantasy/projections/2026/week-01.json"),
);
const research = weeklyFantasyResearchArtifactSchema.parse(
  fixture("public/data/fantasy/weekly-research/2026/week-01.json"),
);
const rbRows = joinWeeklyFantasyResearchRows(projections.rows.RB, research).rows;
const presentation = prepareWeeklyResearchPresentation(rbRows);

function expectAscending(values: readonly (number | string)[]) {
  expect(values).toEqual([...values].sort((left, right) =>
    typeof left === "string"
      ? left.localeCompare(String(right), undefined, { sensitivity: "base" })
      : Number(left) - Number(right),
  ));
}

describe("weekly research presentation sorting", () => {
  it("defines the requested useful first-click directions", () => {
    expect(defaultWeeklySortDirection("rank", "rank")).toBe("asc");
    expect(defaultWeeklySortDirection("player", "rank")).toBe("asc");
    expect(defaultWeeklySortDirection("opponent", "rank")).toBe("asc");
    expect(defaultWeeklySortDirection("matchup", "rank")).toBe("asc");
    expect(defaultWeeklySortDirection("projectedFantasyPoints", "rank")).toBe("desc");
    expect(defaultWeeklySortDirection("seasonPpg", "rank")).toBe("asc");
    expect(defaultWeeklySortDirection("seasonPpg", "stat")).toBe("desc");
    expect(defaultWeeklySortDirection("touches", "rank")).toBe("asc");
    expect(defaultWeeklySortDirection("touches", "stat")).toBe("desc");
    expect(defaultWeeklySortDirection("trenches", "rank")).toBe("asc");
    expect(defaultWeeklySortDirection("epa", "stat")).toBe("desc");
  });

  it("sorts canonical rank, player, opponent, and projected points in both directions", () => {
    const cases: readonly [WeeklyResearchSortKey, "asc" | "desc", (row: (typeof presentation)[number]) => number | string][] = [
      ["rank", "asc", ({ row }) => row.positionRank],
      ["player", "asc", ({ row }) => row.playerName],
      ["opponent", "asc", ({ row }) => row.opponent],
      ["projectedFantasyPoints", "desc", ({ row }) => row.projectedFantasyPoints],
    ];

    for (const [key, direction, value] of cases) {
      const sorted = sortWeeklyResearchPresentation(presentation, { key, direction }, "rank");
      const values = sorted.map(value);
      if (direction === "asc") expectAscending(values);
      else expectAscending([...values].reverse());

      const reversed = sortWeeklyResearchPresentation(presentation, {
        key,
        direction: direction === "asc" ? "desc" : "asc",
      }, "rank");
      expect(reversed.map(value)).toEqual([...values].reverse());
    }
  });

  it("uses raw stats in Stat View and display ranks in Rank View", () => {
    const stat = sortWeeklyResearchPresentation(presentation, { key: "seasonPpg", direction: "desc" }, "stat");
    const rank = sortWeeklyResearchPresentation(presentation, { key: "seasonPpg", direction: "asc" }, "rank");
    const statValues = stat.map((row) => row.seasonPpg.rawValue).filter((value): value is number => value != null);
    const rankValues = rank.map((row) => row.seasonPpg.displayRank).filter((value): value is number => value != null);
    expectAscending([...statValues].reverse());
    expectAscending(rankValues);
  });

  it("sorts matchup semantically and position evidence by raw value or display rank", () => {
    const matchupOrder = { great: 1, good: 2, neutral: 3, tough: 4, "very-tough": 5 } as const;
    const matchup = sortWeeklyResearchPresentation(presentation, { key: "matchup", direction: "asc" }, "rank")
      .map(({ row }) => row.matchupRating?.id ? matchupOrder[row.matchupRating.id] : null)
      .filter((value): value is number => value != null);
    expectAscending(matchup);

    const rawTouches = sortWeeklyResearchPresentation(presentation, { key: "touches", direction: "desc" }, "stat")
      .map((row) => row.evidence.touches.rawValue).filter((value): value is number => value != null);
    const rankedTouches = sortWeeklyResearchPresentation(presentation, { key: "touches", direction: "asc" }, "rank")
      .map((row) => row.evidence.touches.displayRank).filter((value): value is number => value != null);
    expectAscending([...rawTouches].reverse());
    expectAscending(rankedTouches);
  });

  it("sorts shared matchup edges by weekly rank or signed rank difference", () => {
    for (const key of ["trenches", "epa", "success"] as const) {
      const ranked = sortWeeklyResearchPresentation(presentation, { key, direction: "asc" }, "rank")
        .map((row) => row.matchupEdges[key].displayRank).filter((value): value is number => value != null);
      const raw = sortWeeklyResearchPresentation(presentation, { key, direction: "desc" }, "stat")
        .map((row) => row.matchupEdges[key].rawValue).filter((value): value is number => value != null);
      expectAscending(ranked);
      expectAscending([...raw].reverse());
    }
  });

  it("keeps missing values last in either direction and never mutates authority or heat metadata", () => {
    const missing = {
      ...presentation[0],
      seasonPpg: { ...presentation[0].seasonPpg, rawValue: null, displayRank: null },
    };
    const input = [missing, ...presentation.slice(1, 6)];
    const authorityBefore = input.map(({ row }) => [row.playerId, row.positionRank, row.projectedFantasyPoints] as const);
    const heatBefore = input.map((row) => [row.row.playerId, row.seasonPpg.tone] as const);
    const sourceRowsBefore = JSON.stringify(input.map(({ row }) => row));

    for (const direction of ["asc", "desc"] as const) {
      const sorted = sortWeeklyResearchPresentation(input, { key: "seasonPpg", direction }, "stat");
      expect(sorted.at(-1)?.row.playerId).toBe(missing.row.playerId);
    }

    expect(input.map(({ row }) => [row.playerId, row.positionRank, row.projectedFantasyPoints] as const)).toEqual(authorityBefore);
    expect(input.map((row) => [row.row.playerId, row.seasonPpg.tone] as const)).toEqual(heatBefore);
    expect(JSON.stringify(input.map(({ row }) => row))).toBe(sourceRowsBefore);
  });
});
