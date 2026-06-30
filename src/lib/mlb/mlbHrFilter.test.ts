import { describe, expect, it } from "vitest";
import { classifyWind, evaluateSinCityHitter, getSinCityResults, SIN_CITY_THRESHOLDS } from "./mlbHrFilter";

const PERFECT = {
  barrelRate: 14,
  pullRate: 22,
  hardHitRate: 48,
  exitVelo: 94,
  stadium: "Wrigley Field",
  roofType: "Open",
  windDirection: "NE",
  windSpeed: 12,
};

describe("Pull% label correctness (Part 1 audit fix)", () => {
  it("1. criterion name is the accurate 'Pull%' label, not 'Pull Air%'", () => {
    const result = evaluateSinCityHitter(PERFECT);
    const pullCriterion = result.criteria.find((c) => c.name === "Pull%");
    expect(pullCriterion).toBeDefined();
    expect(result.criteria.some((c) => (c.name as string) === "Pull Air%")).toBe(false);
  });

  it("2. no 'Pull Air%' label remains anywhere in SinCityCriterionResult output", () => {
    const result = evaluateSinCityHitter({ ...PERFECT, windDirection: "SW" });
    for (const c of result.criteria) {
      expect(c.name).not.toBe("Pull Air%");
    }
  });

  it("3. Sin City qualification (threshold value, matchCount, qualifies) is unchanged after the rename", () => {
    // Same numeric inputs as before the field/label rename must produce the same result.
    const result = evaluateSinCityHitter(PERFECT);
    expect(SIN_CITY_THRESHOLDS.pullRate).toBe(20); // threshold value itself never changed
    expect(result.matchCount).toBe(5);
    expect(result.qualifies).toBe(true);
  });
});
describe("Sin City five-metric model", () => {
  it("classifies a qualifying wind-out condition", () => {
    expect(classifyWind("Wrigley Field", "Open", "NE", 12)).toBe("out");
  });

  it("passes all five criteria", () => {
    const result = evaluateSinCityHitter(PERFECT);
    expect(result.matchCount).toBe(5);
    expect(result.qualifies).toBe(true);
    expect(result.criteria).toHaveLength(5);
    expect(result.criteria.every((criterion) => criterion.pass)).toBe(true);
  });

  it("passes exactly four of five when wind is not favorable", () => {
    const result = evaluateSinCityHitter({ ...PERFECT, windDirection: "SW" });
    expect(result.matchCount).toBe(4);
    expect(result.criteria.find((criterion) => criterion.name === "Wind Out")?.pass).toBe(false);
  });

  it("passes exactly three of five", () => {
    const result = evaluateSinCityHitter({ ...PERFECT, exitVelo: 88, windDirection: "SW" });
    expect(result.matchCount).toBe(3);
    expect(result.qualifies).toBe(true);
  });

  it("does not count wind below 8 mph", () => {
    const result = evaluateSinCityHitter({ ...PERFECT, windSpeed: 7.9 });
    const wind = result.criteria.find((criterion) => criterion.name === "Wind Out");
    expect(wind?.pass).toBe(false);
    expect(wind?.threshold).toBe(SIN_CITY_THRESHOLDS.windSpeed);
  });

  it("does not count unknown or closed-roof wind", () => {
    const result = evaluateSinCityHitter({ ...PERFECT, stadium: "Rogers Centre", roofType: "Retractable" });
    const wind = result.criteria.find((criterion) => criterion.name === "Wind Out");
    expect(wind?.pass).toBe(false);
    expect(wind?.windSignal).toBe("unknown");
  });

  it("ranks 5/5 above 4/5 and 3/5", () => {
    const base = { player: "Five", hrScore: 60, barrelRate: 14, pullRate: 22, hardHitRate: 48, exitVelo: 94, stadium: "Wrigley Field", roofType: "Open", windDirection: "NE", windSpeed: 12 };
    const rows = getSinCityResults([
      { ...base, player: "Three", exitVelo: 88, windDirection: "SW", hrScore: 90 },
      { ...base, player: "Four", windDirection: "SW", hrScore: 80 },
      base,
    ]).rows;
    expect(rows.map((row) => row.evaluation.matchCount)).toEqual([5, 4, 3]);
  });

  it("uses closest-five fallback when no player reaches three", () => {
    const batters = Array.from({ length: 6 }, (_, index) => ({
      player: `P${index}`,
      hrScore: 80 - index,
      barrelRate: 5,
      pullRate: 10,
      hardHitRate: 30,
      exitVelo: 80,
      stadium: "Wrigley Field",
      roofType: "Open",
      windDirection: index === 0 ? "NE" : "SW",
      windSpeed: 12,
    }));
    const result = getSinCityResults(batters);
    expect(result.isFallback).toBe(true);
    expect(result.rows).toHaveLength(5);
  });

  it("returns an empty safe fallback for no data", () => {
    const result = getSinCityResults([]);
    expect(result.isFallback).toBe(true);
    expect(result.rows).toEqual([]);
  });
});
