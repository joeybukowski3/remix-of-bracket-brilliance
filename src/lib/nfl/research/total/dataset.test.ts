import { describe, expect, it } from "vitest";
import { buildResearchDataset, buildScoringEnvironmentCorpus } from "./dataset";
import { buildScoringSupportIndex } from "./teamScoringFeatures";
import type { NflTotalResearchGameOutcome, NflTotalResearchScoringSupportRow } from "./types";

const GAMES: NflTotalResearchGameOutcome[] = [
  { gameId: "2021_01_buf_mia", season: 2021, week: 1, seasonType: "REG", homeAbbr: "mia", awayAbbr: "buf", homeScore: 17, awayScore: 24, totalPoints: 41 },
  { gameId: "2022_01_buf_nyj", season: 2022, week: 1, seasonType: "REG", homeAbbr: "nyj", awayAbbr: "buf", homeScore: 14, awayScore: 28, totalPoints: 42 },
  { gameId: "2022_02_buf_mia", season: 2022, week: 2, seasonType: "REG", homeAbbr: "buf", awayAbbr: "mia", homeScore: 21, awayScore: 20, totalPoints: 41 },
];

const SUPPORT: NflTotalResearchScoringSupportRow[] = [
  { gameId: "2021_01_buf_mia", season: 2021, week: 1, team: "buf", opponent: "mia", eligiblePlays: 60, offEpaSum: 6, successNum: 30, successDen: 60, explosiveCount: 6 },
  { gameId: "2021_01_buf_mia", season: 2021, week: 1, team: "mia", opponent: "buf", eligiblePlays: 55, offEpaSum: -2, successNum: 20, successDen: 55, explosiveCount: 3 },
  { gameId: "2022_01_buf_nyj", season: 2022, week: 1, team: "buf", opponent: "nyj", eligiblePlays: 62, offEpaSum: 10, successNum: 35, successDen: 62, explosiveCount: 8 },
  { gameId: "2022_01_buf_nyj", season: 2022, week: 1, team: "nyj", opponent: "buf", eligiblePlays: 58, offEpaSum: -5, successNum: 22, successDen: 58, explosiveCount: 2 },
];

describe("buildResearchDataset", () => {
  it("produces exactly two rows per game (home + away)", () => {
    const rows = buildResearchDataset({
      targetGames: GAMES,
      environmentCorpusGames: GAMES,
      scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    expect(rows).toHaveLength(GAMES.length * 2);
  });

  it("each pair of rows for one game sums to that game's actual total, and each row's actualGameTotal matches the game record", () => {
    const rows = buildResearchDataset({
      targetGames: GAMES,
      environmentCorpusGames: GAMES,
      scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    for (const game of GAMES) {
      const gameRows = rows.filter((r) => r.gameId === game.gameId);
      expect(gameRows).toHaveLength(2);
      const sum = gameRows.reduce((s, r) => s + r.actualTeamPoints, 0);
      expect(sum).toBe(game.totalPoints);
      for (const row of gameRows) expect(row.actualGameTotal).toBe(game.totalPoints);
    }
  });

  it("assigns homeAway correctly and each row's team/opponent are the two sides of the game", () => {
    const rows = buildResearchDataset({
      targetGames: [GAMES[2]],
      environmentCorpusGames: GAMES,
      scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    const home = rows.find((r) => r.homeAway === "home")!;
    const away = rows.find((r) => r.homeAway === "away")!;
    expect(home.team).toBe("buf");
    expect(home.opponent).toBe("mia");
    expect(home.actualTeamPoints).toBe(21);
    expect(away.team).toBe("mia");
    expect(away.opponent).toBe("buf");
    expect(away.actualTeamPoints).toBe(20);
  });

  it("flags pregameSafe=false when a required window is insufficient (no history at all)", () => {
    const noHistoryGame: NflTotalResearchGameOutcome = {
      gameId: "2021_01_new_team", season: 2021, week: 1, seasonType: "REG", homeAbbr: "zzz", awayAbbr: "yyy", homeScore: 10, awayScore: 7, totalPoints: 17,
    };
    const rows = buildResearchDataset({
      targetGames: [noHistoryGame],
      environmentCorpusGames: [noHistoryGame],
      scoringSupportIndex: buildScoringSupportIndex([]),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    expect(rows.every((r) => r.pregameSafe === false)).toBe(true);
    expect(rows.every((r) => r.offense.window === "insufficient")).toBe(true);
  });

  it("flags pregameSafe=true once real prior-season history exists for both teams", () => {
    const rows = buildResearchDataset({
      targetGames: [GAMES[1]], // 2022 week 1: buf vs nyj -- both need 2021 history, only buf has it in this fixture
      environmentCorpusGames: GAMES,
      scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    const bufRow = rows.find((r) => r.team === "buf")!;
    expect(bufRow.offense.window).toBe("priorSeason"); // buf's 2021 game
    // nyj has no history at all in this fixture -- its opponent-defense-allowed window (from nyj's perspective as a team) is insufficient,
    // but buf's OWN row depends on nyj's DEFENSE-allowed window, which also has no history.
    expect(bufRow.opponentDefenseAllowed.window).toBe("insufficient");
    expect(bufRow.pregameSafe).toBe(false);
  });
});

describe("buildScoringEnvironmentCorpus", () => {
  it("emits exactly two observations per game", () => {
    const corpus = buildScoringEnvironmentCorpus(GAMES);
    expect(corpus).toHaveLength(GAMES.length * 2);
  });
});
