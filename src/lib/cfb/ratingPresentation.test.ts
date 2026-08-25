import { describe, expect, it } from "vitest";
import {
  CFB_RATING_TIERS,
  getCfbPowerBarWidthPercent,
  getCfbRatingBand,
  getCfbRatingHeatClass,
  getCfbRatingPresentation,
} from "./ratingPresentation";

const BANDS = [
  [95, "elite", "bg-amber-200 text-amber-950"],
  [100, "elite", "bg-amber-200 text-amber-950"],
  [90, "great", "bg-emerald-700 text-white"],
  [94.9, "great", "bg-emerald-700 text-white"],
  [85, "strong", "bg-emerald-200 text-emerald-950"],
  [89.9, "strong", "bg-emerald-200 text-emerald-950"],
  [80, "good", "bg-emerald-50 text-emerald-800"],
  [84.9, "good", "bg-emerald-50 text-emerald-800"],
  [70, "average", "bg-lime-100 text-lime-900"],
  [79.9, "average", "bg-lime-100 text-lime-900"],
  [60, "below-average", "bg-amber-100 text-amber-900"],
  [69.9, "below-average", "bg-amber-100 text-amber-900"],
  [50, "weak", "bg-orange-100 text-orange-900"],
  [59.9, "weak", "bg-orange-100 text-orange-900"],
  [49.9, "poor", "bg-rose-100 text-rose-900"],
] as const;

describe.each(["JKB Power", "offense", "defense"])("CFB %s rating presentation", () => {
  it.each(BANDS)("maps %s to the %s band", (value, band, className) => {
    expect(getCfbRatingBand(value)).toBe(band);
    expect(getCfbRatingHeatClass(value)).toBe(className);
  });
});

describe("shared CFB rating presentation", () => {
  it("makes an elite 98.6 visually distinct from a good 83.2", () => {
    expect(getCfbRatingHeatClass(98.6)).not.toBe(getCfbRatingHeatClass(83.2));
    expect(getCfbRatingBand(98.6)).toBe("elite");
    expect(getCfbRatingBand(83.2)).toBe("good");
  });

  it("exposes all eight tiers for the shared legend", () => {
    expect(CFB_RATING_TIERS.map(({ label }) => label)).toEqual([
      "Elite", "Great", "Strong", "Good", "Average", "Below Avg", "Weak", "Poor",
    ]);
  });

  it("uses neutral text without heatmap emphasis for unavailable ratings", () => {
    expect(getCfbRatingPresentation(null)).toEqual({
      band: "unavailable",
      label: "Unavailable",
      range: "—",
      className: "text-slate-500",
    });
  });
});

describe("CFB power bar presentation scale", () => {
  it("clamps a null/unavailable rating to zero width", () => {
    expect(getCfbPowerBarWidthPercent(null)).toBe(0);
    expect(getCfbPowerBarWidthPercent(undefined)).toBe(0);
    expect(getCfbPowerBarWidthPercent(Number.NaN)).toBe(0);
  });

  it("clamps ratings below the presentation floor (40) to zero width", () => {
    expect(getCfbPowerBarWidthPercent(20)).toBe(0);
    expect(getCfbPowerBarWidthPercent(40)).toBe(0);
  });

  it("clamps ratings above the presentation ceiling (100) to full width", () => {
    expect(getCfbPowerBarWidthPercent(100)).toBe(100);
    expect(getCfbPowerBarWidthPercent(140)).toBe(100);
  });

  it("scales a mid-range rating linearly between the floor and ceiling", () => {
    expect(getCfbPowerBarWidthPercent(70)).toBeCloseTo(50, 5);
  });
});
