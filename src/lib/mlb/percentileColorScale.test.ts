import { describe, expect, it } from "vitest";
import {
  PERCENTILE_TIERS,
  PERCENTILE_TIER_LEGEND,
  SAMPLE_MINIMUMS,
  SAMPLE_UNAVAILABLE_MAX_TIER_ID,
  SMALL_SAMPLE_STYLE,
  computePercentileRanks,
  getPercentileTier,
  buildPercentileLookup,
  lookupPercentile,
  isSampleSufficientForStrongColor,
  resolveSampleSize,
  classifySampleConfidence,
  capTierForSampleUnavailable,
  muteTierStyle,
  resolvePercentileDisplay,
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
  });
});

describe("unfavorable half is red (KS-010), not the retired blue counter-scale", () => {
  const channels = (color: string): [number, number, number] => {
    const hex = color.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const parts = color.match(/[\d.]+/g)!.map(Number);
    return [parts[0], parts[1], parts[2]];
  };

  it.each(["belowAverage", "weak", "poor"] as const)("%s fill has red > blue", (id) => {
    const [r, , b] = channels(PERCENTILE_TIERS.find((t) => t.id === id)!.style.backgroundColor);
    expect(r).toBeGreaterThan(b);
  });

  it("drops the old blue fills entirely", () => {
    const bgs = PERCENTILE_TIERS.map((t) => t.style.backgroundColor);
    expect(bgs).not.toContain("#1d4ed8");
    expect(bgs).not.toContain("rgba(37, 99, 235, 0.42)");
    expect(bgs).not.toContain("rgba(96, 165, 250, 0.22)");
  });

  it("keeps the favorable half green/gold and the mid band slate", () => {
    const bg = (id: string) => PERCENTILE_TIERS.find((t) => t.id === id)!.style.backgroundColor;
    expect(bg("elite")).toBe("#e8d5a8");
    expect(bg("great")).toBe("#10b981");
    expect(bg("average")).toMatch(/148, 163, 184/); // slate
  });
});

describe("resolveSampleSize priority", () => {
  it("prefers metric sample, then BBE, then AB, then PA", () => {
    expect(
      resolveSampleSize({
        metricSample: 40,
        battedBallEvents: 30,
        atBats: 20,
        plateAppearances: 10,
      }),
    ).toBe(40);
    expect(
      resolveSampleSize({
        metricSample: null,
        battedBallEvents: 30,
        atBats: 20,
        plateAppearances: 10,
      }),
    ).toBe(30);
    expect(
      resolveSampleSize({
        metricSample: null,
        battedBallEvents: null,
        atBats: 20,
        plateAppearances: 10,
      }),
    ).toBe(20);
    expect(
      resolveSampleSize({
        metricSample: null,
        battedBallEvents: null,
        atBats: null,
        plateAppearances: 10,
      }),
    ).toBe(10);
  });

  it("returns null when no sample field exists (does not fabricate)", () => {
    expect(resolveSampleSize({})).toBeNull();
    expect(resolveSampleSize({ atBats: null, plateAppearances: undefined })).toBeNull();
  });

  it("treats zero as a known sample size, not missing", () => {
    expect(resolveSampleSize({ atBats: 0 })).toBe(0);
    expect(classifySampleConfidence(0, 20)).toBe("small-sample");
  });
});

