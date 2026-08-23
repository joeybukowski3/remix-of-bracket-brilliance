import { describe, expect, it } from "vitest";
import {
  OPPONENT_FPA_PRIOR_STRENGTH,
  SCORING_ENVIRONMENT_POLICY,
  OPPONENT_FPA_POLICY,
  computeOpponentFpaContext,
  computeScoringEnvironmentContext,
  leagueAverageBlendedOpponentFpa,
  leagueAverageImpliedTeamTotal,
  resolveTeamImpliedTotal,
} from "./context";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";

function market(overrides: Partial<MarketCurrentGame> & { gameId: string; homeAbbr: string; awayAbbr: string }): MarketCurrentGame {
  return {
    season: 2026, week: 1, seasonType: "REG", neutralSite: false,
    spread: { home: 0, away: 0 }, moneyline: { home: null, away: null }, total: 44, rawSpreadLine: 0,
    ...overrides,
  };
}

function historyRow(overrides: Partial<HistoricalPlayerWeek> & { season: number; week: number; opponent: string; position: HistoricalPlayerWeek["position"] }): HistoricalPlayerWeek {
  return {
    playerId: `gsis:${overrides.opponent}-${overrides.week}-${Math.random()}`,
    playerName: "Test Player", team: "buf",
    externalIds: { gsis: "0", pfr: null, espn: null },
    actualFantasyPoints: 10,
    stats: {
      passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
      rushAttempts: 0, rushingYards: 0, rushingTouchdowns: 0, receptions: 0, targets: 0,
      receivingYards: 0, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0,
      receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0, rushingTwoPointConversions: 0,
      receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0,
    },
    usage: { targetShare: null, receivingAirYards: null, airYardsShare: null },
    provenance: { source: "nflverse stats_player weekly", sourceSeason: overrides.season, sourceWeek: overrides.week, scoringVersion: "jkb-full-ppr-v1.0.0", snapSource: null },
    ...overrides,
  };
}

describe("computeScoringEnvironmentContext", () => {
  const currentMarket: Record<string, MarketCurrentGame> = {
    "2026_01_HOU_BUF": market({ gameId: "2026_01_HOU_BUF", homeAbbr: "buf", awayAbbr: "hou", spread: { home: -7, away: 7 }, total: 50 }),
    "2026_01_MIA_NYJ": market({ gameId: "2026_01_MIA_NYJ", homeAbbr: "nyj", awayAbbr: "mia", spread: { home: 0, away: 0 }, total: 38 }),
  };

  it("is neutral (0, unavailable) with no market data", () => {
    const result = computeScoringEnvironmentContext("QB", null, 2026, 1, "buf");
    expect(result.marketContextAvailable).toBe(false);
    expect(result.scoringEnvironmentAdjustment).toBe(0);
    expect(result.impliedTotalDelta).toBeNull();
  });

  it("is neutral when the team has no priced game", () => {
    const result = computeScoringEnvironmentContext("QB", currentMarket, 2026, 1, "kc");
    expect(result.marketContextAvailable).toBe(false);
    expect(result.scoringEnvironmentAdjustment).toBe(0);
  });

  it("gives a positive adjustment to a team with an above-average implied total", () => {
    // buf: (50 - (-7))/2 = 28.5 implied. League avg across 4 team-sides: (28.5+21.5+19+19)/4 = 22.
    const result = computeScoringEnvironmentContext("QB", currentMarket, 2026, 1, "buf");
    expect(result.marketContextAvailable).toBe(true);
    expect(result.teamImpliedTotal).toBeCloseTo(28.5, 5);
    expect(result.impliedTotalDelta!).toBeGreaterThan(0);
    expect(result.scoringEnvironmentAdjustment).toBeGreaterThan(0);
  });

  it("gives a negative adjustment to a team with a below-average implied total", () => {
    const result = computeScoringEnvironmentContext("QB", currentMarket, 2026, 1, "hou");
    expect(result.impliedTotalDelta!).toBeLessThan(0);
    expect(result.scoringEnvironmentAdjustment).toBeLessThan(0);
  });

  it("enforces the position cap even at an extreme implied-total delta", () => {
    const extreme: Record<string, MarketCurrentGame> = {
      g1: market({ gameId: "g1", homeAbbr: "buf", awayAbbr: "hou", spread: { home: -20, away: 20 }, total: 60 }),
    };
    const result = computeScoringEnvironmentContext("QB", extreme, 2026, 1, "buf");
    expect(Math.abs(result.scoringEnvironmentAdjustment)).toBeLessThanOrEqual(SCORING_ENVIRONMENT_POLICY.QB.capPoints);
  });

  it("uses separate coefficients per position for the same delta", () => {
    const delta = 5;
    const qb = SCORING_ENVIRONMENT_POLICY.QB.coefficient * delta;
    const rb = SCORING_ENVIRONMENT_POLICY.RB.coefficient * delta;
    expect(qb).not.toBeCloseTo(rb, 5);
  });

  it("league average implied team total averages both sides of every priced REG game", () => {
    const avg = leagueAverageImpliedTeamTotal(currentMarket, 2026, 1);
    expect(avg).toBeCloseTo((28.5 + 21.5 + 19 + 19) / 4, 5);
  });

  it("resolves a team's implied total from either side of the matchup", () => {
    expect(resolveTeamImpliedTotal(currentMarket, 2026, 1, "hou")).toBeCloseTo(21.5, 5);
    expect(resolveTeamImpliedTotal(currentMarket, 2026, 1, "mia")).toBeCloseTo(19, 5);
  });
});

