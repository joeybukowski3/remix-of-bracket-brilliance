import { describe, expect, it } from "vitest";
import { getCfbRatingBand, getCfbRatingHeatClass } from "./ratingPresentation";

const BANDS = [
  [90, "strongest", "bg-emerald-200/80 text-emerald-950"],
  [99, "strongest", "bg-emerald-200/80 text-emerald-950"],
  [80, "strong", "bg-emerald-100 text-emerald-900"],
  [89.9, "strong", "bg-emerald-100 text-emerald-900"],
  [70, "positive", "bg-emerald-50 text-emerald-800"],
  [79.9, "positive", "bg-emerald-50 text-emerald-800"],
  [60, "neutral", "bg-slate-50 text-slate-700"],
  [69.9, "neutral", "bg-slate-50 text-slate-700"],
  [50, "soft", "bg-amber-50 text-amber-900"],
  [59.9, "soft", "bg-amber-50 text-amber-900"],
  [40, "weak", "bg-rose-100/80 text-rose-900"],
  [49.9, "weak", "bg-rose-100/80 text-rose-900"],
] as const;

describe.each(["offense", "defense"])("CFB %s rating presentation", () => {
  it.each(BANDS)("maps %s to the %s band", (value, band, className) => {
    expect(getCfbRatingBand(value)).toBe(band);
    expect(getCfbRatingHeatClass(value)).toBe(className);
  });
});

describe("unavailable CFB rating presentation", () => {
  it("uses neutral text without a heatmap background", () => {
    expect(getCfbRatingBand(null)).toBe("unavailable");
    expect(getCfbRatingHeatClass(null)).toBe("text-slate-500");
  });
});
