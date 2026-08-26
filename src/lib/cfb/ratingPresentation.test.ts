import { describe, expect, it } from "vitest";
import {
  CFB_RATING_TIERS,
  getCfbPowerBarWidthPercent,
  getCfbRatingBand,
  getCfbRatingHeatClass,
  getCfbRatingPresentation,
  getCfbSharedBarSplit,
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

describe("getCfbSharedBarSplit (unified comparison-bar percentages)", () => {
  it("splits directly by raw-value ratio, not by independently clamped display widths", () => {
    // Power: UNC 69.5 vs TCU 84.0 -> raw ratio ~45.28/54.72, not the
    // clamped-ratio ~40.14/59.86 the old two-step calculation produced.
    const power = getCfbSharedBarSplit(69.5, 84.0);
    expect(power.awayShare).toBeCloseTo((69.5 / 153.5) * 100, 5);
    expect(power.homeShare).toBeCloseTo((84.0 / 153.5) * 100, 5);

    // Offense: UNC 45.1 vs TCU 78.5 -> raw ratio ~36.49/63.51. The old
    // clamped-ratio calculation produced a wildly distorted ~11.7/88.3.
    const offense = getCfbSharedBarSplit(45.1, 78.5);
    expect(offense.awayShare).toBeCloseTo((45.1 / 123.6) * 100, 5);
    expect(offense.homeShare).toBeCloseTo((78.5 / 123.6) * 100, 5);

    // Defense: UNC 78.9 vs TCU 74.6 -> raw ratio ~51.40/48.60.
    const defense = getCfbSharedBarSplit(78.9, 74.6);
    expect(defense.awayShare).toBeCloseTo((78.9 / 153.5) * 100, 5);
    expect(defense.homeShare).toBeCloseTo((74.6 / 153.5) * 100, 5);
  });

  it("always sums to exactly 100", () => {
    for (const [a, h] of [[69.5, 84.0], [45.1, 78.5], [78.9, 74.6], [50, 50], [40, 100]]) {
      const { awayShare, homeShare } = getCfbSharedBarSplit(a, h);
      expect(awayShare + homeShare).toBeCloseTo(100, 8);
    }
  });

  it("gives the usable side 100% and the null side 0% when only one rating is available", () => {
    expect(getCfbSharedBarSplit(75, null)).toEqual({ awayShare: 100, homeShare: 0 });
    expect(getCfbSharedBarSplit(null, 75)).toEqual({ awayShare: 0, homeShare: 100 });
    expect(getCfbSharedBarSplit(undefined, 75)).toEqual({ awayShare: 0, homeShare: 100 });
  });

  it("falls back to an even 50/50 split when neither side has a usable rating", () => {
    expect(getCfbSharedBarSplit(null, null)).toEqual({ awayShare: 50, homeShare: 50 });
    expect(getCfbSharedBarSplit(Number.NaN, undefined)).toEqual({ awayShare: 50, homeShare: 50 });
  });
});
