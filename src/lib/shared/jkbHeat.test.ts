import { describe, expect, it } from "vitest";
import {
  JKB_HEAT_LEGEND,
  PERCENTILE_TIERS,
  TIER_TO_WEEKLY_HEAT_TONE,
  computeTeamPercentiles,
  getPercentileTier,
  resolvePercentileDisplay,
  tierToWeeklyHeatTone,
  weeklyHeatToneToTierId,
  weeklyRankHeatTone,
} from "@/lib/shared/jkbHeat";
import { PERCENTILE_TIER_LEGEND } from "@/lib/mlb/percentileColorScale";
import {
  weeklyHeatClass as sourceWeeklyHeatClass,
  weeklyHeatStyle as sourceWeeklyHeatStyle,
} from "@/lib/fantasy/weekly/researchPresentation";
import { weeklyHeatClass, weeklyHeatStyle } from "@/lib/shared/jkbHeat";

describe("JKB Heat — exact band boundaries (favorable percentile)", () => {
  it.each([
    [98, "elite"],
    [95, "excellent"],
    [80, "great"],
    [60, "aboveAverage"],
    [40, "average"],
    [25, "belowAverage"],
    [10, "weak"],
    [9.9, "poor"],
    [0, "poor"],
  ])("percentile %s -> %s (higherBetter)", (percentile, tierId) => {
    expect(getPercentileTier(percentile, "higherBetter")?.id).toBe(tierId);
  });

  it("just-below boundaries fall to the lower band", () => {
    expect(getPercentileTier(97.9, "higherBetter")?.id).toBe("excellent");
    expect(getPercentileTier(94.9, "higherBetter")?.id).toBe("great");
    expect(getPercentileTier(59.9, "higherBetter")?.id).toBe("average");
    expect(getPercentileTier(24.9, "higherBetter")?.id).toBe("weak");
  });
});

describe("JKB Heat — direction", () => {
  it("higherBetter uses the percentile directly", () => {
    expect(getPercentileTier(99, "higherBetter")?.id).toBe("elite");
    expect(getPercentileTier(2, "higherBetter")?.id).toBe("poor");
  });

  it("lowerBetter inverts (favorable = 100 - percentile)", () => {
    expect(getPercentileTier(1, "lowerBetter")?.id).toBe("elite");
    expect(getPercentileTier(2, "lowerBetter")?.id).toBe("elite"); // favorable 98
    expect(getPercentileTier(4, "lowerBetter")?.id).toBe("excellent"); // favorable 96
    expect(getPercentileTier(15, "lowerBetter")?.id).toBe("great"); // favorable 85
    expect(getPercentileTier(50, "lowerBetter")?.id).toBe("average");
    expect(getPercentileTier(99, "lowerBetter")?.id).toBe("poor");
  });

  it("computeTeamPercentiles honours explicit direction and stays context-only-safe", () => {
    const pop = [
      { teamAbbr: "AAA", value: 10 },
      { teamAbbr: "BBB", value: 20 },
      { teamAbbr: "CCC", value: 30 },
    ];
    const higher = computeTeamPercentiles(pop, "higher-is-better");
    expect(higher.get("CCC")).toBe(100);
    expect(higher.get("AAA")).toBe(0);

    const lower = computeTeamPercentiles(pop, "lower-is-better");
    expect(lower.get("AAA")).toBe(100);
    expect(lower.get("CCC")).toBe(0);

    expect(computeTeamPercentiles(pop, "context-only").size).toBe(0);
  });
});

