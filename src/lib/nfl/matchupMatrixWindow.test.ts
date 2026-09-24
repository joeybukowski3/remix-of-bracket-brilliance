import { describe, expect, it } from "vitest";
import { blendMatrixMetricValue, sampleSettingsForMatrixWindow } from "@/lib/nfl/matchupMatrixWindow";

describe("sampleSettingsForMatrixWindow", () => {
  it("maps Last 8 to the rolling cross-season window", () => {
    expect(sampleSettingsForMatrixWindow("last8")).toEqual({ window: "season", includePriorSeason: true });
  });

  it("maps 2026 Only to the uncapped current-season window, excluding prior-season data", () => {
    expect(sampleSettingsForMatrixWindow("2026-only")).toEqual({ window: "season", includePriorSeason: false });
  });

  it("uses the 2026-only window as Blended's current-season leg", () => {
    expect(sampleSettingsForMatrixWindow("blended")).toEqual({ window: "season", includePriorSeason: false });
  });
});

describe("blendMatrixMetricValue", () => {
  it("uses 100% prior-season value at 0 completed games", () => {
    expect(blendMatrixMetricValue(0.1, 0.5, 0)).toBeCloseTo(0.1, 10);
  });

  it("follows the exact production weight curve at each games-played step", () => {
    // preseasonWeight/performanceWeight per CURRENT_RATING_WEIGHTS_BY_GAMES
    expect(blendMatrixMetricValue(0, 1, 1)).toBeCloseTo(0.2, 10); // 80/20
    expect(blendMatrixMetricValue(0, 1, 2)).toBeCloseTo(0.4, 10); // 60/40
    expect(blendMatrixMetricValue(0, 1, 3)).toBeCloseTo(0.6, 10); // 40/60
    expect(blendMatrixMetricValue(0, 1, 4)).toBeCloseTo(0.75, 10); // 25/75
    expect(blendMatrixMetricValue(0, 1, 5)).toBeCloseTo(0.9, 10); // 10/90
  });

  it("phases the prior-season value out completely at 6+ completed games", () => {
    expect(blendMatrixMetricValue(0.1, 0.9, 6)).toBeCloseTo(0.9, 10);
    expect(blendMatrixMetricValue(0.1, 0.9, 12)).toBeCloseTo(0.9, 10);
  });

  it("keys the blend off the team's own games-played count, not a league week", () => {
    const early = blendMatrixMetricValue(0, 1, 1);
    const late = blendMatrixMetricValue(0, 1, 5);
    expect(early).not.toBeCloseTo(late, 5);
  });

  it("falls back to whichever leg is available rather than treating a missing leg as zero", () => {
    expect(blendMatrixMetricValue(null, 0.5, 3)).toBeCloseTo(0.5, 10);
    expect(blendMatrixMetricValue(0.5, null, 3)).toBeCloseTo(0.5, 10);
    expect(blendMatrixMetricValue(null, null, 3)).toBeNull();
  });

  it("returns null with no data at 0 completed games when even the prior value is missing", () => {
    expect(blendMatrixMetricValue(null, null, 0)).toBeNull();
  });
});
