import { describe, expect, it } from "vitest";
import {
  NFL_RATING_TIERS,
  getNflRatingBand,
  getNflRatingHeatClass,
  getNflRatingPresentation,
} from "./ratingPresentation";

const BANDS = [
  [78, "elite", "bg-amber-200 text-amber-950"],
  [87.8, "elite", "bg-amber-200 text-amber-950"], // 2024's actual league-max Current OVR
  [70, "great", "bg-emerald-700 text-white"],
  [77.9, "great", "bg-emerald-700 text-white"],
  [62, "strong", "bg-emerald-200 text-emerald-950"],
  [69.9, "strong", "bg-emerald-200 text-emerald-950"],
  [54, "good", "bg-emerald-50 text-emerald-800"],
  [61.9, "good", "bg-emerald-50 text-emerald-800"],
  [46, "average", "bg-lime-100 text-lime-900"],
  [53.9, "average", "bg-lime-100 text-lime-900"],
  [38, "below-average", "bg-amber-100 text-amber-900"],
  [45.9, "below-average", "bg-amber-100 text-amber-900"],
  [30, "weak", "bg-orange-100 text-orange-900"],
  [37.9, "weak", "bg-orange-100 text-orange-900"],
  [29.9, "poor", "bg-rose-100 text-rose-900"],
  [16.3, "poor", "bg-rose-100 text-rose-900"], // 2022's actual league-min Current OVR
] as const;

describe("NFL Current OVR rating presentation", () => {
  it.each(BANDS)("maps %s to the %s band", (value, band, className) => {
    expect(getNflRatingBand(value)).toBe(band);
    expect(getNflRatingHeatClass(value)).toBe(className);
  });

  it("gives an elite league-leading rating (~83) the gold tier, not the CFB scale's mid-pack band", () => {
    // Under the CFB scale (calibrated to CFB's ~60-99 range) an 83 lands in
    // "good", not "elite". This is the exact miscalibration this NFL-specific
    // module exists to fix.
    expect(getNflRatingBand(83)).toBe("elite");
    expect(getNflRatingHeatClass(83)).toBe("bg-amber-200 text-amber-950");
  });

  it("gives a strong rating a green treatment distinct from elite gold", () => {
    expect(getNflRatingBand(72)).toBe("great");
    expect(getNflRatingHeatClass(72)).not.toBe(getNflRatingHeatClass(83));
  });

  it("gives a mid-tier rating an intermediate treatment, not gold and not the weakest band", () => {
    expect(getNflRatingBand(50)).toBe("average");
    expect(getNflRatingHeatClass(50)).toBe("bg-lime-100 text-lime-900");
  });

  it("gives a weak rating the site's existing low-end treatment", () => {
    expect(getNflRatingBand(22)).toBe("poor");
    expect(getNflRatingHeatClass(22)).toBe("bg-rose-100 text-rose-900");
  });

  it("colors by the actual score, never by league rank", () => {
    // Two different scores landing in the same band get identical treatment
    // regardless of what rank they'd occupy in a given week's 32-team field.
    expect(getNflRatingHeatClass(65)).toBe(getNflRatingHeatClass(68));
  });

  it("exposes all eight tiers for a shared legend", () => {
    expect(NFL_RATING_TIERS.map(({ label }) => label)).toEqual([
      "Elite", "Great", "Strong", "Good", "Average", "Below Avg", "Weak", "Poor",
    ]);
  });

  it("uses neutral text without heatmap emphasis for unavailable ratings", () => {
    expect(getNflRatingPresentation(null)).toEqual({
      band: "unavailable",
      label: "Unavailable",
      range: "—",
      className: "text-slate-500",
    });
    expect(getNflRatingPresentation(undefined).band).toBe("unavailable");
  });
});