describe("JKB Heat — non-scoring states", () => {
  it("missing / non-finite value yields no style", () => {
    expect(resolvePercentileDisplay({ value: null, percentile: 99 }).style).toBeNull();
    expect(resolvePercentileDisplay({ value: Number.NaN, percentile: 99 }).style).toBeNull();
    expect(resolvePercentileDisplay({ value: 1, percentile: null }).style).toBeNull();
    expect(getPercentileTier(null)).toBeNull();
    expect(getPercentileTier(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("known small sample: value styled, never Elite/Excellent paint", () => {
    const r = resolvePercentileDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: 3,
      sampleMinimum: 20,
    });
    expect(r.confidence).toBe("small-sample");
    expect(r.style?.backgroundColor).not.toBe("#e8d5a8");
    expect(r.style?.backgroundColor).not.toBe("#047857");
  });

  it("sample unavailable: muted, capped at Great, never Elite gold", () => {
    const r = resolvePercentileDisplay({
      value: 0.4,
      percentile: 99,
      sampleSize: null,
      sampleMinimum: 20,
    });
    expect(r.confidence).toBe("sample-unavailable");
    expect(r.tier?.id).toBe("great");
    expect(r.style?.backgroundColor).not.toBe("#e8d5a8");
  });

  it("context-only (weeklyRankHeatTone with no valid rank) -> missing", () => {
    expect(weeklyRankHeatTone(null, 32)).toBe("missing");
    expect(weeklyRankHeatTone(5, null)).toBe("missing");
  });
});

describe("JKB Heat — legend parity with tier definitions", () => {
  it("legend ids and order match PERCENTILE_TIERS exactly", () => {
    expect(JKB_HEAT_LEGEND.map((e) => e.id)).toEqual(PERCENTILE_TIERS.map((t) => t.id));
    expect(JKB_HEAT_LEGEND.map((e) => e.label)).toEqual(PERCENTILE_TIER_LEGEND.map((e) => e.label));
  });

  it("legend styles are the exact tier styles (not a hand-copied list)", () => {
    for (const entry of JKB_HEAT_LEGEND) {
      const tier = PERCENTILE_TIERS.find((t) => t.id === entry.id)!;
      expect(entry.style).toEqual(tier.style);
      expect(entry.minFavorablePercentile).toBe(tier.minFavorablePercentile);
    }
  });

  it("legend percentile ranges are derived from the tier cutoffs", () => {
    const byId = Object.fromEntries(JKB_HEAT_LEGEND.map((e) => [e.id, e.percentileRange]));
    expect(byId.elite).toBe(">= 98");
    expect(byId.excellent).toBe("95-97");
    expect(byId.great).toBe("80-94");
    expect(byId.aboveAverage).toBe("60-79");
    expect(byId.average).toBe("40-59");
    expect(byId.belowAverage).toBe("25-39");
    expect(byId.weak).toBe("10-24");
    expect(byId.poor).toBe("< 10");
  });
});

describe("JKB Heat — tier <-> WeeklyHeatTone bridge", () => {
  it("every tier maps to a tone and round-trips", () => {
    for (const tier of PERCENTILE_TIERS) {
      const tone = tierToWeeklyHeatTone(tier.id);
      expect(tone).toBe(TIER_TO_WEEKLY_HEAT_TONE[tier.id]);
      expect(weeklyHeatToneToTierId(tone)).toBe(tier.id);
    }
  });

  it("null tier -> missing; missing tone -> null", () => {
    expect(tierToWeeklyHeatTone(null)).toBe("missing");
    expect(weeklyHeatToneToTierId("missing")).toBeNull();
  });

  it("favorable half of the bridge matches the source module's own MLB fills", () => {
    // researchPresentation fills gold/dark-green/green/light-green/neutral from
    // the identical MLB tier styles; assert the tone names line up.
    expect(TIER_TO_WEEKLY_HEAT_TONE.elite).toBe("gold");
    expect(TIER_TO_WEEKLY_HEAT_TONE.average).toBe("neutral");
    expect(TIER_TO_WEEKLY_HEAT_TONE.poor).toBe("strong-red");
  });
});

describe("JKB Heat — compatibility re-exports", () => {
  it("re-exported WeeklyHeatTone helpers are the identical functions from the source module", () => {
    expect(weeklyHeatClass).toBe(sourceWeeklyHeatClass);
    expect(weeklyHeatStyle).toBe(sourceWeeklyHeatStyle);
    expect(weeklyHeatClass("gold")).toBe("weekly-heat-gold");
  });
});
