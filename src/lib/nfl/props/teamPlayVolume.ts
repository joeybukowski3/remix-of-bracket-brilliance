import {
  NFL_TEAM_PREGAME_FEATURES_SCHEMA_VERSION,
  emptyRollingWindow,
  type NflRollingWindowVolumeTendency,
  type NflTeamGamePlayVolumeRecord,
  type NflTeamPregameFeatures,
} from "./types/teamPregameFeatures";
import type { NflGameJoinRecord } from "./historicalOutcomes";
import { gameJoinKey } from "./historicalOutcomes";

export const NEUTRAL_SITUATION_DEFINITION =
  "down IN (1,2) AND wp BETWEEN 0.20 AND 0.80 (posteam win probability) AND half_seconds_remaining > 120";

/** One of a team's own games, chronologically orderable. */
export type NflTeamGameLogEntry = NflTeamGamePlayVolumeRecord & {
  gameDateUtc: string;
};

/**
 * Joins compact play-volume records to their kickoff date via the same
 * `gameJoinIndex` the historical outcome pipeline uses (season|week|team ->
 * gameId/homeAway/gameDateUtc). A play-volume record with no matching game
 * is a real integrity problem (the game was played, per the play-by-play,
 * so it must be in the schedule) and throws rather than being silently
 * dropped.
 */
