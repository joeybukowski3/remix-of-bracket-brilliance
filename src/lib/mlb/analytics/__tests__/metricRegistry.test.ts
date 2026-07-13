import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  METRIC_REGISTRY,
  getMetricsForMarket,
  validateMetricRegistry,
  validateRangeCoverage,
} from "../metricRegistry";
import { parseReferenceRangeArtifact } from "../referenceRanges";
import type { MetricDefinition } from "../types";

function makeMetric(overrides: Partial<MetricDefinition> = {}): MetricDefinition {
  return {
    key: "test-metric",
    schemaVersion: 1,
    label: "Test Metric",
    shortLabel: "TM",
    description: "test",
    markets: ["hr"],
    group: "batter-power",
    unit: "pct",
    format: { decimals: 1 },
    provenance: "statcast",
    dailyRowField: "testMetric",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "test-metric",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    nullPolicy: "neutral",
    contributionTemplate: "{raw}",
    ...overrides,
  };
}

describe("metric registry", () => {
  it("ships a valid registry", () => {
    const result = validateMetricRegistry(METRIC_REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("declares metrics for both hr and k markets", () => {
    expect(getMetricsForMarket("hr").length).toBeGreaterThanOrEqual(9);
    expect(getMetricsForMarket("k").length).toBeGreaterThanOrEqual(3);
  });

  it("every fixed-range HR metric has a range in the checked-in bridge artifact", () => {
    const artifact = parseReferenceRangeArtifact(
      JSON.parse(
        readFileSync(
          resolve(process.cwd(), "public/data/mlb/model-reference-ranges/hr-bridge-v1.json"),
          "utf8",
        ),
      ),
    );
    const rangeKeys = new Set(artifact.ranges.map((r) => r.metricKey));
    const coverage = validateRangeCoverage(getMetricsForMarket("hr"), rangeKeys);
    expect(coverage.errors).toEqual([]);
  });

  it("rejects duplicate metric keys", () => {
    const result = validateMetricRegistry([makeMetric(), makeMetric()]);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("duplicate metric key");
  });

  it("rejects invalid direction values", () => {
    const metric = makeMetric();
    metric.normalization = { ...metric.normalization, direction: "sideways" as never };
    const result = validateMetricRegistry([metric]);
    expect(result.errors.join()).toContain("invalid direction");
  });

  it("rejects invalid market declarations", () => {
    const result = validateMetricRegistry([makeMetric({ markets: ["nba" as never] })]);
    expect(result.errors.join()).toContain("invalid market");
  });

  it("rejects fixed-range metrics without a range reference", () => {
    const metric = makeMetric();
    metric.normalization = { ...metric.normalization, rangeKey: undefined };
    const result = validateMetricRegistry([metric]);
    expect(result.errors.join()).toContain("requires a rangeKey");
  });

  it("rejects informational metrics marked weightable", () => {
    const result = validateMetricRegistry([
      makeMetric({ informationalOnly: true, weightable: true }),
    ]);
    expect(result.errors.join()).toContain("cannot be weightable");
  });

  it("rejects missing formatting metadata", () => {
    const result = validateMetricRegistry([
      makeMetric({ format: undefined as unknown as MetricDefinition["format"] }),
    ]);
    expect(result.errors.join()).toContain("formatting metadata");
  });

  it("rejects deprecation mapping without a valid replacement", () => {
    const mapped = makeMetric({
      key: "old-metric",
      deprecation: { deprecatedIn: "mlb-metrics@2", behavior: "map" },
    });
    const result = validateMetricRegistry([mapped]);
    expect(result.errors.join()).toContain("requires replacedBy");

    const dangling = makeMetric({
      key: "old-metric",
      deprecation: { deprecatedIn: "mlb-metrics@2", behavior: "map", replacedBy: "nope" },
    });
    expect(validateMetricRegistry([dangling]).errors.join()).toContain("unknown metric");
  });

  it("rejects non-kebab-case keys", () => {
    const result = validateMetricRegistry([makeMetric({ key: "camelCaseKey" })]);
    expect(result.valid).toBe(false);
  });

  it("reports missing range coverage", () => {
    const coverage = validateRangeCoverage([makeMetric()], new Set());
    expect(coverage.valid).toBe(false);
    expect(coverage.errors.join()).toContain("missing range");
  });
});
