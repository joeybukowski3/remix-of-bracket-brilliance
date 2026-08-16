import { describe, expect, it } from "vitest";
import {
  getMaxRank,
  getParPerGameThresholds,
  getParPerGameTone,
  getRankGradientColor,
} from "@/lib/fantasy/parPresentation";

describe("getParPerGameThresholds", () => {
  it("returns null when no populated PAR/G values exist", () => {
    expect(getParPerGameThresholds([undefined, Number.NaN])).toBeNull();
  });

  it("derives the elite cutoff from the position's own distribution", () => {
    // Arrange
    const values = [-2, 0, 1, 2, 3, 4, 5, 6];

    // Act
    const thresholds = getParPerGameThresholds(values);

    // Assert — index floor(8 * 0.75) = 6 of the ascending list.
    expect(thresholds).toEqual({ eliteMin: 5 });
  });
});

describe("getParPerGameTone", () => {
  const thresholds = { eliteMin: 5 };

  it("returns missing for absent values", () => {
    expect(getParPerGameTone(undefined, thresholds)).toBe("missing");
  });

  it("buckets elite, positive, near replacement and below replacement", () => {
    expect(getParPerGameTone(6.4, thresholds)).toBe("elite");
    expect(getParPerGameTone(5, thresholds)).toBe("elite");
    expect(getParPerGameTone(3.2, thresholds)).toBe("positive");
    expect(getParPerGameTone(1, thresholds)).toBe("near");
    expect(getParPerGameTone(-1, thresholds)).toBe("near");
    expect(getParPerGameTone(-2.5, thresholds)).toBe("below");
  });

  it("never marks a near-replacement value elite when the pool is flat", () => {
    expect(getParPerGameTone(0.4, { eliteMin: 0.2 })).toBe("near");
  });
});

describe("getRankGradientColor", () => {
  it("returns undefined without a usable rank or scale", () => {
    expect(getRankGradientColor(undefined, 32)).toBeUndefined();
    expect(getRankGradientColor(4, null)).toBeUndefined();
    expect(getRankGradientColor(4, 1)).toBeUndefined();
  });

  it("anchors rank 1 to emerald-100, the midpoint to slate-100 and the worst rank to rose-100", () => {
    expect(getRankGradientColor(1, 33)).toBe("rgb(209, 250, 229)");
    expect(getRankGradientColor(17, 33)).toBe("rgb(241, 245, 249)");
    expect(getRankGradientColor(33, 33)).toBe("rgb(255, 228, 230)");
  });

  it("clamps ranks beyond the scale instead of extrapolating", () => {
    expect(getRankGradientColor(99, 33)).toBe("rgb(255, 228, 230)");
  });
});

describe("getMaxRank", () => {
  it("returns null when nothing is populated", () => {
    expect(getMaxRank([undefined])).toBeNull();
  });

  it("returns the largest populated rank", () => {
    expect(getMaxRank([3, undefined, 31, 8])).toBe(31);
  });
});
