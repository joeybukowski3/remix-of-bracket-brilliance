import { describe, expect, it } from "vitest";
import { runPhase4WalkForwardCore, type SeasonData } from "./phase4WalkForwardCore";
import type { CfbDerivedTeamGameMetrics, CfbGarbageTimePolicyMetrics } from "../derived/types";
import type { GameObservation } from "../phase2/types";
import type { CfbResearchGame } from "../types";
import type { PriorRatings } from "../phase3/types";
import type { ScoringModelConfig } from "./types";

function game(gameId: string, season: number, week: number, home: string, away: string, homeScore: number, awayScore: number): CfbResearchGame {
  return {
    gameId, season, week, seasonType: "regular", kickoffUtc: null,
    homeExternalId: home, awayExternalId: away,
    homeTeamId: home.toLowerCase(), awayTeamId: away.toLowerCase(),
    homeConference: "conf", awayConference: "conf",
    homeClassification: "fbs", awayClassification: "fbs",
    neutralSite: false, homeScore, awayScore, status: "final", gameType: "regular",
  };
}

function policyMetrics(overrides: Partial<CfbGarbageTimePolicyMetrics> = {}): CfbGarbageTimePolicyMetrics {
  return {
    policy: "NONE", includedPlayCount: 60, totalWeight: 60,
    ypp: 5, ppp: 0.4, ppaPerPlay: 0.1, ppaCoveredPlayCount: 55, ppaCoveragePct: 90,
    ppaSuccessRate: 0.45, earlyDownPpaSuccessRate: 0.45, passingDownPpaSuccessRate: 0.4,
    downDistanceSuccessRate: 0.4, earlyDownDownDistanceSuccessRate: 0.4, passingDownDownDistanceSuccessRate: 0.35,
    explosivePlayRate: 0.1, explosivePassRate: 0.12, explosiveRushRate: 0.08, secondsPerPlay: 26,
    ...overrides,
  };
}

function teamGame(gameId: string, season: number, week: number, team: string, opponent: string, homeAwayNeutral: "home" | "away"): CfbDerivedTeamGameMetrics {
  return {
    season, week, gameId, teamExternalId: team, teamId: team.toLowerCase(),
    opponentExternalId: opponent, opponentTeamId: opponent.toLowerCase(),
    classification: "fbs", opponentClassification: "fbs", homeAwayNeutral, matchupPopulation: "fbs_vs_fbs",
    totalNormalizedPlays: 65, eligibleScrimmagePlays: 60, ppaCoveredEligiblePlays: 55, ppaCoveragePct: 90,
    identityResolutionPct: 100, metricsAvailable: true,
    situationNeutralSecondsPerPlay: 27, situationNeutralPlayCount: 30,
    policyVariants: { NONE: policyMetrics(), SCORE_QUARTER: policyMetrics(), SOFT_WEIGHT: policyMetrics(), LEVERAGE: null },
  };
}

function observationsFromGames(games: readonly CfbResearchGame[]): GameObservation[] {
  const rows: GameObservation[] = [];
  for (const g of games) {
    const homeValue = (g.homeScore ?? 0) / 10;
    const awayValue = (g.awayScore ?? 0) / 10;
    rows.push({
      gameId: g.gameId, season: g.season, week: g.week,
      teamExternalId: g.homeExternalId, opponentExternalId: g.awayExternalId,
      teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: false,
      offenseValue: homeValue, defenseAllowedValue: awayValue, weight: 1,
      actualTeamScore: g.homeScore, actualOpponentScore: g.awayScore,
    });
    rows.push({
      gameId: g.gameId, season: g.season, week: g.week,
      teamExternalId: g.awayExternalId, opponentExternalId: g.homeExternalId,
      teamClassification: "fbs", opponentClassification: "fbs", isHome: false, isNeutral: false,
      offenseValue: awayValue, defenseAllowedValue: homeValue, weight: 1,
      actualTeamScore: g.awayScore, actualOpponentScore: g.homeScore,
    });
  }
  return rows;
}

const SEASON_2020_GAMES = [
  game("g1", 2020, 1, "A", "B", 30, 10),
  game("g2", 2020, 1, "C", "D", 20, 17),
  game("g3", 2020, 2, "A", "C", 24, 21),
  game("g4", 2020, 2, "B", "D", 14, 13),
  game("g5", 2020, 3, "A", "D", 40, 6),
  game("g6", 2020, 3, "B", "C", 21, 20),
];

function teamGamesFromGames(games: readonly CfbResearchGame[]): CfbDerivedTeamGameMetrics[] {
  return games.flatMap((g) => [
    teamGame(g.gameId, g.season, g.week, g.homeExternalId, g.awayExternalId, "home"),
    teamGame(g.gameId, g.season, g.week, g.awayExternalId, g.homeExternalId, "away"),
  ]);
}

