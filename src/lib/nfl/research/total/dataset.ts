/**
 * Phase C -- per-team-game research dataset materializer.
 *
 * Produces exactly two rows per completed REG-season game (home + away),
 * each carrying: identity, actual outcome (for evaluation only -- never a
 * feature), the point-in-time scoring environment, the team's own strictly-
 * prior offense window, and the OPPONENT's strictly-prior defense-allowed
 * window. `pregameSafe` is false whenever any window used is
 * "insufficient" (Week 1 of the corpus's very first usable season, or a
 * genuine data gap) so downstream evaluation code can choose to exclude or
 * separately report sparse rows rather than silently treating them as
 * complete.
 */
import { computeScoringEnvironment, type ScoringEnvironmentObservation } from "./scoringEnvironment";
import { buildDefenseAllowedWindow, buildOffenseWindow, type NflTotalResearchScoringSupportIndex } from "./teamScoringFeatures";
import type {
  NflTotalResearchDatasetRow,
  NflTotalResearchGameOutcome,
  NflTotalResearchScoringEnvironmentMode,
} from "./types";

export function buildScoringEnvironmentCorpus(
  outcomes: readonly NflTotalResearchGameOutcome[],
): ScoringEnvironmentObservation[] {
  const observations: ScoringEnvironmentObservation[] = [];
  for (const game of outcomes) {
    observations.push({ season: game.season, week: game.week, teamPoints: game.homeScore });
    observations.push({ season: game.season, week: game.week, teamPoints: game.awayScore });
  }
  return observations;
}

export type BuildDatasetOptions = {
  /** Games to materialize rows FOR (typically the target seasons only, e.g. 2022-2025). */
  targetGames: readonly NflTotalResearchGameOutcome[];
  /** Full outcome corpus used for the scoring-environment estimate -- should extend further back than targetGames (e.g. 2020-2025) so early target seasons still have real prior-season history. */
  environmentCorpusGames: readonly NflTotalResearchGameOutcome[];
  scoringSupportIndex: NflTotalResearchScoringSupportIndex;
  environmentMode: NflTotalResearchScoringEnvironmentMode;
  rollingWindowGames?: number;
};

function buildRow(
  game: NflTotalResearchGameOutcome,
  team: string,
  opponent: string,
  homeAway: "home" | "away",
  actualTeamPoints: number,
  options: BuildDatasetOptions,
  environmentCorpus: readonly ScoringEnvironmentObservation[],
): NflTotalResearchDatasetRow {
  const cutoff = { season: game.season, week: game.week };
  const scoringEnvironment = computeScoringEnvironment(environmentCorpus, cutoff, options.environmentMode, {
    rollingWindowGames: options.rollingWindowGames,
  });
  const offense = buildOffenseWindow(options.scoringSupportIndex, team, cutoff);
  const opponentDefenseAllowed = buildDefenseAllowedWindow(options.scoringSupportIndex, opponent, cutoff);

  const pregameSafe =
    scoringEnvironment.method !== "insufficient" &&
    offense.window !== "insufficient" &&
    opponentDefenseAllowed.window !== "insufficient";

  return {
    season: game.season,
    week: game.week,
    gameId: game.gameId,
    team,
    opponent,
    homeAway,
    actualTeamPoints,
    actualGameTotal: game.totalPoints,
    scoringEnvironment,
    offense,
    opponentDefenseAllowed,
    pregameSafe,
  };
}

export function buildResearchDataset(options: BuildDatasetOptions): NflTotalResearchDatasetRow[] {
  const environmentCorpus = buildScoringEnvironmentCorpus(options.environmentCorpusGames);
  const rows: NflTotalResearchDatasetRow[] = [];
  for (const game of options.targetGames) {
    rows.push(buildRow(game, game.homeAbbr, game.awayAbbr, "home", game.homeScore, options, environmentCorpus));
    rows.push(buildRow(game, game.awayAbbr, game.homeAbbr, "away", game.awayScore, options, environmentCorpus));
  }
  return rows;
}
