import { describe, expect, it } from "vitest";
import { SOS_HEAT_LEGEND, getSosBand, getSosHeatClass } from "./sosPresentation";

describe("CFB SOS presentation", () => {
  it.each([
    [1, "strong-difficult"],
    [25, "strong-difficult"],
    [26, "moderate-difficult"],
    [50, "moderate-difficult"],
    [51, "neutral"],
    [88, "neutral"],
    [89, "moderate-easy"],
    [113, "moderate-easy"],
    [114, "strong-easy"],
    [138, "strong-easy"],
    [null, "unavailable"],
  ])("maps rank %s to %s", (rank, expected) => {
    expect(getSosBand(rank)).toBe(expected);
  });

  it.each(["SOS Played", "SOS Remaining"])("uses the full heatmap for %s", () => {
    expect(getSosHeatClass(1)).toBe("bg-rose-100/80 text-rose-900");
    expect(getSosHeatClass(26)).toBe("bg-orange-50 text-orange-900");
    expect(getSosHeatClass(51)).toBe("bg-slate-50 text-slate-600");
    expect(getSosHeatClass(89)).toBe("bg-emerald-50 text-emerald-800");
    expect(getSosHeatClass(114)).toBe("bg-emerald-100/80 text-emerald-900");
  });

  it("keeps null SOS Played neutral with no heatmap background", () => {
    expect(getSosHeatClass(null)).toBe("text-slate-500");
    expect(getSosHeatClass(null)).not.toContain("bg-");
  });

  it("legend rows are generated from the same band styles the cells use", () => {
    expect(SOS_HEAT_LEGEND.map((r) => r.band)).toEqual([
      "strong-difficult",
      "moderate-difficult",
      "neutral",
      "moderate-easy",
      "strong-easy",
    ]);
    for (const row of SOS_HEAT_LEGEND) {
      // rank at the start of each band must resolve to that band's className
      const probe = { "strong-difficult": 1, "moderate-difficult": 26, neutral: 51, "moderate-easy": 89, "strong-easy": 114 }[row.band];
      expect(getSosHeatClass(probe)).toBe(row.className);
    }
  });
});
