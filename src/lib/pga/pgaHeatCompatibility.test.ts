import { describe, expect, it } from "vitest";
import { percentileHeatClass } from "@/lib/pga/pgaHeatColors";
import {
  RANK_COLOR_LEGEND,
  getPercentileColor,
  getPercentileFromRank,
  getRankColor,
} from "@/lib/pga/rankColors";

describe("legacy PGA heat compatibility", () => {
  it("preserves the four-band percentile thresholds and scoped class hooks", () => {
    expect([percentileHeatClass(75), percentileHeatClass(74), percentileHeatClass(50), percentileHeatClass(49), percentileHeatClass(26), percentileHeatClass(25)]).toEqual([
      "pga-heat-strong bg-emerald-300 text-emerald-950",
      "pga-heat-good bg-emerald-100 text-emerald-900",
      "pga-heat-good bg-emerald-100 text-emerald-900",
      "pga-heat-neutral bg-slate-100 text-slate-700",
      "pga-heat-neutral bg-slate-100 text-slate-700",
      "pga-heat-low bg-rose-100 text-rose-900",
    ]);
  });

  it("preserves the five-band rank palette, legend, and rank percentile utility", () => {
    expect(RANK_COLOR_LEGEND.map((entry) => entry.label)).toEqual([
      "Top 20%",
      "60-79%",
      "40-59%",
      "20-39%",
      "0-19%",
    ]);
    expect(getPercentileColor(80)).toEqual({ bg: "#1a7a3a", text: "#e6f5ec" });
    expect(getPercentileColor(79)).toEqual({ bg: "#7ec89a", text: "#0f4a22" });
    expect(getPercentileColor(59)).toEqual({ bg: "#f5f5f2", text: "#444444", border: "0.5px solid #d8d8d2" });
    expect(getPercentileColor(39)).toEqual({ bg: "#f0a090", text: "#6b1a10" });
    expect(getPercentileColor(19)).toEqual({ bg: "#b93030", text: "#fce8e8" });
    expect(getPercentileFromRank(1, 83)).toBe(100);
    expect(getPercentileFromRank(83, 83)).toBe(0);
    expect(getRankColor(1, 83)).toEqual(getPercentileColor(100));
  });
});