const PRIORS_2020: Map<string, PriorRatings> = new Map(
  ["A", "B", "C", "D"].map((t, i) => [t, { teamExternalId: t, priorOffense: 1 - i * 0.5, priorDefense: 0.5 - i * 0.3, offenseTier: "PRIOR_D", defenseTier: "PRIOR_D" }]),
);

function buildSeasonData(games: readonly CfbResearchGame[], priors: Map<string, PriorRatings> | undefined): SeasonData {
  return {
    games,
    teamGames: teamGamesFromGames(games),
    observationsByMetric: new Map([
      ["ypp", observationsFromGames(games)],
      ["ppp", observationsFromGames(games)],
    ]),
    priors,
  };
}

const CONFIG: ScoringModelConfig = {
  hfa: "NATIONAL",
  scoringEnvironment: "BLENDED_CURRENT",
  pace: "NONE",
  secondary: [],
  lambda: 2,
  priorGamesWeight: 8,
};

describe("runPhase4WalkForwardCore — leakage tests", () => {
  it("Week N+1 results cannot alter a Week N prediction", () => {
    const seasonData = new Map([[2020, buildSeasonData(SEASON_2020_GAMES, PRIORS_2020)]]);
    const before = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData });
    const week2Before = before.find((p) => p.gameId === "g3");

    const extraWeek3 = game("g7", 2020, 3, "D", "A", 3, 60);
    const gamesAfter = [...SEASON_2020_GAMES, extraWeek3];
    const seasonDataAfter = new Map([[2020, buildSeasonData(gamesAfter, PRIORS_2020)]]);
    const after = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData: seasonDataAfter });
    const week2After = after.find((p) => p.gameId === "g3");

    expect(week2After?.expectedHomePoints).toBe(week2Before?.expectedHomePoints);
    expect(week2After?.expectedAwayPoints).toBe(week2Before?.expectedAwayPoints);
  });

  it("a future season's scoring environment cannot alter an earlier season's prediction", () => {
    const seasonDataOnly2020 = new Map([[2020, buildSeasonData(SEASON_2020_GAMES, PRIORS_2020)]]);
    const only2020 = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData: seasonDataOnly2020 });
    const week1_2020 = only2020.find((p) => p.gameId === "g1");

    const futureGames = [game("g8", 2021, 1, "A", "D", 90, 0)]; // dramatic future scoring
    const seasonDataWithFuture = new Map([
      [2020, buildSeasonData(SEASON_2020_GAMES, PRIORS_2020)],
      [2021, buildSeasonData(futureGames, PRIORS_2020)],
    ]);
    const withFuture = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData: seasonDataWithFuture });
    const week1_2020_withFuture = withFuture.find((p) => p.gameId === "g1");

    expect(week1_2020_withFuture?.expectedHomePoints).toBe(week1_2020?.expectedHomePoints);
  });

  it("projected total and margin identities hold exactly by construction", () => {
    const seasonData = new Map([[2020, buildSeasonData(SEASON_2020_GAMES, PRIORS_2020)]]);
    const predictions = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData });
    for (const p of predictions) {
      if (p.expectedHomePoints === null || p.expectedAwayPoints === null) continue;
      expect(p.projectedTotal).toBeCloseTo(p.expectedHomePoints + p.expectedAwayPoints, 10);
      expect(p.projectedMargin).toBeCloseTo(p.expectedHomePoints - p.expectedAwayPoints, 10);
    }
  });

  it("produces no NaN or Infinity anywhere in the predictions", () => {
    const seasonData = new Map([[2020, buildSeasonData(SEASON_2020_GAMES, PRIORS_2020)]]);
    const predictions = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData });
    for (const p of predictions) {
      for (const field of [p.expectedHomePoints, p.expectedAwayPoints, p.projectedMargin, p.projectedTotal]) {
        if (field === null) continue;
        expect(Number.isFinite(field)).toBe(true);
      }
    }
  });

  it("is deterministic — identical inputs produce identical output", () => {
    const seasonData1 = new Map([[2020, buildSeasonData(SEASON_2020_GAMES, PRIORS_2020)]]);
    const seasonData2 = new Map([[2020, buildSeasonData(SEASON_2020_GAMES, PRIORS_2020)]]);
    const run1 = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData: seasonData1 });
    const run2 = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData: seasonData2 });
    expect(run1).toEqual(run2);
  });

  it("a season with no trainable prior produces zero predictions rather than fabricated ones", () => {
    const seasonData = new Map([[2020, buildSeasonData(SEASON_2020_GAMES, undefined)]]);
    const predictions = runPhase4WalkForwardCore({ scoringConfig: CONFIG, testSeasons: [2020], seasonData });
    expect(predictions).toHaveLength(0);
  });
});
