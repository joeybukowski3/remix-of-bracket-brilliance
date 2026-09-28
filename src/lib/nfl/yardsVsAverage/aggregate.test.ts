import { describe, expect, it } from "vitest";
import { aggregateMetric, computeMetricSamples, deltaPercent, rankAscending } from "./aggregate";
import { YARDS_VS_AVERAGE_METRIC_KEYS, type YardsVsAverageGame, type YardsVsAverageMetricValues } from "./types";

function values(overrides: Partial<YardsVsAverageMetricValues>): YardsVsAverageMetricValues {
  return { ...Object.fromEntries(YARDS_VS_AVERAGE_METRIC_KEYS.map((key) => [key, 0])), ...overrides } as YardsVsAverageMetricValues;
}

function game(week: number, actual: Partial<YardsVsAverageMetricValues>, baseline: Partial<YardsVsAverageMetricValues>): YardsVsAverageGame {
  return {
    key: `2026-W0${week}-ccc-o${week}`, season: 2026, week, defense: "ccc", offense: `o${week}`,
    otherGames: 5, priorWeight: 0, currentWeight: 1, actual: values(actual), baseline: values(baseline),
  };
}

describe("aggregateMetric", () => {
  it("two opponents with different baselines both +20 aggregate to +20 (B)", () => {
    const sample = aggregateMetric([game(1, { rush: 130 }, { rush: 110 }), game(2, { rush: 100 }, { rush: 80 })], "rush");
    expect(sample.deltaYds).toBe(20);
    expect(sample.gamesSampled).toBe(2);
    expect(sample.gamesAbove).toBe(2);
    expect(sample.gamesBelow).toBe(0);
    // Ratio of sums: 40 / 190, not the mean of 18.2% and 25%.
    expect(sample.deltaPct).toBe(21.1);
  });

  it("counts above/below and treats an exactly-zero delta as neither", () => {
    const sample = aggregateMetric([
      game(1, { pass: 250 }, { pass: 200 }),
      game(2, { pass: 180 }, { pass: 200 }),
      game(3, { pass: 200 }, { pass: 200 }),
    ], "pass");
    expect([sample.gamesAbove, sample.gamesBelow, sample.gamesSampled]).toEqual([1, 1, 3]);
    expect(sample.deltaYds).toBe(10);
  });

  it("an empty sample has null values and zero counts", () => {
    expect(aggregateMetric([], "wrRec")).toEqual({ gamesSampled: 0, deltaYds: null, deltaPct: null, gamesAbove: 0, gamesBelow: 0 });
  });

  it("always suppresses QB RUSH %", () => {
    expect(aggregateMetric([game(1, { qbRush: 60 }, { qbRush: 30 })], "qbRush").deltaPct).toBeNull();
  });

  it("refuses to sample a game without a baseline", () => {
    expect(() => aggregateMetric([{ ...game(1, {}, {}), baseline: null }], "rush")).toThrow(/no baseline/);
  });
});

describe("deltaPercent denominator safety (I)", () => {
  it("returns null for zero, negative, tiny and exactly-below-floor baselines", () => {
    expect(deltaPercent("teRec", 5, 0, 1)).toBeNull();
    expect(deltaPercent("rbRec", 5, -4, 1)).toBeNull();
    expect(deltaPercent("rbRec", 5, 2, 1)).toBeNull();
    expect(deltaPercent("rbRec", 5, 19.8, 2)).toBeNull(); // 9.9 per game < 10
    expect(deltaPercent("rbRec", 5, 0, 0)).toBeNull();
  });

  it("returns a finite one-decimal percentage at or above the floor", () => {
    expect(deltaPercent("rbRec", 5, 20, 2)).toBe(25);
    expect(deltaPercent("pass", -30, 220, 1)).toBe(-13.6);
  });
});

describe("ranking (L)", () => {
  it("ranks the most negative delta first and breaks ties by fewer games above, then team", () => {
    const ranks = rankAscending([
      { team: "zzz", value: -5, gamesAbove: 1 },
      { team: "aaa", value: -5, gamesAbove: 1 },
      { team: "mmm", value: -5, gamesAbove: 0 },
      { team: "bad", value: 12, gamesAbove: 3 },
      { team: "best", value: -20, gamesAbove: 0 },
      { team: "none", value: null, gamesAbove: 0 },
    ]);
    expect([...ranks.entries()]).toEqual([["best", 1], ["mmm", 2], ["aaa", 3], ["zzz", 4], ["bad", 5]]);
  });

  it("computeMetricSamples ranks yards and % independently and leaves suppressed % unranked", () => {
    const byTeam = new Map([
      ["aaa", [game(1, { rush: 130, qbRush: 40 }, { rush: 110, qbRush: 20 })]],
      ["bbb", [game(1, { rush: 60, qbRush: 0 }, { rush: 80, qbRush: 20 })]],
      ["ccc", []],
    ]);
    const rush = computeMetricSamples(byTeam, ["aaa", "bbb", "ccc"], "rush");
    expect(rush.get("bbb")!.rankYds).toBe(1);
    expect(rush.get("aaa")!.rankYds).toBe(2);
    expect(rush.get("bbb")!.rankPct).toBe(1);
    expect(rush.get("ccc")!.rankYds).toBeNull();
    const qbRush = computeMetricSamples(byTeam, ["aaa", "bbb", "ccc"], "qbRush");
    expect(qbRush.get("aaa")!.rankPct).toBeNull();
    expect(qbRush.get("aaa")!.rankYds).toBe(2);
  });
});
