import { describe, expect, it } from "vitest";
import { buildHistoricalBaseline, type HistoricalBaselineSourceRow } from "@/lib/fantasy/rosResearch/historicalBaseline";

const UNIVERSE = [{ playerId: "gsis:1", playerName: "Test Player", position: "RB" as const }];

describe("buildHistoricalBaseline", () => {
  it("computes season PPG and games played as a straight mean of actual points -- historical scoring consistency", () => {
    const rows: HistoricalBaselineSourceRow[] = [
      { season: 2024, playerId: "gsis:1", playerName: "Test Player", position: "RB", actualFantasyPoints: 10 },
      { season: 2024, playerId: "gsis:1", playerName: "Test Player", position: "RB", actualFantasyPoints: 20 },
      { season: 2024, playerId: "gsis:1", playerName: "Test Player", position: "RB", actualFantasyPoints: 30 },
    ];
    const result = buildHistoricalBaseline(rows, UNIVERSE);
    const season = result.players[0].seasons[0];
    expect(season.gamesPlayed).toBe(3);
    expect(season.totalFantasyPoints).toBe(60);
    expect(season.ppg).toBe(20);
  });

  it("uses the most recent season with data as recentHistoricalPpg, never a projection", () => {
    const rows: HistoricalBaselineSourceRow[] = [
      { season: 2023, playerId: "gsis:1", playerName: "Test Player", position: "RB", actualFantasyPoints: 5 },
      { season: 2025, playerId: "gsis:1", playerName: "Test Player", position: "RB", actualFantasyPoints: 25 },
    ];
    const result = buildHistoricalBaseline(rows, UNIVERSE);
    expect(result.players[0].recentHistoricalPpg).toEqual({ season: 2025, ppg: 25, gamesPlayed: 1 });
  });

  it("reports an explicit empty history (not omission) for a universe player with zero rows -- missing data handling", () => {
    const result = buildHistoricalBaseline([], UNIVERSE);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].seasons).toEqual([]);
    expect(result.players[0].recentHistoricalPpg).toBeNull();
    expect(result.counts.playersWithNoHistory).toBe(1);
  });

  it("is deterministic across repeated runs", () => {
    const rows: HistoricalBaselineSourceRow[] = [
      { season: 2024, playerId: "gsis:1", playerName: "Test Player", position: "RB", actualFantasyPoints: 12 },
    ];
    expect(buildHistoricalBaseline(rows, UNIVERSE)).toEqual(buildHistoricalBaseline(rows, UNIVERSE));
  });
});
