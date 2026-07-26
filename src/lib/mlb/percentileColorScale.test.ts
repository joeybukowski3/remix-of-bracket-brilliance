import { describe, expect, it } from "vitest";
import {
  PERCENTILE_TIERS,
  PERCENTILE_TIER_LEGEND,
  SAMPLE_MINIMUMS,
  computePercentileRanks,
  getPercentileTier,
  buildPercentileLookup,
  lookupPercentile,
  isSampleSufficientForStrongColor,
  resolvePercentileTierForDisplay,
} from "@/lib/mlb/percentileColorScale";

describe("getPercentileTier", () => {
  it("maps >=98 to Elite and 95–97.9 to Excellent", () => {
    expect(getPercentileTier(98, "higherBetter")?.id).toBe("elite");
    expect(getPercentileTier(100, "higherBetter")?.id).toBe("elite");
    expect(getPercentileTier(97.9, "higherBetter")?.id).toBe("excellent");
    expect(getPercentileTier(95, "higherBetter")?.id).toBe("excellent");
  });

  it("maps remaining higher-is-better bands", () => {
    expect(getPercentileTier(80, "higherBetter")?.id).toBe("great");
    expect(getPercentileTier(94.9, "higherBetter")?.id).toBe("great");
    expect(getPercentileTier(65, "higherBetter")?.id).toBe("aboveAverage");
    expect(getPercentileTier(50, "higherBetter")?.id).toBe("average");
    expect(getPercentileTier(30, "higherBetter")?.id).toBe("belowAverage");
    expect(getPercentileTier(15, "higherBetter")?.id).toBe("weak");
    expect(getPercentileTier(5, "higherBetter")?.id).toBe("poor");
  });

  it("inverts direction for lower-is-better metrics", () => {
    expect(getPercentileTier(1, "lowerBetter")?.id).toBe("elite");
    expect(getPercentileTier(95, "lowerBetter")?.id).toBe("poor");
    expect(getPercentileTier(50, "lowerBetter")?.id).toBe("average");
  });

  it("returns null for missing percentiles", () => {
    expect(getPercentileTier(null)).toBeNull();
    expect(getPercentileTier(undefined)).toBeNull();
    expect(getPercentileTier(Number.NaN)).toBeNull();
  });

  it("elite gold style is muted gold with dark brown text and a gold border", () => {
    const elite = getPercentileTier(99, "higherBetter");
    expect(elite?.id).toBe("elite");
    expect(elite?.style.backgroundColor.toLowerCase()).not.toMatch(/ff0|fbbf24|f59e0b|orange/i);
    expect(elite?.style.color).toBe("#5c3d0e");
    expect(elite?.style.border).toMatch(/solid/i);
  });

  it("legend uses the same tier definitions as cells", () => {
    expect(PERCENTILE_TIER_LEGEND.map((t) => t.label)).toEqual([
      "Elite",
      "Excellent",
      "Great",
      "Above Average",
      "Average",
      "Below Average",
      "Weak",
      "Poor",
    ]);
    expect(PERCENTILE_TIER_LEGEND.map((t) => t.id)).toEqual(PERCENTILE_TIERS.map((t) => t.id));
    expect(PERCENTILE_TIER_LEGEND.map((t) => t.minFavorablePercentile)).toEqual(
      PERCENTILE_TIERS.map((t) => t.minFavorablePercentile),
    );
  });
});

describe("computePercentileRanks — conservative ties", () => {
  it("ranks higher values higher; unique max is not always 100", () => {
    const ranks = computePercentileRanks([10, 20, 30, 40, 50]);
    expect(ranks[0]).toBe(0);
    // 4 of 5 strictly less → 80
    expect(ranks[4]).toBe(80);
    expect(ranks[2]).toBe(40);
  });

  it("large top-value ties do not all become Elite", () => {
    // 10 of 100 tied for best → countLess=90 → 90th percentile → Great, not Elite
    const values = [
      ...Array.from({ length: 90 }, (_, i) => i),
      ...Array.from({ length: 10 }, () => 999),
    ];
    const ranks = computePercentileRanks(values);
    const topRanks = ranks.slice(90);
    expect(topRanks.every((r) => r === 90)).toBe(true);
    expect(getPercentileTier(90, "higherBetter")?.id).toBe("great");
    expect(topRanks.every((r) => getPercentileTier(r, "higherBetter")?.id !== "elite")).toBe(true);
  });

  it("assigns identical percentiles (and tiers) to identical values", () => {
    const ranks = computePercentileRanks([1, 2, 2, 3]);
    expect(ranks[1]).toBe(ranks[2]);
    expect(getPercentileTier(ranks[1], "higherBetter")?.id).toBe(
      getPercentileTier(ranks[2], "higherBetter")?.id,
    );
  });

  it("returns null for null/non-finite and 50 for a lone finite value", () => {
    expect(computePercentileRanks([null, undefined, Number.NaN])).toEqual([null, null, null]);
    expect(computePercentileRanks([null, 42, null])).toEqual([null, 50, null]);
  });
});

describe("sample eligibility", () => {
  it("insufficient samples remain neutral (no strong tier)", () => {
    const tier = resolvePercentileTierForDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: 10,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(tier).toBeNull();
  });

  it("missing samples do not receive gold", () => {
    const tier = resolvePercentileTierForDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: null,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(tier).toBeNull();
    expect(isSampleSufficientForStrongColor(null, 20)).toBe(false);
    expect(isSampleSufficientForStrongColor(0, 20)).toBe(false);
  });

  it("qualifying sample with high percentile can be Elite", () => {
    const tier = resolvePercentileTierForDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: 40,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(tier?.id).toBe("elite");
  });

  it("model scores can bypass the sample gate", () => {
    const tier = resolvePercentileTierForDisplay({
      value: 88,
      percentile: 99,
      sampleSize: null,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
      bypassSampleGate: true,
    });
    expect(tier?.id).toBe("elite");
  });
});

describe("buildPercentileLookup", () => {
  it("looks up percentiles by value", () => {
    const lookup = buildPercentileLookup([1, 2, 3, 4, 5]);
    expect(lookupPercentile(1, lookup)).toBe(0);
    expect(lookupPercentile(5, lookup)).toBe(80);
    expect(lookupPercentile(null, lookup)).toBeNull();
  });
});
