import { describe, expect, it } from "vitest";
import { CFB_RANK_TIERS, getCfbRankCellProps, getCfbRankTier } from "./rankTierPalette";

const FIELD = 136;

describe("CFB JKB rank-tier palette", () => {
  it("resolves tiers from national rank, best to worst", () => {
    const ids = [1, 13, 27, 47, 68, 88, 108, 125, 136].map((rank) => getCfbRankTier(rank, FIELD)?.id);
    expect(ids).toEqual(["elite", "elite", "great", "strong", "good", "average", "below-average", "weak", "poor"]);
  });

  it("never uses green for any tier", () => {
    for (const tier of CFB_RANK_TIERS) {
      const color = String(tier.style.backgroundColor);
      expect(color).not.toMatch(/#(04|10|22)[0-9a-f]{4}|emerald|lime|green/i);
    }
  });

  it("keeps missing ranks neutral and unclassified", () => {
    expect(getCfbRankTier(null, FIELD)).toBeNull();
    expect(getCfbRankTier(undefined, FIELD)).toBeNull();
    expect(getCfbRankCellProps(null, FIELD)["data-rank-tier"]).toBe("unavailable");
  });

  it("returns identical props for Values and Ranks use of the same rank", () => {
    expect(getCfbRankCellProps(11, FIELD)).toEqual(getCfbRankCellProps(11, FIELD));
    expect(getCfbRankCellProps(11, FIELD)["data-rank-tier"]).toBe("elite");
  });
});
