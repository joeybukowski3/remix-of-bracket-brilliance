import { resolveWeekEffectiveTeam } from "@/lib/fantasy/weekly/identity";
import { normalizeHistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";

describe("historical leakage safeguards", () => {
  it("never uses a later team assignment for an earlier week", () => {
    const assignments = [
      { playerId: "gsis:trade", season: 2024, week: 1, team: "ten" },
      { playerId: "gsis:trade", season: 2024, week: 10, team: "buf" },
    ];
    expect(resolveWeekEffectiveTeam(assignments, "gsis:trade", 2024, 9)).toBe("ten");
    expect(resolveWeekEffectiveTeam(assignments, "gsis:trade", 2024, 10)).toBe("buf");
  });

  it("stamps provenance from the row's exact week", () => {
    const source = {
      player_id: "00-leak", player_display_name: "Leak Check", position: "QB", recent_team: "BUF",
      opponent_team: "MIA", season: 2024, week: 4, season_type: "REG", completions: 20, attempts: 30,
      passing_yards: 250, passing_tds: 2, interceptions: 1, carries: 4, rushing_yards: 20,
      rushing_tds: 0, receptions: 0, targets: 0, receiving_yards: 0, receiving_tds: 0,
      receiving_air_yards: 0, target_share: 0, air_yards_share: 0, sack_fumbles_lost: 0,
      rushing_fumbles_lost: 0, receiving_fumbles_lost: 0, passing_2pt_conversions: 0,
      rushing_2pt_conversions: 0, receiving_2pt_conversions: 0, special_teams_tds: 0,
    };
    const row = normalizeHistoricalPlayerWeek(source)!;
    expect(row.provenance).toMatchObject({ sourceSeason: 2024, sourceWeek: 4 });
  });
});
