import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CUSTOM_WEIGHT_CONTROLS,
  PGA_CUSTOM_WORKING_WEIGHTS_KEY,
  PGA_PRESET_STORAGE_KEY,
  PgaCompactTable,
  getSavedCustomWeights,
  loadCustomPresets,
  normalizeCustomWeights,
  rankPlayers,
  type CourseWeightSet,
  type RawPlayerStat,
} from "@/components/pga/PgaHubShared";
import { TooltipProvider } from "@/components/ui/tooltip";

function buildPlayer(player: string, trendRank: number | null): RawPlayerStat {
  return {
    player,
    sgTotal: 0.1,
    sgOTT: 0.2,
    sgApp: 0.3,
    sgAtG: 0.4,
    sgPutt: 0.5,
    trendRank,
    drivingAccuracy: 60,
    bogeyAvoidance: 0.15,
    birdieBogeyRatio: 1.1,
  };
}

const baselineWeights: CourseWeightSet = {
  sgTotal: 0,
  sgOTT: 0,
  sgApp: 0,
  sgAtG: 0,
  sgPutt: 0,
  trendRank: 1,
  drivingAccuracy: 0,
  bogeyAvoidance: 0,
  birdieBogeyRatio: 0,
};

afterEach(() => {
  window.localStorage.removeItem(PGA_CUSTOM_WORKING_WEIGHTS_KEY);
  window.localStorage.removeItem(PGA_PRESET_STORAGE_KEY);
});

describe("PgaHubShared", () => {
  it("includes Trend in the custom model control registry", () => {
    expect(CUSTOM_WEIGHT_CONTROLS.some((entry) => entry.key === "trendRank")).toBe(true);
    expect(normalizeCustomWeights({ sgTotal: 1 }).trendRank).toBe(0);
  });

  it("fills missing Trend weights from fallback defaults for saved custom state", () => {
    window.localStorage.setItem(PGA_CUSTOM_WORKING_WEIGHTS_KEY, JSON.stringify({
      sgTotal: 10,
      sgOTT: 10,
      sgApp: 10,
      sgAtG: 10,
      sgPutt: 10,
      drivingAccuracy: 10,
      bogeyAvoidance: 10,
      birdieBogeyRatio: 30,
    }));

    const weights = getSavedCustomWeights({ ...baselineWeights, trendRank: 7 });
    expect(weights?.trendRank).toBe(7);
  });

  it("fills missing Trend weights in saved presets", () => {
    window.localStorage.setItem(PGA_PRESET_STORAGE_KEY, JSON.stringify({
      balanced: {
        sgTotal: 10,
        sgOTT: 10,
        sgApp: 10,
        sgAtG: 10,
        sgPutt: 10,
        drivingAccuracy: 10,
        bogeyAvoidance: 10,
        birdieBogeyRatio: 30,
      },
    }));

    const presets = loadCustomPresets({ ...baselineWeights, trendRank: 9 });
    expect(presets.balanced.trendRank).toBe(9);
  });

  it("changes custom rankings when Trend weight changes", () => {
    const players = [buildPlayer("Bryson DeChambeau", 1), buildPlayer("Jon Rahm", 83)];
    const ranked = rankPlayers(players, baselineWeights);

    expect(ranked[0].player).toBe("Bryson DeChambeau");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("keeps missing Trend data safe without inventing a score", () => {
    const players = [buildPlayer("Missing Trend", null)];
    const ranked = rankPlayers(players, baselineWeights);

    expect(ranked[0].trendRank).toBeNull();
    expect(ranked[0].score).toBe(0);
  });

  it("renders Trend in both raw and percentile compact table views", () => {
    const row = {
      player: "Ludvig Aberg",
      rank: 1,
      score: 99,
      sgTotal: 0.2,
      sgOTT: 0.2,
      sgApp: 0.2,
      sgAtG: 0.2,
      sgPutt: 0.2,
      trendRank: 12,
      drivingAccuracy: 62,
      bogeyAvoidance: 0.11,
      birdieBogeyRatio: 1.25,
    };

    const { rerender } = render(
      <TooltipProvider>
        <PgaCompactTable rows={[row]} scoreLabel="Custom Score" movementMap={{}} displayMode="raw" />
      </TooltipProvider>,
    );

    expect(screen.getAllByText("TREND").length).toBeGreaterThan(0);
    expect(screen.getByText("12")).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <PgaCompactTable rows={[row]} scoreLabel="Custom Score" movementMap={{}} displayMode="percentile" />
      </TooltipProvider>,
    );

    expect(screen.getAllByText("99").length).toBeGreaterThan(0);
  });
});