describe("computeOpponentFpaContext", () => {
  it("is neutral when both prior and current season FPA are missing", () => {
    const result = computeOpponentFpaContext("WR", 12, {
      priorSeasonFpa: null, currentSeasonFpa: null, currentSeasonGames: 0, leagueAverageFpa: 30,
    });
    expect(result.opponentFpaBlended).toBeNull();
    expect(result.opponentFpaRatio).toBeNull();
    expect(result.opponentFpaAdjustment).toBe(0);
    expect(result.fallbackReason).toBe("missing-both-neutral");
  });

  it("falls back to neutral (ratio 1, adjustment 0) when only prior season is missing", () => {
    const result = computeOpponentFpaContext("WR", 12, {
      priorSeasonFpa: null, currentSeasonFpa: 40, currentSeasonGames: 2, leagueAverageFpa: 30,
    });
    expect(result.opponentFpaRatio).toBe(1);
    expect(result.opponentFpaAdjustment).toBe(0);
    expect(result.fallbackReason).toBe("missing-prior-season-neutral");
  });

  it("Week 1: uses 2025-only FPA when current season has zero games", () => {
    const result = computeOpponentFpaContext("WR", 12, {
      priorSeasonFpa: 40, currentSeasonFpa: null, currentSeasonGames: 0, leagueAverageFpa: 30,
    });
    expect(result.opponentFpaBlended).toBe(40);
    expect(result.opponentFpaCurrentSeasonWeight).toBe(0);
    expect(result.opponentFpaPriorSeasonWeight).toBe(1);
    expect(result.fallbackReason).toBe("current-season-missing-use-prior");
    expect(result.opponentFpaRatio).toBeCloseTo(40 / 30, 5);
    expect(result.opponentFpaAdjustment).toBeGreaterThan(0); // favorable (allows more) matchup
  });

  it("blends with a 1-game current season using the shrinkage formula (PRIOR_STRENGTH weighting)", () => {
    expect(OPPONENT_FPA_PRIOR_STRENGTH).toBe(4);
    const result = computeOpponentFpaContext("RB", 12, {
      priorSeasonFpa: 20, currentSeasonFpa: 30, currentSeasonGames: 1, leagueAverageFpa: 20,
    });
    // currentWeight = 1/(1+4) = 0.2
    expect(result.opponentFpaCurrentSeasonWeight).toBeCloseTo(0.2, 5);
    expect(result.opponentFpaPriorSeasonWeight).toBeCloseTo(0.8, 5);
    expect(result.opponentFpaBlended).toBeCloseTo(0.2 * 30 + 0.8 * 20, 5);
  });

  it("current-season weight increases monotonically and prior-season weight decreases monotonically with games played", () => {
    const games = [0, 1, 2, 4, 8, 12, 17];
    const weights = games.map((g) => computeOpponentFpaContext("RB", 12, {
      priorSeasonFpa: 20, currentSeasonFpa: 20, currentSeasonGames: g, leagueAverageFpa: 20,
    }));
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i].opponentFpaCurrentSeasonWeight).toBeGreaterThan(weights[i - 1].opponentFpaCurrentSeasonWeight);
      expect(weights[i].opponentFpaPriorSeasonWeight).toBeLessThan(weights[i - 1].opponentFpaPriorSeasonWeight);
    }
    // matches the documented example table for PRIOR_STRENGTH = 4
    expect(weights[3].opponentFpaCurrentSeasonWeight).toBeCloseTo(0.5, 5); // 4 games
    expect(weights[4].opponentFpaCurrentSeasonWeight).toBeCloseTo(2 / 3, 5); // 8 games
  });

  it("produces a positive adjustment for a favorable (high-FPA) defense and negative for a tough one", () => {
    const favorable = computeOpponentFpaContext("RB", 12, {
      priorSeasonFpa: 26, currentSeasonFpa: null, currentSeasonGames: 0, leagueAverageFpa: 20,
    });
    const tough = computeOpponentFpaContext("RB", 12, {
      priorSeasonFpa: 14, currentSeasonFpa: null, currentSeasonGames: 0, leagueAverageFpa: 20,
    });
    expect(favorable.opponentFpaAdjustment).toBeGreaterThan(0);
    expect(tough.opponentFpaAdjustment).toBeLessThan(0);
  });

  it("enforces the position cap at an extreme FPA ratio", () => {
    const result = computeOpponentFpaContext("QB", 30, {
      priorSeasonFpa: 100, currentSeasonFpa: null, currentSeasonGames: 0, leagueAverageFpa: 20,
    });
    expect(Math.abs(result.opponentFpaAdjustment)).toBeLessThanOrEqual(OPPONENT_FPA_POLICY.QB.capPoints);
  });

  it("cannot move an elite player below a mediocre one solely from matchup context", () => {
    const eliteBaseline = 25;
    const mediocreBaseline = 10;
    const eliteVsToughDefense = computeOpponentFpaContext("WR", eliteBaseline, {
      priorSeasonFpa: 5, currentSeasonFpa: null, currentSeasonGames: 0, leagueAverageFpa: 20,
    });
    const mediocreVsFavorableDefense = computeOpponentFpaContext("WR", mediocreBaseline, {
      priorSeasonFpa: 100, currentSeasonFpa: null, currentSeasonGames: 0, leagueAverageFpa: 20,
    });
    const eliteFinal = eliteBaseline + eliteVsToughDefense.opponentFpaAdjustment;
    const mediocreFinal = mediocreBaseline + mediocreVsFavorableDefense.opponentFpaAdjustment;
    expect(eliteFinal).toBeGreaterThan(mediocreFinal);
  });
});

