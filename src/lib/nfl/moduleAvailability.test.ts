import { describe, expect, it } from "vitest";
import {
  NFL_COMMAND_CENTER_MODULE_LABELS,
  deriveUnavailableModules,
  formatSupportingDataWarning,
  type NflModuleLoaderStates,
} from "@/lib/nfl/moduleAvailability";

const ok = { loading: false, error: null };
const healthy: NflModuleLoaderStates = {
  market: ok, spreadProjections: ok, jkbTotals: ok, currentPowerRatings: ok, fantasyStatus: "ready",
};

describe("deriveUnavailableModules", () => {
  it("returns nothing when every module is ready", () => {
    expect(deriveUnavailableModules(healthy)).toEqual([]);
  });

  it("does not flag modules that are still loading", () => {
    expect(deriveUnavailableModules({
      ...healthy,
      market: { loading: true, error: null },
      fantasyStatus: "loading",
    })).toEqual([]);
  });

  it("maps each module's own state to its ID", () => {
    const bad = { loading: false, error: "Market data unavailable (404)." };
    expect(deriveUnavailableModules({ ...healthy, market: bad })).toEqual(["market"]);
    expect(deriveUnavailableModules({ ...healthy, spreadProjections: bad })).toEqual(["spreadProjections"]);
    expect(deriveUnavailableModules({ ...healthy, jkbTotals: bad })).toEqual(["jkbTotals"]);
    expect(deriveUnavailableModules({ ...healthy, currentPowerRatings: bad })).toEqual(["currentPowerRatings"]);
    expect(deriveUnavailableModules({ ...healthy, fantasyStatus: "missing" })).toEqual(["fantasyRankings"]);
    expect(deriveUnavailableModules({ ...healthy, fantasyStatus: "error" })).toEqual(["fantasyRankings"]);
  });
});

describe("formatSupportingDataWarning", () => {
  it("returns null when everything is available", () => {
    expect(formatSupportingDataWarning([], 3)).toBeNull();
  });

  it("names the selected week when only fantasy is unavailable", () => {
    expect(formatSupportingDataWarning(["fantasyRankings"], 3)).toBe(
      "Fantasy rankings unavailable for Week 3. Schedule, Market data, Spread projections, JKB totals, and Current power ratings remain available.",
    );
  });

  it("handles totals only", () => {
    expect(formatSupportingDataWarning(["jkbTotals"], 3)).toBe(
      "JKB totals unavailable for Week 3. Schedule and other available modules continue normally.",
    );
  });

  it("handles multiple modules in canonical order", () => {
    expect(formatSupportingDataWarning(["fantasyRankings", "jkbTotals"], 3)).toBe(
      "JKB totals and Fantasy rankings unavailable for Week 3. Other available modules continue normally.",
    );
  });

  it("handles ratings only without a week scope", () => {
    expect(formatSupportingDataWarning(["currentPowerRatings"], 3)).toBe(
      "Current power ratings unavailable. Schedule and other available modules continue normally.",
    );
  });

  it("never leaks technical details", () => {
    const text = formatSupportingDataWarning(["market", "spreadProjections", "jkbTotals", "currentPowerRatings", "fantasyRankings"], 3) ?? "";
    expect(text).not.toMatch(/https?:|\.json|\/data\/|\b40\d\b|\b50\d\b|Error|stack/i);
  });

  it("maps module IDs to human-readable labels", () => {
    expect(NFL_COMMAND_CENTER_MODULE_LABELS).toEqual({
      market: "Market data",
      spreadProjections: "Spread projections",
      jkbTotals: "JKB totals",
      currentPowerRatings: "Current power ratings",
      fantasyRankings: "Fantasy rankings",
    });
  });
});
