/**
 * Phase L -- EWMA variant of the Phase C research dataset materializer.
 * Identical row shape and identical scoring-environment computation to
 * dataset.ts (so the same ridge/baseline code in ridgeModel.ts/baselines.ts
 * scores these rows unmodified); the only difference is that offense and
 * opponentDefenseAllowed windows come from ewmaWindow.ts's
 * computeEwmaWindow (with independently configurable offense/defense
 * half-lives) instead of teamScoringFeatures.ts's expanding "current"
 * window. `pregameSafe` is true whenever the environment resolved and
 * ANY history contributed to both windows (EWMA windows are only fully
 * "insufficient" when a team has zero prior games in the entire cache).
 */
import { computeScoringEnvironment, type ScoringEnvironmentObservation } from "./scoringEnvironment";
import { computeEwmaWindow } from "./ewmaWindow";
import type { NflTotalResearchScoringSupportIndex } from "./teamScoringFeatures";
import { buildScoringEnvironmentCorpus } from "./dataset";
import type {
  NflTotalResearchDatasetRow,
  NflTotalResearchGameOutcome,
  NflTotalResearchScoringEnvironmentMode,
  NflTotalResearchScoringWindow,
} from "./types";

export type BuildEwmaDatasetOptions = {
  targetGames: readonly NflTotalResearchGameOutcome[];
  environmentCorpusGames: readonly NflTotalResearchGameOutcome[];
  scoringSupportIndex: NflTotalResearchScoringSupportIndex;
  environmentMode: NflTotalResearchScoringEnvironmentMode;
  offenseHalfLife: number;
  defenseHalfLife: number;
};

function toScoringWindow(ewma: ReturnType<typeof computeEwmaWindow>): NflTotalResearchScoringWindow {
  return {
    epaPerPlay: ewma.epaPerPlay,
    successRate: ewma.successRate,
    explosiveRate: ewma.explosiveRate,
    sampleGames: ewma.totalGamesUsed,
    samplePlays: ewma.totalGamesUsed, // EWMA does not track raw play counts per row; games used is the closest analog and is documented as such.
    window: ewma.totalGamesUsed > 0 ? "seasonPrior" : "insufficient", // reuses the existing label set; "seasonPrior" here means "EWMA pool non-empty", not literally season-restricted.
  };
}

function buildRow(
  game: NflTotalResearchGameOutcome,
  team: string,
  opponent: string,
  homeAway: "home" | "away",
  actualTeamPoints: number,
  options: BuildEwmaDatasetOptions,
  environmentCorpus: readonly ScoringEnvironmentObservation[],
): NflTotalResearchDatasetRow {
  const cutoff = { season: game.season, week: game.week };
  const scoringEnvironment = computeScoringEnvironment(environmentCorpus, cutoff, options.environmentMode);
  const offenseEwma = computeEwmaWindow(options.scoringSupportIndex.byTeam.get(team) ?? [], cutoff, options.offenseHalfLife);
  const defenseEwma = computeEwmaWindow(options.scoringSupportIndex.byOpponent.get(opponent) ?? [], cutoff, options.defenseHalfLife);

  const offense = toScoringWindow(offenseEwma);
  const opponentDefenseAllowed = toScoringWindow(defenseEwma);
  const pregameSafe = scoringEnvironment.value !== null && offense.epaPerPlay !== null && opponentDefenseAllowed.epaPerPlay !== null;

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

export function buildEwmaResearchDataset(options: BuildEwmaDatasetOptions): NflTotalResearchDatasetRow[] {
  const environmentCorpus = buildScoringEnvironmentCorpus(options.environmentCorpusGames);
  const rows: NflTotalResearchDatasetRow[] = [];
  for (const game of options.targetGames) {
    rows.push(buildRow(game, game.homeAbbr, game.awayAbbr, "home", game.homeScore, options, environmentCorpus));
    rows.push(buildRow(game, game.awayAbbr, game.homeAbbr, "away", game.awayScore, options, environmentCorpus));
  }
  return rows;
}
