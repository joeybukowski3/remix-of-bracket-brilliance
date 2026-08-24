import { computeCompositeRidgeWithPriorRatings } from "../phase4/ratingProvider";
import { buildSeasonObservations, loadSeasonGames, loadSeasonTeamGames } from "../phase2/loadTeamGameObservations";
import type { CfbMetricName, GameObservation } from "../phase2/types";
import { buildPriorsForSeasons } from "../phase3/buildPriorsForSeasons";
import { loadPreseasonRawInputs } from "../phase3/loadPreseasonInputs";
import type { PreseasonRawInputs, PriorRatings } from "../phase3/types";
import type { CfbResearchGame } from "../types";
import type { TeamWeekContext } from "./types";

const METRIC_SET: CfbMetricName[] = ["ypp", "ppp"];
// Mirrors phase5/phase5WalkForward.ts's PHASE4_FINALIST_CONFIG rating inputs
// (ratingLambda 20) and runPhase4WalkForward's defaults (PRIOR_D, priorLambda 3)
// exactly, so Phase 7's context snapshot reflects the SAME ratings Phase 4-6
// actually used to produce the predictions being diagnosed here. Duplicated
// (not imported/modified) the way Phase 6's marketDataLoader duplicated
// Phase 5's residual-pool logic — Phase 3/4 stay frozen (Section 28).
const RATING_LAMBDA = 20;
const PRIOR_FEATURE_SET = "PRIOR_D" as const;
const PRIOR_LAMBDA = 3;

function isFbsVsFbsGame(game: CfbResearchGame): boolean {
  return (
    (game.homeClassification ?? "").toLowerCase() === "fbs" && (game.awayClassification ?? "").toLowerCase() === "fbs"
  );
}

export type Phase7Context = {
  /** key: `${season}:${week}:${teamExternalId}` */
  snapshots: Map<string, TeamWeekContext>;
  priorsBySeason: Map<number, Map<string, PriorRatings>>;
  preseasonInputsBySeason: Map<number, Map<string, PreseasonRawInputs>>;
};

function snapshotKey(season: number, week: number, teamExternalId: string): string {
  return `${season}:${week}:${teamExternalId}`;
}

export function buildPhase7Context(testSeasons: readonly number[]): Phase7Context {
  const priorsBySeason = buildPriorsForSeasons(testSeasons, PRIOR_FEATURE_SET, PRIOR_LAMBDA);
  const preseasonInputsBySeason = new Map<number, Map<string, PreseasonRawInputs>>();
  const snapshots = new Map<string, TeamWeekContext>();

  for (const season of testSeasons) {
    preseasonInputsBySeason.set(
      season,
      new Map(loadPreseasonRawInputs(season).map((row) => [row.teamExternalId, row])),
    );

    const games = loadSeasonGames(season).filter((g) => g.status === "final" && isFbsVsFbsGame(g));
    const teamGames = loadSeasonTeamGames(season);
    const observationsByMetric = new Map<CfbMetricName, GameObservation[]>();
    for (const metric of METRIC_SET) {
      observationsByMetric.set(metric, buildSeasonObservations(teamGames, games, metric, "NONE", "gameWeighted"));
    }

    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
    const teamIds = [...new Set(games.flatMap((g) => [g.homeExternalId, g.awayExternalId]))];
    const priors = priorsBySeason.get(season);
    if (!priors) continue; // no trainable prior for this season — Phase 3 already documents this (e.g. 2019)

    for (const week of weeks) {
      const trainGames = games.filter((g) => g.week < week);
      const gamesPlayedByTeam = new Map<string, number>();
      for (const g of trainGames) {
        gamesPlayedByTeam.set(g.homeExternalId, (gamesPlayedByTeam.get(g.homeExternalId) ?? 0) + 1);
        gamesPlayedByTeam.set(g.awayExternalId, (gamesPlayedByTeam.get(g.awayExternalId) ?? 0) + 1);
      }

      const obsByMetric = new Map<CfbMetricName, GameObservation[]>();
      for (const metric of METRIC_SET) {
        obsByMetric.set(metric, (observationsByMetric.get(metric) ?? []).filter((o) => o.week < week));
      }
      const ratings = computeCompositeRidgeWithPriorRatings(teamIds, METRIC_SET, obsByMetric, priors, RATING_LAMBDA);

      for (const teamId of teamIds) {
        const r = ratings.get(teamId);
        const offense = r?.offense ?? null;
        const defense = r?.defense ?? null;
        snapshots.set(snapshotKey(season, week, teamId), {
          season,
          week,
          teamExternalId: teamId,
          offense,
          defense,
          power: offense !== null && defense !== null ? 0.5 * (offense + defense) : null,
          gamesPlayedEnteringWeek: gamesPlayedByTeam.get(teamId) ?? 0,
        });
      }
    }
  }

  return { snapshots, priorsBySeason, preseasonInputsBySeason };
}

export function getSnapshot(context: Phase7Context, season: number, week: number, teamExternalId: string): TeamWeekContext | undefined {
  return context.snapshots.get(snapshotKey(season, week, teamExternalId));
}

/**
 * |power(this week's cutoff) - power(previous week's cutoff)| for the same
 * team/season. Null when there is no earlier in-season snapshot to compare
 * against (week 1, or first snapshot after a bye) — never fabricated as 0.
 */
export function ratingVolatility(context: Phase7Context, season: number, week: number, teamExternalId: string): number | null {
  const weeksForSeason = [...new Set([...context.snapshots.values()].filter((s) => s.season === season).map((s) => s.week))].sort(
    (a, b) => a - b,
  );
  const idx = weeksForSeason.indexOf(week);
  if (idx <= 0) return null;
  const previousWeek = weeksForSeason[idx - 1];
  const current = getSnapshot(context, season, week, teamExternalId);
  const previous = getSnapshot(context, season, previousWeek, teamExternalId);
  if (current?.power === null || current?.power === undefined || previous?.power === null || previous?.power === undefined) {
    return null;
  }
  return Math.abs(current.power - previous.power);
}
