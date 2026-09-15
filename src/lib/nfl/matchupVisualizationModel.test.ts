import { describe, expect, it } from "vitest";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import {
  chartEligibleMetrics,
  findVisualMetric,
  toVisualMetric,
  toVisualMetrics,
} from "@/lib/nfl/matchupVisualizationModel";

function row(overrides: Partial<MatchupDisplayMetric> = {}): MatchupDisplayMetric {
  return {
    key: "off.epaPerPlay",
    label: "EPA / Play",
    direction: "higher-is-better",
    away: { value: 0.12, rank: 3, formatted: "+0.120" },
    home: { value: -0.02, rank: 22, formatted: "-0.020" },
    comparison: "away",
    ...overrides,
  };
}

describe("toVisualMetric", () => {
  it("maps rank 1 to the best percentile (0) and rank 32 to the worst (1)", () => {
    const best = toVisualMetric(row({ away: { value: 1, rank: 1, formatted: "1" } }), "overall");
    const worst = toVisualMetric(row({ home: { value: 0, rank: 32, formatted: "0" } }), "overall");
    expect(best.away.percentile).toBe(0);
    expect(worst.home.percentile).toBe(1);
  });

  it("keeps a missing rank as null percentile rather than defaulting to an end of scale", () => {
    const metric = toVisualMetric(
      row({ away: { value: null, rank: null, formatted: "N/A" } }),
      "overall"
    );
    expect(metric.away.percentile).toBeNull();
    expect(metric.away.rank).toBeNull();
    expect(metric.away.formatted).toBe("N/A");
  });

  it("excludes rankGap from advantage-gap math when either rank is missing", () => {
    const metric = toVisualMetric(
      row({ home: { value: null, rank: null, formatted: "N/A" } }),
      "overall"
    );
    expect(metric.rankGap).toBeNull();
  });

  it("computes rankGap when both ranks are present", () => {
    const metric = toVisualMetric(row(), "overall");
    expect(metric.rankGap).toBe(19);
  });

  it("maps comparison to leader without recomputing the winner", () => {
    expect(toVisualMetric(row({ comparison: "away" }), "overall").leader).toBe("away");
    expect(toVisualMetric(row({ comparison: "home" }), "overall").leader).toBe("home");
    expect(toVisualMetric(row({ comparison: "tie" }), "overall").leader).toBe("tie");
    expect(toVisualMetric(row({ comparison: "missing" }), "overall").leader).toBe("none");
    expect(toVisualMetric(row({ comparison: "not-comparable" }), "overall").leader).toBe("none");
  });

  it("marks context-only and none-direction metrics chart-ineligible", () => {
    expect(toVisualMetric(row({ direction: "context-only" }), "overall").isChartEligible).toBe(false);
    expect(toVisualMetric(row({ direction: "none" }), "overall").isChartEligible).toBe(false);
    expect(toVisualMetric(row({ direction: "higher-is-better" }), "overall").isChartEligible).toBe(true);
    expect(toVisualMetric(row({ direction: "lower-is-better" }), "overall").isChartEligible).toBe(true);
  });

  it("falls back shortLabel to label when absent", () => {
    const metric = toVisualMetric(row({ shortLabel: undefined }), "overall");
    expect(metric.shortLabel).toBe("EPA / Play");
  });

  it("carries the shortLabel through when present", () => {
    const metric = toVisualMetric(row({ shortLabel: "EPA/Ply" }), "overall");
    expect(metric.shortLabel).toBe("EPA/Ply");
  });
});

describe("chartEligibleMetrics", () => {
  it("filters out context-only rows while preserving order", () => {
    const metrics = toVisualMetrics(
      [
        row({ key: "a", direction: "higher-is-better" }),
        row({ key: "b", direction: "context-only" }),
        row({ key: "c", direction: "lower-is-better" }),
      ],
      "overall"
    );
    expect(chartEligibleMetrics(metrics).map((m) => m.id)).toEqual(["a", "c"]);
  });
});

describe("findVisualMetric", () => {
  it("finds by id and returns undefined rather than throwing when absent", () => {
    const metrics = toVisualMetrics([row({ key: "off.epaPerPlay" })], "overall");
    expect(findVisualMetric(metrics, "off.epaPerPlay")?.id).toBe("off.epaPerPlay");
    expect(findVisualMetric(metrics, "missing.key")).toBeUndefined();
  });
});
