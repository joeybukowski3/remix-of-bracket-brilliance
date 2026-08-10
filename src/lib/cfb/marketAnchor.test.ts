import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import production from "../../../data/generated/cfb/2026-preseason-ratings-v1.1.json";
import statisticalBase from "../../../data/generated/cfb/2026-preseason-ratings-v1.json";
import { CFB_PRESEASON_MARKET_BASELINE_2026 } from "@/data/cfb/season2026/preseasonMarketBaseline";
import { CFB_FBS_TEAM_COUNT, CFB_TEAM_METADATA } from "@/data/cfb/teamMetadata";
import {
  CFB_MARKET_ANCHOR_VERSION,
  buildCfbMarketAnchorRatings,
  getCfbMarketFadeWeights,
  standardizeLeagueValues,
} from "./marketAnchor";

const inputs = [
  { teamId: "a", marketRating: 10, statisticalOffense: 0.5, statisticalDefense: 1, displayedOffense: 80, displayedDefense: 70, apRank: 1 },
  { teamId: "b", marketRating: 20, statisticalOffense: -1, statisticalDefense: 0, displayedOffense: 60, displayedDefense: 65, apRank: null },
  { teamId: "c", marketRating: 30, statisticalOffense: 1.5, statisticalDefense: 0.5, displayedOffense: 90, displayedDefense: 75, apRank: 25 },
];

describe("CFB preseason market anchor", () => {
  it("maps every FBS team exactly once", () => {
    const ids = CFB_PRESEASON_MARKET_BASELINE_2026.map((row) => row.teamId);
    expect(ids).toHaveLength(CFB_FBS_TEAM_COUNT);
    expect(new Set(ids).size).toBe(CFB_FBS_TEAM_COUNT);
    expect(new Set(ids)).toEqual(new Set(CFB_TEAM_METADATA.map((team) => team.id)));
  });

  it("standardizes inputs without changing their ordering", () => {
    const standardized = standardizeLeagueValues([4, 9, 2, 7]);
    expect(standardized.reduce((sum, value) => sum + value, 0) / standardized.length).toBeCloseTo(0, 12);
    expect(Math.sqrt(standardized.reduce((sum, value) => sum + value ** 2, 0) / standardized.length)).toBeCloseTo(1, 12);
    expect([...standardized].sort((a, b) => a - b).map((value) => standardized.indexOf(value))).toEqual([2, 0, 3, 1]);
  });

  it("uses exact preseason 75/25 standardized blending", () => {
    const ratings = buildCfbMarketAnchorRatings(inputs);
    const marketMean = ratings.reduce((sum, row) => sum + row.standardizedMarketBaseline, 0) / ratings.length;
    const statisticalMean = ratings.reduce((sum, row) => sum + row.standardizedJkbStatisticalPower, 0) / ratings.length;
    expect(marketMean).toBeCloseTo(0, 12);
    expect(statisticalMean).toBeCloseTo(0, 12);
    for (const row of ratings) {
      expect(row.rawJkbPower).toBeCloseTo(
        0.75 * row.standardizedMarketBaseline + 0.25 * row.standardizedJkbStatisticalPower,
        12,
      );
    }
  });

  it("keeps AP and displayed offense/defense out of JKB Power", () => {
    const first = buildCfbMarketAnchorRatings(inputs);
    const changedReferences = inputs.map((row) => ({
      ...row,
      apRank: row.apRank === null ? 1 : null,
      displayedOffense: row.displayedOffense + 500,
      displayedDefense: row.displayedDefense - 500,
    }));
    const second = buildCfbMarketAnchorRatings(changedReferences);
    expect(second.map((row) => row.rawJkbPower)).toEqual(first.map((row) => row.rawJkbPower));
    const displays = new Map(first.map((row) => [row.teamId, [row.displayedOffense, row.displayedDefense]]));
    expect(displays).toEqual(new Map([
      ["a", [80, 70]], ["b", [60, 65]], ["c", [90, 75]],
    ]));
  });

  it("generates deterministic complete ranks and an automatic Top 25", () => {
    type ProductionRow = { teamId: string; performanceOffense: number; performanceDefense: number; jkbOffense: number; jkbDefense: number };
    const current = new Map((statisticalBase.rows as ProductionRow[]).map((row) => [row.teamId, row]));
    const baseline = new Map(CFB_PRESEASON_MARKET_BASELINE_2026.map((row) => [row.teamId, row.sourcePowerRating]));
    const fullInputs = CFB_TEAM_METADATA.map((team) => {
      const row = current.get(team.id) as ProductionRow;
      return { teamId: team.id, marketRating: baseline.get(team.id) as number, statisticalOffense: row.performanceOffense, statisticalDefense: row.performanceDefense, displayedOffense: row.jkbOffense, displayedDefense: row.jkbDefense, apRank: null };
    });
    const first = buildCfbMarketAnchorRatings(fullInputs);
    const second = buildCfbMarketAnchorRatings(fullInputs);
    expect(first).toEqual(second);
    expect(first).toHaveLength(138);
    expect(new Set(first.map((row) => row.finalJkbRank))).toEqual(new Set(Array.from({ length: 138 }, (_, index) => index + 1)));
    expect(first.filter((row) => row.finalJkbRank <= 25)).toHaveLength(25);
    for (const row of first) {
      const source = current.get(row.teamId) as ProductionRow;
      expect(row.displayedOffense).toBe(source.jkbOffense);
      expect(row.displayedDefense).toBe(source.jkbDefense);
    }
  });

  it("contains no team-specific model exceptions", () => {
    const modelSource = readFileSync(resolve("src/lib/cfb/marketAnchor.ts"), "utf8");
    for (const team of CFB_TEAM_METADATA) {
      expect(modelSource).not.toContain(`"${team.id}"`);
    }
  });

  it.each([
    [0, 0.75, 0.25], [1, 0.65, 0.35], [2, 0.65, 0.35],
    [3, 0.5, 0.5], [4, 0.5, 0.5], [5, 0.35, 0.65],
    [6, 0.35, 0.65], [7, 0.2, 0.8], [8, 0.2, 0.8], [9, 0.1, 0.9], [15, 0.1, 0.9],
  ])("returns the configured fade weights after %i games", (games, marketWeight, jkbWeight) => {
    expect(getCfbMarketFadeWeights(games)).toMatchObject({ marketWeight, jkbWeight });
  });

  it("activates the approved market-anchor production artifact", () => {
    const loader = readFileSync(resolve("src/data/cfb/season2026/ratings.ts"), "utf8");
    expect(production.modelVersion).toBe(CFB_MARKET_ANCHOR_VERSION);
    expect(loader).toContain("2026-preseason-ratings-v1.1.json");
    expect(loader).not.toContain('2026-preseason-ratings-v1.json"');
  });
});
