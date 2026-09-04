/**
 * Phase A -- point-in-time NFL league scoring environment.
 *
 * Given the full corpus of completed team-game point observations (two per
 * game: home team's score, away team's score) and a strict (season, week)
 * cutoff, estimates the league-average points/team/game using only games
 * completed BEFORE that cutoff. Never reads or infers anything about the
 * target game itself.
 *
 * Three variants (documented, not hardcoded):
 *
 *  - "priorSeasonOnly": the single most recently COMPLETED season's full
 *    average. Used every week of a season, including that season's own
 *    Week 1 -- the environment does not react to the current season at all
 *    until computeScoringEnvironment is called again for a later cutoff. If
 *    no completed season exists before the cutoff at all (would only occur
 *    for a season before the corpus's earliest season), falls back to the
 *    mean of everything strictly prior ("allTimeFallback") rather than
 *    returning null, and that fallback is reported via `method`.
 *
 *  - "seasonToDateWithPriorFallback": uses the mean of the CURRENT season's
 *    own completed games so far (season === cutoff.season, week <
 *    cutoff.week) whenever at least one exists; otherwise falls back to
 *    "priorSeasonOnly" behavior. This means a season's own Week 1 always
 *    uses the prior season (there is no current-season data yet), and Week
 *    2 onward uses a season-to-date average that starts on a single game's
 *    worth of signal and stabilizes as the season progresses -- documented
 *    early-season noise, not smoothed or blended with a ramp.
 *
 *  - "rollingWindow": the trailing N most recent team-game observations
 *    strictly before the cutoff, in chronological (season, week) order,
 *    crossing season boundaries freely. Default N = 272 (approximately one
 *    full season's worth of team-game observations). Early in the corpus,
 *    where fewer than N prior observations exist, uses whatever is
 *    available (never fabricates observations) and reports the true sample
 *    size.
 *
 * All three require the corpus to include at least the two seasons prior to
 * the earliest cutoff ever queried; the research dataset builder supplies a
 * 2020-2025 corpus for exactly this reason (results.json exists back to
 * 2020) even though team-scoring FEATURES are only built from 2022 onward.
 */
import type {
  NflTotalResearchCutoff,
  NflTotalResearchScoringEnvironment,
  NflTotalResearchScoringEnvironmentMode,
} from "./types";

export type ScoringEnvironmentObservation = {
  season: number;
  week: number;
  teamPoints: number;
};

const DEFAULT_ROLLING_WINDOW_GAMES = 272;

function isStrictlyPrior(observation: ScoringEnvironmentObservation, cutoff: NflTotalResearchCutoff): boolean {
  if (observation.season < cutoff.season) return true;
  if (observation.season === cutoff.season && observation.week < cutoff.week) return true;
  return false;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeScoringEnvironment(
  corpus: readonly ScoringEnvironmentObservation[],
  cutoff: NflTotalResearchCutoff,
  mode: NflTotalResearchScoringEnvironmentMode,
  options?: { rollingWindowGames?: number },
): NflTotalResearchScoringEnvironment {
  const priorObservations = corpus.filter((o) => isStrictlyPrior(o, cutoff));

  if (mode === "priorSeasonOnly") {
    const priorSeason = cutoff.season - 1;
    const seasonObs = priorObservations.filter((o) => o.season === priorSeason);
    if (seasonObs.length > 0) {
      return { value: mean(seasonObs.map((o) => o.teamPoints)), sampleGames: seasonObs.length, mode, method: "priorSeason" };
    }
    if (priorObservations.length > 0) {
      return { value: mean(priorObservations.map((o) => o.teamPoints)), sampleGames: priorObservations.length, mode, method: "allTimeFallback" };
    }
    return { value: null, sampleGames: 0, mode, method: "insufficient" };
  }

  if (mode === "seasonToDateWithPriorFallback") {
    const seasonToDate = priorObservations.filter((o) => o.season === cutoff.season);
    if (seasonToDate.length > 0) {
      return { value: mean(seasonToDate.map((o) => o.teamPoints)), sampleGames: seasonToDate.length, mode, method: "seasonToDate" };
    }
    const priorSeason = cutoff.season - 1;
    const priorSeasonObs = priorObservations.filter((o) => o.season === priorSeason);
    if (priorSeasonObs.length > 0) {
      return { value: mean(priorSeasonObs.map((o) => o.teamPoints)), sampleGames: priorSeasonObs.length, mode, method: "priorSeason" };
    }
    if (priorObservations.length > 0) {
      return { value: mean(priorObservations.map((o) => o.teamPoints)), sampleGames: priorObservations.length, mode, method: "allTimeFallback" };
    }
    return { value: null, sampleGames: 0, mode, method: "insufficient" };
  }

  // rollingWindow
  const windowSize = options?.rollingWindowGames ?? DEFAULT_ROLLING_WINDOW_GAMES;
  const sorted = [...priorObservations].sort((a, b) => (a.season - b.season) || (a.week - b.week));
  const trailing = sorted.slice(Math.max(0, sorted.length - windowSize));
  if (trailing.length > 0) {
    return { value: mean(trailing.map((o) => o.teamPoints)), sampleGames: trailing.length, mode, method: "rollingWindow" };
  }
  return { value: null, sampleGames: 0, mode, method: "insufficient" };
}
