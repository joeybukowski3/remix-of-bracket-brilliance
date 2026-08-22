import { describe, expect, it } from "vitest";
import { runPhase3WalkForwardCore } from "./phase3WalkForwardCore";
import type { GameObservation } from "../phase2/types";
import type { CfbResearchGame } from "../types";
import type { PriorRatings } from "./types";

function game(gameId: string, season: number, week: number, home: string, away: string, homeScore: number, awayScore: number): CfbResearchGame {
  return {
    gameId,
    season,
    week,
    seasonType: "regular",
    kickoffUtc: null,
    homeExternalId: home,
    awayExternalId: away,
    homeTeamId: home.toLowerCase(),
    awayTeamId: away.toLowerCase(),
    homeConference: "conf",
    awayConference: "conf",
    homeClassification: "fbs",
    awayClassification: "fbs",
    neutralSite: false,
    homeScore,
    awayScore,
    status: "final",
    gameType: "regular",
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
      teamClassification: "fbs", opponentClassification: "fbs",
      isHome: true, isNeutral: false,
      offenseValue: homeValue, defenseAllowedValue: awayValue,
      weight: 1, actualTeamScore: g.homeScore, actualOpponentScore: g.awayScore,
    });
    rows.push({
      gameId: g.gameId, season: g.season, week: g.week,
      teamExternalId: g.awayExternalId, opponentExternalId: g.homeExternalId,
      teamClassification: "fbs", opponentClassification: "fbs",
      isHome: false, isNeutral: false,
      offenseValue: awayValue, defenseAllowedValue: homeValue,
      weight: 1, actualTeamScore: g.awayScore, actualOpponentScore: g.homeScore,
    });
  }
  return rows;
}

const SEASON_2020_GAMES = [
  game("g2001", 2020, 1, "A", "B", 30, 10),
  game("g2002", 2020, 1, "C", "D", 20, 17),
  game("g2003", 2020, 2, "A", "C", 24, 21),
  game("g2004", 2020, 2, "B", "D", 14, 13),
  game("g2005", 2020, 3, "A", "D", 40, 6),
  game("g2006", 2020, 3, "B", "C", 21, 20),
];

const PRIORS_2020: Map<string, PriorRatings> = new Map([
  ["A", { teamExternalId: "A", priorOffense: 1.5, priorDefense: 1.0, offenseTier: "PRIOR_D", defenseTier: "PRIOR_D" }],
  ["B", { teamExternalId: "B", priorOffense: 0.2, priorDefense: 0.1, offenseTier: "PRIOR_D", defenseTier: "PRIOR_D" }],
  ["C", { teamExternalId: "C", priorOffense: -0.3, priorDefense: -0.2, offenseTier: "PRIOR_D", defenseTier: "PRIOR_D" }],
  ["D", { teamExternalId: "D", priorOffense: -1.0, priorDefense: -0.8, offenseTier: "PRIOR_D", defenseTier: "PRIOR_D" }],
]);

function buildInputs(extraWeek3: ReturnType<typeof game>[] = []) {
  const games = [...SEASON_2020_GAMES.filter((g) => g.week !== 3), ...SEASON_2020_GAMES.filter((g) => g.week === 3), ...extraWeek3];
  const gamesBySeason = new Map([[2020, games]]);
  const observationsByMetricAndSeason = new Map([
    ["ypp" as const, new Map([[2020, observationsFromGames(games)]])],
  ]);
  const priorsBySeason = new Map([[2020, PRIORS_2020]]);
  return { gamesBySeason, observationsByMetricAndSeason, priorsBySeason };
}

