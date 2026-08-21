import { describe, expect, it } from "vitest";
import { modelMarketGapBadgeColor } from "@/lib/nfl/gapColor";

describe("modelMarketGapBadgeColor", () => {
  it("returns a neutral fallback color for a null gap", () => {
    expect(modelMarketGapBadgeColor(null)).toEqual({ backgroundColor: "#f1f5f9", color: "#64748b" });
  });

  it("returns white for a zero (even) gap", () => {
    expect(modelMarketGapBadgeColor(0)).toEqual({ backgroundColor: "rgb(255 255 255)", color: "#0f172a" });
  });

  it("returns a greener background as the gap magnitude grows", () => {
    const small = modelMarketGapBadgeColor(1);
    const moderate = modelMarketGapBadgeColor(5);
    const large = modelMarketGapBadgeColor(10);

    const redChannel = (color: string) => Number(color.match(/rgb\((\d+) \d+ \d+\)/)?.[1]);
    expect(redChannel(small.backgroundColor)).toBeGreaterThan(redChannel(moderate.backgroundColor));
    expect(redChannel(moderate.backgroundColor)).toBeGreaterThan(redChannel(large.backgroundColor));
  });

  it("clamps intensity beyond the color ceiling so very large gaps stay at the brightest green", () => {
    expect(modelMarketGapBadgeColor(10)).toEqual(modelMarketGapBadgeColor(25));
  });

  it("colors magnitude only, ignoring sign", () => {
    expect(modelMarketGapBadgeColor(6)).toEqual(modelMarketGapBadgeColor(-6));
  });

  it("keeps dark, readable text at every intensity", () => {
    expect(modelMarketGapBadgeColor(0).color).toBe("#0f172a");
    expect(modelMarketGapBadgeColor(10).color).toBe("#0f172a");
  });
});
