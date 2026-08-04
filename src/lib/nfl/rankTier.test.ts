import { describe, it, expect } from "vitest";
import {
  NFL_RANK_TIERS,
  NFL_TEAM_COUNT,
  getRankTier,
  getRankTierLabel,
  rankBadgeClass,
  rankCellClass,
} from "@/lib/nfl/rankTier";

describe("NFL rank tiers", () => {
  it("defines eight contiguous, exhaustive buckets over ranks 1-32", () => {
    expect(NFL_RANK_TIERS).toHaveLength(8);
    expect(NFL_RANK_TIERS[0].min).toBe(1);
    expect(NFL_RANK_TIERS[NFL_RANK_TIERS.length - 1].max).toBe(NFL_TEAM_COUNT);

    NFL_RANK_TIERS.forEach((tier, index) => {
      // Each bucket spans exactly four ranks and starts where the last ended.
      expect(tier.max - tier.min).toBe(3);
      if (index > 0) expect(tier.min).toBe(NFL_RANK_TIERS[index - 1].max + 1);
    });
  });

  it("maps every rank from 1 to 32 to exactly one tier", () => {
    for (let rank = 1; rank <= NFL_TEAM_COUNT; rank += 1) {
      const matches = NFL_RANK_TIERS.filter((tier) => rank >= tier.min && rank <= tier.max);
      expect(matches).toHaveLength(1);
      expect(getRankTier(rank)?.id).toBe(matches[0].id);
    }
  });

  it("assigns the documented tier at every bucket boundary", () => {
    const boundaries: [number, string][] = [
      [1, "elite"], [4, "elite"],
      [5, "excellent"], [8, "excellent"],
      [9, "good"], [12, "good"],
      [13, "above-average"], [16, "above-average"],
      [17, "below-average"], [20, "below-average"],
      [21, "weak"], [24, "weak"],
      [25, "poor"], [28, "poor"],
      [29, "very-poor"], [32, "very-poor"],
    ];
    for (const [rank, tierId] of boundaries) {
      expect(getRankTier(rank)?.id).toBe(tierId);
    }
  });

  it("returns null for missing, out-of-league and non-integer ranks", () => {
    for (const rank of [null, undefined, 0, -1, 33, 100, Number.NaN, Number.POSITIVE_INFINITY, 5.5]) {
      expect(getRankTier(rank as number | null | undefined)).toBeNull();
    }
  });

  it("falls back to neutral styling and an Unranked label when the rank is unavailable", () => {
    expect(getRankTierLabel(null)).toBe("Unranked");
    expect(rankBadgeClass(null)).toContain("slate");
    // No tier wash may be applied to an unknown rank.
    expect(rankCellClass(null)).toBe("");
  });

  it("colours best ranks green and worst ranks red", () => {
    expect(rankBadgeClass(1)).toContain("emerald");
    expect(rankBadgeClass(32)).toContain("red");
  });
});
