import { buildSeasonObservations, loadSeasonGames, loadSeasonTeamGames } from "../phase2/loadTeamGameObservations";
import type { CfbMetricName, GameObservation } from "../phase2/types";
import { buildPriorsForSeasons } from "../phase3/buildPriorsForSeasons";
import { loadPreseasonRawInputs } from "../phase3/loadPreseasonInputs";
import { loadTeamConferenceById } from "./teamConference";
import { runPhase8WalkForwardCore, type Phase8SeasonData } from "./phase8WalkForwardCore";
import type { ScoringModelConfig } from "../phase4/types";
import type { Phase8CandidateSpec, Phase8Prediction } from "./types";

const METRIC_SET: CfbMetricName[] = ["ypp", "ppp"];

/** Section 2 — the exact scoring config Phase 4/5's finalist uses (frozen, imported for comparability, never retuned here). */
export const PHASE4_FINALIST_SCORING_CONFIG: ScoringModelConfig = {
  hfa: "NATIONAL",
  scoringEnvironment: "BLENDED_CURRENT",
  pace: "NONE",
  secondary: ["SUCCESS"],
  lambda: 2,
  priorGamesWeight: 8,
};

export type Phase8WalkForwardOptions = {
  testSeasons: readonly number[];
  candidateSpec: Phase8CandidateSpec;
};

export function runPhase8WalkForward(options: Phase8WalkForwardOptions): Phase8Prediction[] {
  const warmStartSeason = 2018;
  const allSeasons = [...new Set([warmStartSeason, 2019, ...options.testSeasons])].sort((a, b) => a - b);

  const priorsBySeason = buildPriorsForSeasons(options.testSeasons, "PRIOR_D", 3);

  const seasonData = new Map<number, Phase8SeasonData>();
  for (const season of allSeasons) {
    const games = loadSeasonGames(season);
    const teamGames = loadSeasonTeamGames(season);
    const observationsByMetric = new Map<CfbMetricName, GameObservation[]>();
    for (const metric of METRIC_SET) observationsByMetric.set(metric, buildSeasonObservations(teamGames, games, metric, "NONE", "gameWeighted"));

    let prevSeasonRatingByTeam = new Map<string, number | null>();
    try {
      const preseason = loadPreseasonRawInputs(season);
      prevSeasonRatingByTeam = new Map(
        preseason.map((row) => [
          row.teamExternalId,
          row.prevSeasonOffense !== null && row.prevSeasonDefense !== null ? 0.5 * (row.prevSeasonOffense + row.prevSeasonDefense) : null,
        ]),
      );
    } catch {
      // no preseason inputs computable for this season (e.g. the 2018 warm-start season) — leave empty, never fabricated
    }

    seasonData.set(season, {
      games,
      teamGames,
      observationsByMetric,
      priors: priorsBySeason.get(season),
      teamConferenceById: loadTeamConferenceById(season),
      prevSeasonRatingByTeam,
    });
  }

  return runPhase8WalkForwardCore({
    scoringConfig: PHASE4_FINALIST_SCORING_CONFIG,
    testSeasons: options.testSeasons,
    seasonData,
    candidateSpec: options.candidateSpec,
  });
}