describe("runPhase3WalkForwardCore — leakage tests", () => {
  it("Week N prediction is unchanged when Week N+1 data is added", () => {
    const before = runPhase3WalkForwardCore({
      method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
      metricSet: ["ypp"],
      testSeasons: [2020],
      ...buildInputs(),
    });
    const week2Before = before.find((p) => p.gameId === "g2003");

    const after = runPhase3WalkForwardCore({
      method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
      metricSet: ["ypp"],
      testSeasons: [2020],
      ...buildInputs([game("g2007", 2020, 3, "D", "A", 3, 50)]),
    });
    const week2After = after.find((p) => p.gameId === "g2003");

    expect(week2After?.predictedMargin).toBe(week2Before?.predictedMargin);
  });

  it("a future season's priors/games cannot alter an earlier season's predictions", () => {
    const only2020 = runPhase3WalkForwardCore({
      method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
      metricSet: ["ypp"],
      testSeasons: [2020],
      ...buildInputs(),
    });
    const week1_2020 = only2020.find((p) => p.gameId === "g2001");

    const gamesBySeason = new Map([
      [2020, SEASON_2020_GAMES],
      [2021, [game("g2101", 2021, 1, "A", "D", 70, 0)]],
    ]);
    const observationsByMetricAndSeason = new Map([
      ["ypp" as const, new Map([
        [2020, observationsFromGames(SEASON_2020_GAMES)],
        [2021, observationsFromGames([game("g2101", 2021, 1, "A", "D", 70, 0)])],
      ])],
    ]);
    const priorsBySeason = new Map([
      [2020, PRIORS_2020],
      [2021, PRIORS_2020], // reuse for simplicity — content doesn't matter, presence does
    ]);
    const withFutureLoaded = runPhase3WalkForwardCore({
      method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
      metricSet: ["ypp"],
      testSeasons: [2020], // 2021 intentionally not requested
      gamesBySeason,
      observationsByMetricAndSeason,
      priorsBySeason,
    });
    const week1_2020_withFuture = withFutureLoaded.find((p) => p.gameId === "g2001");

    expect(week1_2020_withFuture?.predictedMargin).toBe(week1_2020?.predictedMargin);
  });

  it("the very first evaluated season's week 1 has no fallback calibration and is skipped (not fabricated)", () => {
    const predictions = runPhase3WalkForwardCore({
      method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
      metricSet: ["ypp"],
      testSeasons: [2020],
      ...buildInputs(),
    });
    expect(predictions.some((p) => p.week === 1)).toBe(false);
    expect(predictions.some((p) => p.week === 2)).toBe(true); // week 2 has real within-season training games
  });

  it("a later season's week 1 DOES get a prediction, using the prior season's carried-forward calibration", () => {
    const gamesBySeason = new Map([
      [2020, SEASON_2020_GAMES],
      [2021, [game("g2101", 2021, 1, "A", "D", 20, 10)]],
    ]);
    const observationsByMetricAndSeason = new Map([
      ["ypp" as const, new Map([
        [2020, observationsFromGames(SEASON_2020_GAMES)],
        [2021, observationsFromGames([game("g2101", 2021, 1, "A", "D", 20, 10)])],
      ])],
    ]);
    const priorsBySeason = new Map([
      [2020, PRIORS_2020],
      [2021, PRIORS_2020],
    ]);
    const predictions = runPhase3WalkForwardCore({
      method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
      metricSet: ["ypp"],
      testSeasons: [2020, 2021],
      gamesBySeason,
      observationsByMetricAndSeason,
      priorsBySeason,
    });
    const week1_2021 = predictions.find((p) => p.season === 2021 && p.week === 1);
    expect(week1_2021?.predictedMargin).not.toBeNull();
  });

  it("a team with no prior entry falls back to a current-only estimate without throwing", () => {
    const priorsBySeason = new Map([[2020, new Map<string, PriorRatings>()]]); // empty priors map
    const { gamesBySeason, observationsByMetricAndSeason } = buildInputs();
    expect(() =>
      runPhase3WalkForwardCore({
        method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
        metricSet: ["ypp"],
        testSeasons: [2020],
        gamesBySeason,
        observationsByMetricAndSeason,
        priorsBySeason,
      }),
    ).not.toThrow();
  });
});
