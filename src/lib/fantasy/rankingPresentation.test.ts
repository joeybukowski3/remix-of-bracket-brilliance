import { describe, expect, it } from "vitest";
import {
  getQuantileRankTone,
  getRankQuantileThresholds,
  getSosRankTone,
  rankToneStyle,
} from "@/lib/fantasy/rankingPresentation";
import { jkbHeatStyle } from "@/lib/shared/jkbHeat";

describe("fantasy ranking conditional formatting", () => {
  it("uses populated displayed-board quartiles with lower ranks favorable", () => {
    const thresholds = getRankQuantileThresholds([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(thresholds).toEqual({ favorableMax: 2, unfavorableMin: 7 });
    expect(getQuantileRankTone(1, thresholds)).toBe("favorable");
    expect(getQuantileRankTone(4, thresholds)).toBe("neutral");
    expect(getQuantileRankTone(8, thresholds)).toBe("unfavorable");
    expect(getQuantileRankTone(undefined, thresholds)).toBe("missing");
  });

  it("uses the approved fixed SOS bands", () => {
    expect(getSosRankTone(1)).toBe("favorable");
    expect(getSosRankTone(10)).toBe("favorable");
    expect(getSosRankTone(11)).toBe("neutral");
    expect(getSosRankTone(22)).toBe("neutral");
    expect(getSosRankTone(23)).toBe("unfavorable");
    expect(getSosRankTone(32)).toBe("unfavorable");
    expect(getSosRankTone(undefined)).toBe("missing");
  });

  it("delegates the existing three rank bands to JKB Heat without painting missing", () => {
    expect(rankToneStyle("favorable")).toEqual(jkbHeatStyle("light-green"));
    expect(rankToneStyle("neutral")).toEqual(jkbHeatStyle("neutral"));
    expect(rankToneStyle("unfavorable")).toEqual(jkbHeatStyle("light-red"));
    expect(rankToneStyle("missing")).toBeUndefined();
  });
});
