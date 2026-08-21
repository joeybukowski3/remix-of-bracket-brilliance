import { historicalSnapJoinKey, normalizeHistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";

function row(overrides: Record<string, string | number> = {}) {
  return {
    player_id: "00-001", player_display_name: "Historical Player", position: "RB",
    recent_team: "JAC", opponent_team: "WAS", season: 2024, week: 7, season_type: "REG",
    completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, interceptions: 0,
    carries: 15, rushing_yards: 80, rushing_tds: 1,
    receptions: 4, targets: 5, receiving_yards: 30, receiving_tds: 0,
    receiving_air_yards: 12, target_share: 0.2, air_yards_share: 0.05,
    sack_fumbles_lost: 0, rushing_fumbles_lost: 1, receiving_fumbles_lost: 0,
    passing_2pt_conversions: 0, rushing_2pt_conversions: 0, receiving_2pt_conversions: 0,
    special_teams_tds: 0,
    ...overrides,
  };
}

describe("historical player-week normalization", () => {
  it("derives actual PPR points and exact-week usage", () => {
    const result = normalizeHistoricalPlayerWeek(row(), { pfrId: "HistPl00", espnId: 42 }, {
      offensiveSnaps: 48, snapShare: 0.75,
    });
    expect(result).toMatchObject({
      season: 2024, week: 7, playerId: "gsis:00-001", team: "jax", opponent: "wsh",
      actualFantasyPoints: 19, usage: { offensiveSnaps: 48, snapShare: 0.75, rushAttempts: 15, targets: 5 },
    });
  });

  it("keeps unavailable route and red-zone data null", () => {
    expect(normalizeHistoricalPlayerWeek(row())?.usage).toMatchObject({
      routes: null, routeParticipation: null, redZoneTouches: null,
      goalLineTouches: null, redZoneTargets: null,
    });
  });

  it("preserves signed receiving air yards from canonical nflverse rows", () => {
    expect(normalizeHistoricalPlayerWeek(row({
      receiving_air_yards: -4,
      air_yards_share: -0.02,
    }))?.usage).toMatchObject({ receivingAirYards: -4, airYardsShare: -0.02 });
  });

  it("scores canonical negative yardage with the frozen PPR coefficients", () => {
    expect(normalizeHistoricalPlayerWeek(row({ rushing_yards: -3 }))?.actualFantasyPoints).toBeCloseTo(10.7);
  });

  it("excludes postseason and unresolved identities", () => {
    expect(normalizeHistoricalPlayerWeek(row({ season_type: "POST" }))).toBeNull();
    expect(normalizeHistoricalPlayerWeek(row({ player_id: "" }))).toBeNull();
  });

  it("rejects missing core stats rather than treating them as zero", () => {
    expect(() => normalizeHistoricalPlayerWeek(row({ targets: "" }))).toThrow(/targets/);
  });

  it("keys snap joins by exact season, week, PFR identity, and normalized team", () => {
    expect(historicalSnapJoinKey(2024, 7, "HistPl00", "JAC")).toBe("2024|7|HistPl00|jax");
    expect(historicalSnapJoinKey(2024, 7, "HistPl00", "JAC")).not.toBe(
      historicalSnapJoinKey(2024, 8, "HistPl00", "JAC"),
    );
  });
});
