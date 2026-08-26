import type { CfbSeasonStats } from "../../../data/cfb/types";
import type { CfbGameTeamStatLine } from "./parseGameTeamStats";

/** One completed game's box score for a team and its opponent, already parsed. */
export type CfbTeamGameStatRow = {
  gameId: string;
  teamId: string;
  points: number | null;
  opponentPoints: number | null;
  own: CfbGameTeamStatLine;
  opponent: CfbGameTeamStatLine;
};

function sum(values: ReadonlyArray<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function perGame(total: number | null, games: number): number | null {
  return games <= 0 ? null : ratio(total, games);
}

/**
 * Aggregates one team's completed-game rows into season totals, then derives
 * the CfbSeasonStats ratio fields from those SUMMED totals (never by
 * averaging each game's own percentage) so multi-game denominators combine
 * correctly.
 *
 * Formulas (season totals -> ratio):
 *   pointsPerGame            = sum(points) / gamesPlayed
 *   yardsPerPlay             = sum(totalYards) / sum(offensivePlays)
 *   pointsPerPlay            = sum(points) / sum(offensivePlays)
 *   rushYardsPerGame         = sum(rushingYards) / gamesPlayed
 *   yardsPerRush             = sum(rushingYards) / sum(rushingAttempts)
 *   passYardsPerGame         = sum(passingYards) / gamesPlayed
 *   yardsPerPass             = sum(passingYards) / sum(passAttempts)  -- attempts, not
 *                              completions, matching CFBD's own per-game yardsPerPass
 *                              category (netPassingYards / passAttempts).
 *   thirdDownPct             = sum(thirdDownConversions) / sum(thirdDownAttempts)
 *   completionPct            = sum(passCompletions) / sum(passAttempts)
 *   turnovers                = sum(own.turnovers)
 * Defense/opponent fields mirror the same formulas over the OPPONENT's row
 * from each of this team's games (i.e. what opponents did against this team),
 * with turnovers -> takeaways (opponent turnovers = this team's takeaways).
 */
export function aggregateTeamSeasonStats(teamId: string, rows: readonly CfbTeamGameStatRow[]): CfbSeasonStats {
  const gamesPlayed = rows.length;

  const points = sum(rows.map((row) => row.points));
  const totalYards = sum(rows.map((row) => row.own.totalYards));
  const offensivePlays = sum(rows.map((row) => row.own.offensivePlays));
  const rushingYards = sum(rows.map((row) => row.own.rushingYards));
  const rushingAttempts = sum(rows.map((row) => row.own.rushingAttempts));
  const passingYards = sum(rows.map((row) => row.own.passingYards));
  const passAttempts = sum(rows.map((row) => row.own.passAttempts));
  const passCompletions = sum(rows.map((row) => row.own.passCompletions));
  const thirdDownConversions = sum(rows.map((row) => row.own.thirdDownConversions));
  const thirdDownAttempts = sum(rows.map((row) => row.own.thirdDownAttempts));
  const turnovers = sum(rows.map((row) => row.own.turnovers));

  const opponentPoints = sum(rows.map((row) => row.opponentPoints));
  const opponentTotalYards = sum(rows.map((row) => row.opponent.totalYards));
  const opponentOffensivePlays = sum(rows.map((row) => row.opponent.offensivePlays));
  const opponentRushingYards = sum(rows.map((row) => row.opponent.rushingYards));
  const opponentRushingAttempts = sum(rows.map((row) => row.opponent.rushingAttempts));
  const opponentPassingYards = sum(rows.map((row) => row.opponent.passingYards));
  const opponentPassAttempts = sum(rows.map((row) => row.opponent.passAttempts));
  const opponentPassCompletions = sum(rows.map((row) => row.opponent.passCompletions));
  const opponentThirdDownConversions = sum(rows.map((row) => row.opponent.thirdDownConversions));
  const opponentThirdDownAttempts = sum(rows.map((row) => row.opponent.thirdDownAttempts));
  const opponentTurnovers = sum(rows.map((row) => row.opponent.turnovers));

  return {
    teamId,
    gamesPlayed,
    pointsPerGame: perGame(points, gamesPlayed),
    yardsPerPlay: ratio(totalYards, offensivePlays),
    pointsPerPlay: ratio(points, offensivePlays),
    rushYardsPerGame: perGame(rushingYards, gamesPlayed),
    yardsPerRush: ratio(rushingYards, rushingAttempts),
    passYardsPerGame: perGame(passingYards, gamesPlayed),
    yardsPerPass: ratio(passingYards, passAttempts),
    thirdDownPct: ratio(thirdDownConversions, thirdDownAttempts),
    completionPct: ratio(passCompletions, passAttempts),
    turnovers,
    pointsAllowedPerGame: perGame(opponentPoints, gamesPlayed),
    yardsPerPlayAllowed: ratio(opponentTotalYards, opponentOffensivePlays),
    opponentPointsPerPlay: ratio(opponentPoints, opponentOffensivePlays),
    rushYardsAllowedPerGame: perGame(opponentRushingYards, gamesPlayed),
    yardsPerRushAllowed: ratio(opponentRushingYards, opponentRushingAttempts),
    passYardsAllowedPerGame: perGame(opponentPassingYards, gamesPlayed),
    yardsPerPassAllowed: ratio(opponentPassingYards, opponentPassAttempts),
    opponentThirdDownPct: ratio(opponentThirdDownConversions, opponentThirdDownAttempts),
    opponentCompletionPct: ratio(opponentPassCompletions, opponentPassAttempts),
    takeaways: opponentTurnovers,
  };
}
