import { describe, expect, it } from "vitest";
import { runWalkForwardCore } from "./walkForwardCore";
import type { GameObservation } from "./types";
import type { CfbResearchGame } from "../types";

const TEAMS = ["A", "B", "C", "D"];

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
      gameId: g.gameId,
      season: g.season,
      week: g.week,
      teamExternalId: g.homeExternalId,
      opponentExternalId: g.awayExternalId,
      teamClassification: "fbs",
      opponentClassification: "fbs",
      isHome: true,
      isNeutral: false,
      offenseValue: homeValue,
      defenseAllowedValue: awayValue,
      weight: 1,
      actualTeamScore: g.homeScore,
      actualOpponentScore: g.awayScore,
    });
    rows.push({
      gameId: g.gameId,
      season: g.season,
      week: g.week,
      teamExternalId: g.awayExternalId,
      opponentExternalId: g.homeExternalId,
      teamClassification: "fbs",
      opponentClassification: "fbs",
      isHome: false,
      isNeutral: false,
      offenseValue: awayValue,
      defenseAllowedValue: homeValue,
      weight: 1,
      actualTeamScore: g.awayScore,
      actualOpponentScore: g.homeScore,
    });
  }
  return rows;
}

// Two seasons, several weeks, small round-robin-ish slate.
const SEASON_2018_GAMES = [
  game("g1801", 2018, 1, "A", "B", 30, 10),
  game("g1802", 2018, 1, "C", "D", 20, 17),
  game("g1803", 2018, 2, "A", "C", 24, 21),
  game("g1804", 2018, 2, "B", "D", 14, 13),
];
const SEASON_2019_GAMES = [
  game("g1901", 2019, 1, "A", "D", 28, 7),
  game("g1902", 2019, 1, "B", "C", 17, 20),
  game("g1903", 2019, 2, "A", "B", 35, 3),
  game("g1904", 2019, 2, "C", "D", 10, 9),
  game("g1905", 2019, 3, "A", "C", 40, 6),
  game("g1906", 2019, 3, "B", "D", 21, 20),
];

function buildInputs(extraSeason3Games: CfbResearchGame[] = []) {
  const gamesBySeason = new Map([
    [2018, SEASON_2018_GAMES],
    [2019, [...SEASON_2019_GAMES, ...extraSeason3Games]],
  ]);
  const observationsByMetricAndSeason = new Map([
    [
      "ypp" as const,
      new Map([
        [2018, observationsFromGames(SEASON_2018_GAMES)],
        [2019, observationsFromGames([...SEASON_2019_GAMES, ...extraSeason3Games])],
      ]),
    ],
  ]);
  return { gamesBySeason, observationsByMetricAndSeason };
}

const METHOD_CONFIG = { method: "ITERATIVE" as const, config: { strength: 0.2, iterations: 6, minimumGames: 1 } };

describe("runWalkForwardCore — leakage tests", () => {
  it("Week N prediction is unchanged when Week N+1 data is added", () => {
    const before = runWalkForwardCore({
      methodConfig: METHOD_CONFIG,
      metricSet: ["ypp"],
      warmStartSeason: 2018,
      testSeasons: [2018, 2019],
      ...buildInputs(),
    });
    const week2Before = before.find((p) => p.season === 2019 && p.week === 2 && p.gameId === "g1903");

    const extraWeek3 = [game("g1907", 2019, 3, "D", "A", 3, 45)]; // a dramatic week-3 result
    const after = runWalkForwardCore({
      methodConfig: METHOD_CONFIG,
      metricSet: ["ypp"],
      warmStartSeason: 2018,
      testSeasons: [2018, 2019],
      ...buildInputs(extraWeek3),
    });
    const week2After = after.find((p) => p.season === 2019 && p.week === 2 && p.gameId === "g1903");

    expect(week2After?.predictedMargin).toBe(week2Before?.predictedMargin);
    expect(week2After?.ratingDifferential).toBe(week2Before?.ratingDifferential);
  });

  it("a future season's results cannot alter an earlier season's predictions", () => {
    const only2019 = runWalkForwardCore({
      methodConfig: METHOD_CONFIG,
      metricSet: ["ypp"],
      warmStartSeason: 2018,
      testSeasons: [2018, 2019],
      ...buildInputs(),
    });
    const week1_2019 = only2019.find((p) => p.gameId === "g1901");

    // Add a hypothetical 2020 season with wild results — must not exist yet,
    // but simulate by adding a season the walk-forward doesn't request as a
    // test season (still present in gamesBySeason/observations, as if it
    // were future data sitting in the same loaded dataset).
    const gamesBySeason = new Map([
      [2018, SEASON_2018_GAMES],
      [2019, SEASON_2019_GAMES],
      [2020, [game("g2001", 2020, 1, "A", "D", 70, 0)]],
    ]);
    const observationsByMetricAndSeason = new Map([
      [
        "ypp" as const,
        new Map([
          [2018, observationsFromGames(SEASON_2018_GAMES)],
          [2019, observationsFromGames(SEASON_2019_GAMES)],
          [2020, observationsFromGames([game("g2001", 2020, 1, "A", "D", 70, 0)])],
        ]),
      ],
    ]);
    const withFutureSeasonLoaded = runWalkForwardCore({
      methodConfig: METHOD_CONFIG,
      metricSet: ["ypp"],
      warmStartSeason: 2018,
      testSeasons: [2018, 2019], // 2020 intentionally NOT requested as a test season
      gamesBySeason,
      observationsByMetricAndSeason,
    });
    const week1_2019_withFuture = withFutureSeasonLoaded.find((p) => p.gameId === "g1901");

    expect(week1_2019_withFuture?.predictedMargin).toBe(week1_2019?.predictedMargin);
  });

  it("Week 1 of the first test season only trains on the prior warm-start season", () => {
    const predictions = runWalkForwardCore({
      methodConfig: METHOD_CONFIG,
      metricSet: ["ypp"],
      warmStartSeason: 2018,
      testSeasons: [2018, 2019],
      ...buildInputs(),
    });
    const week1 = predictions.filter((p) => p.season === 2019 && p.week === 1);
    expect(week1.length).toBeGreaterThan(0);
    expect(week1.every((p) => p.predictedMargin !== null)).toBe(true);
  });

  it("the warm-start season itself produces no predictions (nothing precedes it)", () => {
    const predictions = runWalkForwardCore({
      methodConfig: METHOD_CONFIG,
      metricSet: ["ypp"],
      warmStartSeason: 2018,
      testSeasons: [2018, 2019],
      ...buildInputs(),
    });
    expect(predictions.some((p) => p.season === 2018)).toBe(false);
  });
});
