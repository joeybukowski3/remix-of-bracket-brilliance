import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { assertCutoffBeforeTarget, evaluateBacktestReadiness, validateHistoricalOutcomeCoverage } from "./validation";

describe("Phase B validity gates", () => {
  it("blocks a stats-only backtest without historical eligibility authority", () => {
    const result = evaluateBacktestReadiness({
      playerStatsSeasons: [2023, 2024, 2025], weeklyRosterSeasons: [2025], injurySeasons: [2025],
      snapCountSeasons: [2025], teamStatsSeasons: [2023, 2024, 2025], teamEpaSeasons: [2023, 2024, 2025],
      marketSeasons: [2025], marketPregameTimestampVerified: false,
    });
    expect(result.readyForPrimaryBacktest).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([
      "weekly-rosters:2023", "weekly-rosters:2024", "injuries:2023", "injuries:2024",
    ]));
    expect(result.optional.marketExcludedFromPrimary).toBe(true);
  });

  it("accepts only strictly earlier cutoffs", () => {
    expect(() => assertCutoffBeforeTarget({
      season: 2024, week: 5,
      cutoffs: { player: { season: 2024, week: 4 }, prior: { season: 2023, week: 18 }, missing: null },
    })).not.toThrow();
    expect(() => assertCutoffBeforeTarget({
      season: 2024, week: 5, cutoffs: { player: { season: 2024, week: 5 } },
    })).toThrow(/reaches target/);
  });

  it("requires every 2023-2025 regular-season week and position", () => {
    const rows = [2023, 2024, 2025].flatMap((season) => Array.from({ length: 18 }, (_, index) => index + 1).flatMap((week) =>
      (["QB", "RB", "WR", "TE"] as const).map((position) => ({
        season, week, position, playerId: `gsis:${season}-${week}-${position}`,
      }) as HistoricalPlayerWeek)
    ));
    expect(validateHistoricalOutcomeCoverage(rows).complete).toBe(true);
    const incomplete = validateHistoricalOutcomeCoverage(rows.filter((row) => !(row.season === 2024 && row.week === 7 && row.position === "TE")));
    expect(incomplete.complete).toBe(false);
    expect(incomplete.errors).toContain("missing 2024 week 7 TE outcomes");
  });
});
