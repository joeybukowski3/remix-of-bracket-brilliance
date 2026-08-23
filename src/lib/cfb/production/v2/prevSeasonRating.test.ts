import { describe, expect, it } from "vitest";
import { computeCfbV2PrevSeasonRatings, CFB_V2_PREV_SEASON_RATING_CONFIG } from "./prevSeasonRating";
import type { CfbNormalizedHistoricalGame, CfbTeamGamePerformance } from "../../pipeline/types";

const TEAMS = ["alpha", "bravo", "charlie", "delta"];

function game(id: string, home: string, away: string): CfbNormalizedHistoricalGame {
  return {
    gameId: id,
    season: 2025,
    week: 1,
    date: "2025-09-05",
    homeTeamId: home,
    awayTeamId: away,
    homeExternalOpponentId: null,
    awayExternalOpponentId: null,
    homeScore: 30,
    awayScore: 20,
    neutralSite: false,
    completed: true,
    status: "final",
    seasonType: "regular",
    gameType: "regular",
    homeClassification: "fbs",
    awayClassification: "fbs",
    includesFcsOpponent: false,
  };
}

function perf(gameId: string, teamId: string, opponentTeamId: string, points: number, plays: number, ypp: number, yppAllowed: number): CfbTeamGamePerformance {
  return { gameId, teamId, teamClassification: "fbs", opponentTeamId, opponentClassification: "fbs", points, pointsAllowed: null, plays, totalYards: null, yardsPerPlay: ypp, yardsPerPlayAllowed: yppAllowed, turnovers: null };
}

describe("computeCfbV2PrevSeasonRatings", () => {
  it("uses the frozen strength=1.0 / iterations=20 / YPP+PPP config", () => {
    expect(CFB_V2_PREV_SEASON_RATING_CONFIG.strength).toBe(1.0);
    expect(CFB_V2_PREV_SEASON_RATING_CONFIG.iterations).toBe(20);
    expect(CFB_V2_PREV_SEASON_RATING_CONFIG.metrics).toEqual(["ypp", "ppp"]);
  });

  it("produces a standardized-and-averaged rating for teams with games, omits teams with none", () => {
    const games = [game("g1", "alpha", "bravo"), game("g2", "charlie", "delta")];
    const performances = [
      perf("g1", "alpha", "bravo", 30, 60, 6.5, 5.0),
      perf("g1", "bravo", "alpha", 20, 55, 5.0, 6.5),
      perf("g2", "charlie", "delta", 24, 58, 5.8, 5.6),
      perf("g2", "delta", "charlie", 22, 57, 5.6, 5.8),
    ];
    const result = computeCfbV2PrevSeasonRatings(TEAMS, performances, games);
    expect(result.has("alpha")).toBe(true);
    expect(result.has("bravo")).toBe(true);
    expect(Number.isFinite(result.get("alpha")!.offense)).toBe(true);
    expect(Number.isFinite(result.get("alpha")!.defense)).toBe(true);
  });

  it("omits a team with zero completed games from the map (never fabricates a rating)", () => {
    const result = computeCfbV2PrevSeasonRatings(TEAMS, [], []);
    expect(result.size).toBe(0);
  });

  it("is deterministic for identical inputs", () => {
    const games = [game("g1", "alpha", "bravo")];
    const performances = [perf("g1", "alpha", "bravo", 30, 60, 6.5, 5.0), perf("g1", "bravo", "alpha", 20, 55, 5.0, 6.5)];
    const first = computeCfbV2PrevSeasonRatings(TEAMS, performances, games);
    const second = computeCfbV2PrevSeasonRatings(TEAMS, performances, games);
    expect(JSON.stringify([...first])).toBe(JSON.stringify([...second]));
  });
});
