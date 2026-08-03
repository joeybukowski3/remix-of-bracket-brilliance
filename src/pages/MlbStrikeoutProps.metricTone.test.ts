import { describe, expect, it } from "vitest";
import { buildPercentileLookup } from "@/lib/mlb/percentileColorScale";
import { resolveComparativeMetricTone } from "@/pages/MlbStrikeoutProps";

describe("MLB strikeout comparative metric tones", () => {
  const lookup = buildPercentileLookup([0.5, 0.8, 1.1]);

  it("treats stronger higher-is-better pitcher values as positive", () => {
    expect(resolveComparativeMetricTone(1.1, lookup)).toBe("positive");
    expect(resolveComparativeMetricTone(0.5, lookup)).toBe("negative");
  });

  it("reverses xBA so lower values are positive and higher values are negative", () => {
    expect(resolveComparativeMetricTone(0.5, lookup, "lowerBetter")).toBe("positive");
    expect(resolveComparativeMetricTone(1.1, lookup, "lowerBetter")).toBe("negative");
  });

  it("leaves unavailable values neutral", () => {
    expect(resolveComparativeMetricTone(null, lookup)).toBe("neutral");
    expect(resolveComparativeMetricTone(undefined, lookup, "lowerBetter")).toBe("neutral");
  });
});
