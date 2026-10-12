/**
 * Synthetic NBA fixtures for tests. Invented ids and numbers only: real
 * stats.nba.com data stays out of the repository (see docs/nba-player-props-phase-1.md).
 */
import type { StatsNbaResultSet } from "../ingest/statsNbaPayload";
import type { NbaPlayerGame, NbaTeamGame } from "../types";

export const TEAM_A = 1610612001;
export const TEAM_B = 1610612002;
export const TEAM_C = 1610612003;

export function playerGame(overrides: Partial<NbaPlayerGame> = {}): NbaPlayerGame {
  return {
    schemaVersion: "nba-player-game-v1",
    gameId: "0022400001",
    gameDate: "2024-11-01",
    season: "2024-25",
    seasonType: "regular",
    playerId: 1,
    playerName: "Test Player",
    teamId: TEAM_A,
    teamAbbr: "AAA",
    opponentTeamId: TEAM_B,
    opponentAbbr: "BBB",
    isHome: true,
    minutes: 30,
    pts: 15,
    reb: 6,
    ast: 3,
    oreb: 1,
    dreb: 5,
    fgm: 6,
    fga: 12,
    fg3m: 1,
    fg3a: 4,
    ftm: 2,
    fta: 2,
    stl: 1,
    blk: 0,
    tov: 2,
    pf: 2,
    plusMinus: 3,
    sourceSnapshotId: "playergamelogs/2024-25/regular/fixture",
    ...overrides,
  };
}

export function teamGame(overrides: Partial<NbaTeamGame> = {}): NbaTeamGame {
  return {
    schemaVersion: "nba-team-game-v1",
    gameId: "0022400001",
    gameDate: "2024-11-01",
    season: "2024-25",
    seasonType: "regular",
    teamId: TEAM_A,
    teamAbbr: "AAA",
    opponentTeamId: null,
    opponentAbbr: "BBB",
    isHome: true,
    minutes: 48,
    won: true,
    pts: 100,
    reb: 40,
    ast: 20,
    oreb: 10,
    dreb: 30,
    fgm: 40,
    fga: 85,
    fg3m: 10,
    fg3a: 30,
    ftm: 10,
    fta: 12,
    stl: 7,
    blk: 4,
    tov: 12,
    pf: 18,
    plusMinus: 5,
    sourceSnapshotId: "teamgamelogs/2024-25/regular/fixture",
    ...overrides,
  };
}

const PLAYER_HEADERS = [
  "SEASON_YEAR", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", "GAME_DATE",
  "MATCHUP", "WL", "MIN", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "REB", "AST", "TOV", "STL",
  "BLK", "PF", "PTS", "PLUS_MINUS", "MIN_SEC",
];

/** One raw playergamelogs row as stats.nba.com shapes it. */
export function rawPlayerRow(overrides: Record<string, unknown> = {}): unknown[] {
  const values: Record<string, unknown> = {
    SEASON_YEAR: "2024-25", PLAYER_ID: 1, PLAYER_NAME: "Test Player", TEAM_ID: TEAM_A, TEAM_ABBREVIATION: "AAA",
    TEAM_NAME: "Alpha", GAME_ID: "0022400001", GAME_DATE: "2024-11-01T00:00:00", MATCHUP: "AAA vs. BBB", WL: "W",
    MIN: 31.99, FGM: 6, FGA: 12, FG3M: 1, FG3A: 4, FTM: 2, FTA: 2, OREB: 1, DREB: 5, REB: 6, AST: 3, TOV: 2, STL: 1,
    BLK: 0, PF: 2, PTS: 15, PLUS_MINUS: 3, MIN_SEC: "31:60", ...overrides,
  };
  return PLAYER_HEADERS.map((header) => values[header]);
}

export function playerResultSet(rows: unknown[][], headers: string[] = PLAYER_HEADERS): StatsNbaResultSet {
  return { name: "PlayerGameLogs", headers, rowSet: rows };
}