describe("resolvePercentileDisplay sample confidence", () => {
  it("qualified sample allows full Elite gold", () => {
    const result = resolvePercentileDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: 40,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(result.confidence).toBe("qualified");
    expect(result.tier?.id).toBe("elite");
    expect(result.style?.backgroundColor).toBe("#e8d5a8");
  });

  it("known small sample uses subtle neutral and never Elite paint", () => {
    const result = resolvePercentileDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: 10,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(result.confidence).toBe("small-sample");
    expect(result.style).toEqual(SMALL_SAMPLE_STYLE);
    expect(result.style?.backgroundColor).not.toBe("#e8d5a8");
  });

  it("sample unavailable applies muted tier, caps at Great, never Elite gold", () => {
    const high = resolvePercentileDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: null,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(high.confidence).toBe("sample-unavailable");
    expect(high.tier?.id).toBe(SAMPLE_UNAVAILABLE_MAX_TIER_ID);
    expect(high.tier?.id).toBe("great");
    expect(high.style?.backgroundColor).not.toBe("#e8d5a8");
    expect(high.style?.backgroundColor).not.toBe("#10b981"); // muted, not full great

    const mid = resolvePercentileDisplay({
      value: 0.25,
      percentile: 50,
      sampleSize: null,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(mid.confidence).toBe("sample-unavailable");
    expect(mid.tier?.id).toBe("average");
    expect(mid.style).toBeTruthy();

    const low = resolvePercentileDisplay({
      value: 0.15,
      percentile: 5,
      sampleSize: null,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
    });
    expect(low.confidence).toBe("sample-unavailable");
    expect(low.tier?.id).toBe("poor");
    // Differentiation preserved (not all identical)
    expect(high.style?.backgroundColor).not.toBe(mid.style?.backgroundColor);
    expect(mid.style?.backgroundColor).not.toBe(low.style?.backgroundColor);
  });

  it("missing metric or percentile yields no color", () => {
    expect(resolvePercentileDisplay({ value: null, percentile: 99 }).style).toBeNull();
    expect(resolvePercentileDisplay({ value: 0.3, percentile: null }).style).toBeNull();
  });

  it("capTierForSampleUnavailable blocks elite and excellent", () => {
    const elite = getPercentileTier(99)!;
    const excellent = getPercentileTier(96)!;
    const great = getPercentileTier(85)!;
    expect(capTierForSampleUnavailable(elite).id).toBe("great");
    expect(capTierForSampleUnavailable(excellent).id).toBe("great");
    expect(capTierForSampleUnavailable(great).id).toBe("great");
  });

  it("muteTierStyle reduces intensity vs full tier style", () => {
    const full = getPercentileTier(85)!;
    const muted = muteTierStyle(full.style);
    expect(muted.backgroundColor).not.toBe(full.style.backgroundColor);
    expect(muted.backgroundColor).toMatch(/rgba/i);
  });

  it("bypassSampleGate keeps full qualified styling", () => {
    const result = resolvePercentileDisplay({
      value: 88,
      percentile: 99,
      sampleSize: null,
      sampleMinimum: 20,
      bypassSampleGate: true,
    });
    expect(result.confidence).toBe("qualified");
    expect(result.tier?.id).toBe("elite");
  });
});

describe("computePercentileRanks — conservative ties", () => {
  it("large top-value ties do not all become Elite", () => {
    const values = [
      ...Array.from({ length: 90 }, (_, i) => i),
      ...Array.from({ length: 10 }, () => 999),
    ];
    const ranks = computePercentileRanks(values);
    const topRanks = ranks.slice(90);
    expect(topRanks.every((r) => r === 90)).toBe(true);
    expect(getPercentileTier(90, "higherBetter")?.id).toBe("great");
  });

  it("assigns identical percentiles to identical values", () => {
    const ranks = computePercentileRanks([1, 2, 2, 3]);
    expect(ranks[1]).toBe(ranks[2]);
  });
});

describe("helpers", () => {
  it("isSampleSufficientForStrongColor never treats null as zero", () => {
    expect(isSampleSufficientForStrongColor(null, 20)).toBe(false);
    expect(isSampleSufficientForStrongColor(0, 20)).toBe(false);
    expect(isSampleSufficientForStrongColor(20, 20)).toBe(true);
  });

  it("buildPercentileLookup works", () => {
    const lookup = buildPercentileLookup([1, 2, 3, 4, 5]);
    expect(lookupPercentile(1, lookup)).toBe(0);
    expect(lookupPercentile(5, lookup)).toBe(80);
  });
});
