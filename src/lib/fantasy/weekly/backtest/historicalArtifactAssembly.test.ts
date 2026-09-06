import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import {
  adaptStatsPlayerWeekRow,
  buildHomeAwayLookup,
  computeAppearanceHistory,
} from "@/lib/fantasy/weekly/backtest/historicalArtifactAssembly";

function playerWeek(overrides: Partial<HistoricalPlayerWeek> & { season: number; week: number; played: boolean }): HistoricalPlayerWeek {
  return {
    season: overrides.season,
    week: overrides.week,
    playerId: "gsis:00-0000001",
    playerName: "Test Player",
    position: "WR",
    team: "sf",
    opponent: "sea",
    externalIds: { gsis: "00-0000001", pfr: null, espn: null },
    actualFantasyPoints: overrides.played ? 12.3 : 0,
    stats: {
      passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
      rushAttempts: 0, rushingYards: 0, rushingTouchdowns: 0, receptions: 0, targets: 0,
      receivingYards: 0, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0,
      receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0,
      rushingTwoPointConversions: 0, receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0,
    },
    usage: {
      offensiveSnaps: null, snapShare: null, passAttempts: null, completions: null, rushAttempts: null,
      targets: null, receptions: null, receivingAirYards: null, targetShare: null, airYardsShare: null,
      routes: null, routeParticipation: null, redZoneTouches: null, goalLineTouches: null, redZoneTargets: null,
    },
    provenance: {
      source: overrides.played ? "nflverse stats_player weekly" : "nflverse weekly roster eligible zero",
      sourceSeason: overrides.season,
      sourceWeek: overrides.week,
      scoringVersion: "jkb-full-ppr-v1.0.0",
      snapSource: null,
    },
    ...overrides,
  };
}

describe("adaptStatsPlayerWeekRow", () => {
  it("renames stats_player release column names to the shape normalizeHistoricalPlayerWeek expects", () => {
    const adapted = adaptStatsPlayerWeekRow({
      team: "kc",
      passing_interceptions: "2",
      season: "2024",
      week: "5",
    });
    expect(adapted.recent_team).toBe("kc");
    expect(adapted.interceptions).toBe("2");
    // Original columns are preserved alongside the renamed aliases.
    expect(adapted.team).toBe("kc");
    expect(adapted.passing_interceptions).toBe("2");
  });
});

describe("buildHomeAwayLookup", () => {
  it("marks the home team home and the away team away for a normal site game", () => {
    const lookup = buildHomeAwayLookup([{ season: 2024, week: 3, awayTeam: "sea", homeTeam: "sf", neutral: false }]);
    expect(lookup.get("2024|3|sf")).toBe("home");
    expect(lookup.get("2024|3|sea")).toBe("away");
  });

  it("marks both teams neutral for a neutral-site game", () => {
    const lookup = buildHomeAwayLookup([{ season: 2024, week: 6, awayTeam: "jax", homeTeam: "chi", neutral: true }]);
    expect(lookup.get("2024|6|chi")).toBe("neutral");
    expect(lookup.get("2024|6|jax")).toBe("neutral");
  });

  it("has no entry for a team-week that never appears in the schedule (a bye)", () => {
    const lookup = buildHomeAwayLookup([{ season: 2024, week: 3, awayTeam: "sea", homeTeam: "sf", neutral: false }]);
    expect(lookup.get("2024|3|kc")).toBeUndefined();
  });
});

describe("computeAppearanceHistory", () => {
  it("reports zero prior games and null weeksSinceLastAppearance for a player's first eligible week", () => {
    const target = { season: 2023, week: 1 };
    const history = [playerWeek({ season: 2023, week: 1, played: true })];
    const result = computeAppearanceHistory(target, history);
    expect(result.appearanceState).toBe("played");
    expect(result.priorGamesCount).toBe(0);
    expect(result.eligibleWeeksCount).toBe(1);
    expect(result.weeksSinceLastAppearance).toBeNull();
  });

  it("counts only appearances strictly before the target week as priorGamesCount", () => {
    const target = { season: 2023, week: 4 };
    const history = [
      playerWeek({ season: 2023, week: 1, played: true }),
      playerWeek({ season: 2023, week: 2, played: false }),
      playerWeek({ season: 2023, week: 3, played: true }),
      playerWeek({ season: 2023, week: 4, played: true }),
    ];
    const result = computeAppearanceHistory(target, history);
    expect(result.priorGamesCount).toBe(2);
    expect(result.eligibleWeeksCount).toBe(4);
    expect(result.weeksSinceLastAppearance).toBe(1);
  });

  it("never counts a future week's appearance toward weeksSinceLastAppearance (no leakage)", () => {
    const target = { season: 2023, week: 3 };
    const history = [
      playerWeek({ season: 2023, week: 1, played: false }),
      playerWeek({ season: 2023, week: 3, played: false }),
      playerWeek({ season: 2023, week: 5, played: true }),
    ];
    const result = computeAppearanceHistory(target, history);
    expect(result.weeksSinceLastAppearance).toBeNull();
    expect(result.priorGamesCount).toBe(0);
  });

  it("returns eligible-no-stats for a rostered player with no recorded stat row that week", () => {
    const target = { season: 2023, week: 2 };
    const history = [playerWeek({ season: 2023, week: 2, played: false })];
    const result = computeAppearanceHistory(target, history);
    expect(result.appearanceState).toBe("eligible-no-stats");
  });

  it("computes weeksSinceLastAppearance across a season boundary using an 18-week year length", () => {
    const target = { season: 2024, week: 1 };
    const history = [playerWeek({ season: 2023, week: 17, played: true })];
    const result = computeAppearanceHistory(target, history);
    expect(result.weeksSinceLastAppearance).toBe(2);
  });
});
