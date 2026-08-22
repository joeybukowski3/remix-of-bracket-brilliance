import { weightedMean } from "./weightedStats";
import type {
  CfbAggregationMode,
  CfbDerivedTeamGameMetrics,
  CfbGarbageTimePolicyMetrics,
  CfbGarbageTimePolicyName,
  CfbTeamSeasonToDateSlice,
} from "./types";

const RATE_FIELDS = [
  "ypp",
  "ppp",
  "ppaPerPlay",
  "ppaSuccessRate",
  "earlyDownPpaSuccessRate",
  "passingDownPpaSuccessRate",
  "downDistanceSuccessRate",
  "earlyDownDownDistanceSuccessRate",
  "passingDownDownDistanceSuccessRate",
  "explosivePlayRate",
  "explosivePassRate",
  "explosiveRushRate",
  "secondsPerPlay",
] as const satisfies readonly (keyof CfbGarbageTimePolicyMetrics)[];

/**
 * Section 13: combines already-computed per-game policy metrics into one
 * season-to-date slice.
 *
 * playWeighted: each game's rate is weighted by that game's totalWeight
 * (its policy-weighted play count) — a 90-play game influences the
 * combined rate ~1.5x a 60-play game. This is an approximation: it reuses
 * the game's overall totalWeight as the weighting basis for every metric,
 * rather than each metric's own (slightly different) non-null coverage
 * weight — documented as a deliberate simplification (see Work Unit 3
 * final report) rather than storing per-metric weight sums per game.
 *
 * gameWeighted: every included game counts equally regardless of play volume.
 */
function combinePolicyMetrics(
  gameMetrics: readonly CfbGarbageTimePolicyMetrics[],
  mode: CfbAggregationMode,
  policy: Exclude<CfbGarbageTimePolicyName, "LEVERAGE">,
): CfbGarbageTimePolicyMetrics {
  const combined: Partial<Record<(typeof RATE_FIELDS)[number], number | null>> = {};
  for (const field of RATE_FIELDS) {
    const rows = gameMetrics.map((game) => ({
      value: game[field],
      weight: mode === "playWeighted" ? game.totalWeight : 1,
    }));
    combined[field] = weightedMean(rows).mean;
  }

  return {
    policy,
    includedPlayCount: gameMetrics.reduce((sum, game) => sum + game.includedPlayCount, 0),
    totalWeight: gameMetrics.reduce((sum, game) => sum + game.totalWeight, 0),
    ypp: combined.ypp ?? null,
    ppp: combined.ppp ?? null,
    ppaPerPlay: combined.ppaPerPlay ?? null,
    ppaCoveredPlayCount: gameMetrics.reduce((sum, game) => sum + game.ppaCoveredPlayCount, 0),
    ppaCoveragePct:
      gameMetrics.length === 0
        ? 0
        : Math.round(
            (gameMetrics.reduce((sum, game) => sum + game.ppaCoveredPlayCount, 0) /
              Math.max(
                1,
                gameMetrics.reduce((sum, game) => sum + game.includedPlayCount, 0),
              )) *
              10_000,
          ) / 100,
    ppaSuccessRate: combined.ppaSuccessRate ?? null,
    earlyDownPpaSuccessRate: combined.earlyDownPpaSuccessRate ?? null,
    passingDownPpaSuccessRate: combined.passingDownPpaSuccessRate ?? null,
    downDistanceSuccessRate: combined.downDistanceSuccessRate ?? null,
    earlyDownDownDistanceSuccessRate: combined.earlyDownDownDistanceSuccessRate ?? null,
    passingDownDownDistanceSuccessRate: combined.passingDownDownDistanceSuccessRate ?? null,
    explosivePlayRate: combined.explosivePlayRate ?? null,
    explosivePassRate: combined.explosivePassRate ?? null,
    explosiveRushRate: combined.explosiveRushRate ?? null,
    secondsPerPlay: combined.secondsPerPlay ?? null,
  };
}

export function buildTeamSeasonToDateSlice(
  teamExternalId: string,
  teamId: string | null,
  season: number,
  throughWeekExclusive: number,
  aggregationMode: CfbAggregationMode,
  policy: Exclude<CfbGarbageTimePolicyName, "LEVERAGE">,
  teamGames: readonly CfbDerivedTeamGameMetrics[],
): CfbTeamSeasonToDateSlice {
  const included = teamGames.filter(
    (game) => game.season === season && game.week < throughWeekExclusive && game.teamExternalId === teamExternalId,
  );
  const policyMetrics = included.map((game) => game.policyVariants[policy]);
  return {
    teamExternalId,
    teamId,
    season,
    throughWeekExclusive,
    aggregationMode,
    policy,
    gamesIncluded: included.length,
    metrics: combinePolicyMetrics(policyMetrics, aggregationMode, policy),
  };
}
