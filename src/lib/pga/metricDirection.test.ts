import { describe, expect, it } from "vitest";
import {
  PGA_METRIC_DIRECTION,
  assertMetricDirectionsDeclared,
  hasMetricDirection,
  isLowerBetterMetric,
  normalizeMetricKey,
  resolveMetricKey,
} from "@/lib/pga/metricDirection";

/**
 * Frozen expectations for every metric a PGA ranker weights.
 *
 * bogeyAvoidance is the reason this module exists: the stored value is a bogey
 * RATE (observed 0.107-0.233 in player-stats-raw.json), so a LOWER value is a
 * better player despite the metric's name reading like a score.
 */
const EXPECTED_DIRECTION = [
  { metric: "sgTotal", direction: "higher", lowerIsBetter: false },
  { metric: "sgOTT", direction: "higher", lowerIsBetter: false },
  { metric: "sgApp", direction: "higher", lowerIsBetter: false },
  { metric: "sgAtG", direction: "higher", lowerIsBetter: false },
  { metric: "sgPutt", direction: "higher", lowerIsBetter: false },
  { metric: "drivingAccuracy", direction: "higher", lowerIsBetter: false },
  { metric: "drivingDistance", direction: "higher", lowerIsBetter: false },
  { metric: "birdieBogeyRatio", direction: "higher", lowerIsBetter: false },
  { metric: "bogeyAvoidance", direction: "lower", lowerIsBetter: true },
  { metric: "trendRank", direction: "lower", lowerIsBetter: true },
] as const;

describe("PGA metric direction map", () => {
  it.each(EXPECTED_DIRECTION)(
    "declares $metric as $direction-is-better",
    ({ metric, direction, lowerIsBetter }) => {
      expect(PGA_METRIC_DIRECTION[metric]).toBe(direction);
      expect(isLowerBetterMetric(metric)).toBe(lowerIsBetter);
    },
  );

  it("declares bogeyAvoidance lower-is-better because the value is a bogey rate", () => {
    expect(PGA_METRIC_DIRECTION.bogeyAvoidance).toBe("lower");
    expect(isLowerBetterMetric("bogeyAvoidance")).toBe(true);
  });

  it("covers every metric the rankers weight and adds none beyond them", () => {
    expect(Object.keys(PGA_METRIC_DIRECTION).sort()).toEqual(
      EXPECTED_DIRECTION.map((entry) => entry.metric).slice().sort(),
    );
  });

  it("exposes only 'higher' or 'lower' as directions", () => {
    for (const direction of Object.values(PGA_METRIC_DIRECTION)) {
      expect(["higher", "lower"]).toContain(direction);
    }
  });
});

describe("metric key normalization", () => {
  it.each([
    ["bogeyAvoidance", "bogeyAvoidance"],
    ["bogeyavoidance", "bogeyAvoidance"],
    ["Bogey Avoidance", "bogeyAvoidance"],
    ["BOG", "bogeyAvoidance"],
    ["trendRank", "trendRank"],
    ["trendrank", "trendRank"],
    ["sgTotal", "sgTotal"],
    ["SGT", "sgTotal"],
  ])("resolves %s to the canonical key %s", (input, canonical) => {
    expect(resolveMetricKey(input)).toBe(canonical);
  });

  it("preserves the historical aliases PgaHubShared matched on", () => {
    // These four spellings made up the old LOWER_IS_BETTER_STATS set verbatim.
    for (const alias of ["trendrank", "bogeyavoidance", "bog", "bogey avoidance"]) {
      expect(isLowerBetterMetric(alias)).toBe(true);
    }
  });

  it("strips case and punctuation consistently", () => {
    expect(normalizeMetricKey("Bogey-Avoidance")).toBe("bogeyavoidance");
    expect(normalizeMetricKey(null)).toBe("");
  });

  it("returns null and false for an undeclared metric rather than guessing", () => {
    expect(resolveMetricKey("scramblingPercentage")).toBeNull();
    expect(hasMetricDirection("scramblingPercentage")).toBe(false);
    expect(isLowerBetterMetric("scramblingPercentage")).toBe(false);
  });
});

describe("assertMetricDirectionsDeclared", () => {
  it("accepts a fully declared metric list", () => {
    expect(() =>
      assertMetricDirectionsDeclared(EXPECTED_DIRECTION.map((entry) => entry.metric)),
    ).not.toThrow();
  });

  it("throws loudly, naming the undeclared metric", () => {
    expect(() => assertMetricDirectionsDeclared(["sgTotal", "scramblingPercentage"])).toThrow(
      /scramblingPercentage/,
    );
  });

  it("names every undeclared metric at once", () => {
    expect(() => assertMetricDirectionsDeclared(["puttsPerRound", "scrambling"])).toThrow(
      /puttsPerRound, scrambling/,
    );
  });

  it("includes the caller context so the failure points at the right ranker", () => {
    expect(() => assertMetricDirectionsDeclared(["mystery"], "power rankings")).toThrow(
      /power rankings/,
    );
  });

  it("tolerates empty and nullish inputs", () => {
    expect(() => assertMetricDirectionsDeclared([])).not.toThrow();
    expect(() => assertMetricDirectionsDeclared(null)).not.toThrow();
  });
});
