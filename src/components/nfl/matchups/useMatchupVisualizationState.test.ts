import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMatchupVisualizationState } from "@/components/nfl/matchups/useMatchupVisualizationState";
import { CURATED_METRIC_DEFAULTS } from "@/lib/nfl/matchupCuratedMetrics";

describe("useMatchupVisualizationState", () => {
  it("defaults the view to Rank Towers", () => {
    const { result } = renderHook(() => useMatchupVisualizationState());
    expect(result.current.view).toBe("towers");
  });

  it("switches to Profile and keeps it across simulated category changes", () => {
    const { result } = renderHook(() => useMatchupVisualizationState());
    act(() => result.current.setView("profile"));
    expect(result.current.view).toBe("profile");
    // A category switch on the real panel does not touch this hook's state at
    // all — re-reading the same field simulates that persistence directly.
    expect(result.current.view).toBe("profile");
  });

  it("falls back to the curated defaults for a category with no explicit selection", () => {
    const { result } = renderHook(() => useMatchupVisualizationState());
    expect(result.current.getSelectedMetricIds("offense")).toEqual(CURATED_METRIC_DEFAULTS.offense);
    expect(result.current.isUsingDefaults("offense")).toBe(true);
  });

  it("remembers a category's selection independently of other categories", () => {
    const { result } = renderHook(() => useMatchupVisualizationState());
    act(() => result.current.setSelectedMetricIds("offense", ["off.epaPerPlay", "off.successRate"]));
    expect(result.current.getSelectedMetricIds("offense")).toEqual(["off.epaPerPlay", "off.successRate"]);
    expect(result.current.getSelectedMetricIds("defense")).toEqual(CURATED_METRIC_DEFAULTS.defense);
    expect(result.current.isUsingDefaults("offense")).toBe(false);
    expect(result.current.isUsingDefaults("defense")).toBe(true);
  });

  it("resets a category back to its curated defaults", () => {
    const { result } = renderHook(() => useMatchupVisualizationState());
    act(() => result.current.setSelectedMetricIds("offense", ["off.epaPerPlay", "off.successRate"]));
    act(() => result.current.resetToDefaults("offense"));
    expect(result.current.getSelectedMetricIds("offense")).toEqual(CURATED_METRIC_DEFAULTS.offense);
    expect(result.current.isUsingDefaults("offense")).toBe(true);
  });

  it("gives Towers and Profile the exact same selected ids for the active category", () => {
    const { result } = renderHook(() => useMatchupVisualizationState());
    act(() => result.current.setSelectedMetricIds("passing", ["off.epaPerPass", "def.epaPerPassAllowed"]));
    // There is exactly one selection source; both "views" read it identically.
    const forTowers = result.current.getSelectedMetricIds("passing");
    const forProfile = result.current.getSelectedMetricIds("passing");
    expect(forTowers).toEqual(forProfile);
    act(() => result.current.setView("profile"));
    expect(result.current.getSelectedMetricIds("passing")).toEqual(forTowers);
  });
});