export function buildTeamGameLog(
  records: readonly NflTeamGamePlayVolumeRecord[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
): NflTeamGameLogEntry[] {
  return records.map((record) => {
    const join = gameJoinIndex.get(gameJoinKey(record.season, record.week, record.team));
    if (!join) {
      throw new Error(
        `No schedule entry for ${record.team} season ${record.season} week ${record.week} (game ${record.gameId}) -- cannot order chronologically.`,
      );
    }
    return { ...record, gameDateUtc: join.gameDateUtc };
  });
}

/** Sums raw counters over a set of games and divides once -- never averages a per-game rate. */
export function sumPlayVolumeWindow(games: readonly NflTeamGamePlayVolumeRecord[]): NflRollingWindowVolumeTendency {
  if (games.length === 0) return emptyRollingWindow();
  let eligiblePlays = 0;
  let passPlays = 0;
  let rushPlays = 0;
  let neutralEligiblePlays = 0;
  let neutralPassPlays = 0;
  let passOeSum = 0;
  let passOeCount = 0;
  for (const g of games) {
    eligiblePlays += g.eligiblePlays;
    passPlays += g.passPlays;
    rushPlays += g.rushPlays;
    neutralEligiblePlays += g.neutralEligiblePlays;
    neutralPassPlays += g.neutralPassPlays;
    passOeSum += g.passOeSum;
    passOeCount += g.passOeCount;
  }
  const gamesIncluded = games.length;
  return {
    gamesIncluded,
    offensivePlaysPerGame: eligiblePlays / gamesIncluded,
    passAttemptsPerGame: passPlays / gamesIncluded,
    rushAttemptsPerGame: rushPlays / gamesIncluded,
    overallDropbackRate: eligiblePlays > 0 ? passPlays / eligiblePlays : null,
    earlyDownNeutralPassRate: neutralEligiblePlays > 0 ? neutralPassPlays / neutralEligiblePlays : null,
    neutralEligiblePlaysSample: neutralEligiblePlays,
    passRateOverExpected: passOeCount > 0 ? passOeSum / passOeCount : null,
    passOeSample: passOeCount,
  };
}

/**
 * Every game entry for `team` in `season` played strictly before
 * `beforeDateUtc`, sorted chronologically. Ordering and the cutoff are both
 * by kickoff date -- never by week number -- so a flexed or rescheduled
 * game can never leak or be excluded incorrectly, matching the convention
 * already established in `nfl-matchup-metrics.mjs`.
 */
export function selectPriorGamesInSeason(
  gameLog: readonly NflTeamGameLogEntry[],
  team: string,
  season: number,
  beforeDateUtc: string,
): NflTeamGameLogEntry[] {
  return gameLog
    .filter((e) => e.team === team && e.season === season && e.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
}

/** The most recent `n` games from an already-chronologically-sorted list. */
export function selectLastNGames<T>(sortedGames: readonly T[], n: number): T[] {
  return n <= 0 ? [] : sortedGames.slice(Math.max(0, sortedGames.length - n));
}

/** Every game entry for `team` in `priorSeason` -- a full-season aggregate, not windowed. */
export function selectPriorSeasonGames(
  gameLog: readonly NflTeamGameLogEntry[],
  team: string,
  priorSeason: number,
): NflTeamGameLogEntry[] {
  return gameLog.filter((e) => e.team === team && e.season === priorSeason);
}

/**
 * Every game entry where `team` was the OPPONENT (i.e. games that count
 * toward `team`'s defensive-allowed context), strictly before
 * `beforeDateUtc`, sorted chronologically. Reuses the same game-log
 * records as the offensive window functions -- a defensive-allowed window
 * for team X is just "the games X's opponents played against X," read off
 * the opponent field of the same compact records, never a new source.
 */
export function selectPriorGamesAsOpponent(
  gameLog: readonly NflTeamGameLogEntry[],
  team: string,
  season: number,
  beforeDateUtc: string,
): NflTeamGameLogEntry[] {
  return gameLog
    .filter((e) => e.opponent === team && e.season === season && e.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
}

export function selectPriorSeasonGamesAsOpponent(
  gameLog: readonly NflTeamGameLogEntry[],
  team: string,
  priorSeason: number,
): NflTeamGameLogEntry[] {
  return gameLog.filter((e) => e.opponent === team && e.season === priorSeason);
}

const RECENT_WINDOW_SIZE = 3;

/**
 * Builds one team's pregame features for one target game. Every input game
 * used by `seasonPrior`/`last3` is strictly before the target game's own
 * kickoff date within the same season; `priorSeason` uses only the
 * entirely-prior season. No play from the target game itself, and no game
 * on or after the target date, can ever enter any window -- see the
 * adversarial leakage test in `teamPlayVolume.test.ts`.
 */
export function buildTeamPregameFeatures(
  targetGame: NflTeamGamePlayVolumeRecord,
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  fullGameLog: readonly NflTeamGameLogEntry[],
): NflTeamPregameFeatures {
  const join = gameJoinIndex.get(gameJoinKey(targetGame.season, targetGame.week, targetGame.team));
  if (!join) {
    throw new Error(
      `No schedule entry for target game ${targetGame.gameId} (${targetGame.team}, season ${targetGame.season} week ${targetGame.week}).`,
    );
  }

  const priorInSeason = selectPriorGamesInSeason(fullGameLog, targetGame.team, targetGame.season, join.gameDateUtc);
  const last3 = selectLastNGames(priorInSeason, RECENT_WINDOW_SIZE);
  const priorSeasonGames = selectPriorSeasonGames(fullGameLog, targetGame.team, targetGame.season - 1);

  return {
    schemaVersion: NFL_TEAM_PREGAME_FEATURES_SCHEMA_VERSION,
    season: targetGame.season,
    week: targetGame.week,
    gameId: targetGame.gameId,
    team: targetGame.team,
    opponent: targetGame.opponent,
    homeAway: join.homeAway,
    gameDateUtc: join.gameDateUtc,
    gamesPlayedPriorThisSeason: priorInSeason.length,
    hasPriorSeason: priorSeasonGames.length > 0,
    seasonPrior: sumPlayVolumeWindow(priorInSeason),
    last3: sumPlayVolumeWindow(last3),
    priorSeason: sumPlayVolumeWindow(priorSeasonGames),
    provenance: {
      source: "nflverse play-by-play (compact play-volume cache)",
      neutralSituationDefinition: NEUTRAL_SITUATION_DEFINITION,
    },
  };
}
