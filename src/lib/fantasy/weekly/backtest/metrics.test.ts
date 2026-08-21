import { describe, expect, it } from "vitest";
import { evaluateRankingMetrics, kendallRankCorrelation, spearmanRankCorrelation } from "./metrics";

describe("ranking backtest metrics", () => {
  it("reports perfect and reversed rank correlations", () => {
    expect(spearmanRankCorrelation([3, 2, 1], [30, 20, 10])).toBeCloseTo(1);
    expect(kendallRankCorrelation([3, 2, 1], [10, 20, 30])).toBeCloseTo(-1);
  });

  it("evaluates thresholds within each position-week rather than globally", () => {
    const rows = [1, 2].flatMap((week) => [
      { season: 2024, week, position: "QB" as const, playerId: `a${week}`, actualFantasyPoints: 20, score: 2 },
      { season: 2024, week, position: "QB" as const, playerId: `b${week}`, actualFantasyPoints: 10, score: 1 },
    ]);
    expect(evaluateRankingMetrics(rows, 1)).toMatchObject({
      weeks: 2, spearman: 1, kendall: 1, topKHitRate: 1,
      thresholdPrecision: 1, thresholdRecall: 1, thresholdAccuracy: 1,
    });
  });

  it("reports score coverage without imputing missing predictions", () => {
    const metrics = evaluateRankingMetrics([
      { season: 2024, week: 1, position: "TE", playerId: "a", actualFantasyPoints: 10, score: 1 },
      { season: 2024, week: 1, position: "TE", playerId: "b", actualFantasyPoints: 5, score: null },
    ]);
    expect(metrics).toMatchObject({ rows: 2, scoredRows: 1, coverage: 0.5, thresholdRecall: 0.5 });
  });
});