describe("leagueAverageBlendedOpponentFpa", () => {
  it("returns null with no relevant history", () => {
    expect(leagueAverageBlendedOpponentFpa([], 2026, 1, "WR")).toBeNull();
  });

  it("averages each opponent's own blended value", () => {
    const history: HistoricalPlayerWeek[] = [
      historyRow({ season: 2025, week: 1, opponent: "hou", position: "WR", actualFantasyPoints: 20 }),
      historyRow({ season: 2025, week: 1, opponent: "mia", position: "WR", actualFantasyPoints: 10 }),
    ];
    const avg = leagueAverageBlendedOpponentFpa(history, 2026, 1, "WR");
    expect(avg).toBeCloseTo(15, 5);
  });

  it("is position-specific", () => {
    const history: HistoricalPlayerWeek[] = [
      historyRow({ season: 2025, week: 1, opponent: "hou", position: "WR", actualFantasyPoints: 20 }),
      historyRow({ season: 2025, week: 1, opponent: "hou", position: "RB", actualFantasyPoints: 8 }),
    ];
    expect(leagueAverageBlendedOpponentFpa(history, 2026, 1, "WR")).toBeCloseTo(20, 5);
    expect(leagueAverageBlendedOpponentFpa(history, 2026, 1, "RB")).toBeCloseTo(8, 5);
  });

  it("never includes the target week or later (no leakage)", () => {
    const history: HistoricalPlayerWeek[] = [
      historyRow({ season: 2025, week: 1, opponent: "hou", position: "WR", actualFantasyPoints: 15 }),
      historyRow({ season: 2026, week: 1, opponent: "hou", position: "WR", actualFantasyPoints: 20 }),
      historyRow({ season: 2026, week: 2, opponent: "hou", position: "WR", actualFantasyPoints: 999 }),
    ];
    // Target week 2: only week 1 (< 2) may contribute to the current-season component.
    const avg = leagueAverageBlendedOpponentFpa(history, 2026, 2, "WR");
    expect(avg).not.toBeNull();
    expect(avg).toBeLessThan(999);
  });
});
