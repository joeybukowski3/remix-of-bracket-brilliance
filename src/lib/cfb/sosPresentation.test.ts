import { describe, expect, it } from "vitest";
import { getSosBand, getSosHeatClass } from "./sosPresentation";

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
});
