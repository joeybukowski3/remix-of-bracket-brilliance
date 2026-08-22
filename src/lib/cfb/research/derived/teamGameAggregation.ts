import { classifyMatchupPopulation } from "./populationPolicy";
import { CFB_PHASE1_METRICS_CONFIG } from "./metricsConfig";
import { computeGarbageTimeWeight } from "./garbageTimePolicy";
import { computePointsPerPlay, computePpaPerPlay, computeYardsPerPlay } from "./ppaMetrics";
import { computeSuccessRates } from "./successMetrics";
import { computeExplosivenessRates } from "./explosiveness";
import { computeSecondsPerPlay, filterSituationNeutralPlays } from "./pace";
import type { PlayMetricRow } from "./playMetricRow";
import type { WeightedPlay } from "./teamGameAggregation.types";
import type { CfbResearchGame } from "../types";
import type {
  CfbDerivedTeamGameMetrics,
  CfbGarbageTimePolicyMetrics,
  CfbGarbageTimePolicyName,
  CfbHomeAwayNeutral,
} from "./types";

const POLICIES: Exclude<CfbGarbageTimePolicyName, "LEVERAGE">[] = ["NONE", "SCORE_QUARTER", "SOFT_WEIGHT"];

function computePolicyMetrics(
  eligiblePlays: readonly PlayMetricRow[],
  policy: Exclude<CfbGarbageTimePolicyName, "LEVERAGE">,
  finalTeamScore: number | null,
): CfbGarbageTimePolicyMetrics {
  const weighted: WeightedPlay[] = eligiblePlays.map((row) => ({
    row,
    weight: computeGarbageTimeWeight(row, policy),
  }));
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  const includedPlayCount = weighted.filter((row) => row.weight > 0).length;

  const ppa = computePpaPerPlay(weighted);
  const success = computeSuccessRates(weighted);
  const explosiveness = computeExplosivenessRates(weighted);
  const pace = computeSecondsPerPlay(weighted.filter((row) => row.weight > 0).map((row) => row.row));

  return {
    policy,
    includedPlayCount,
    totalWeight,
    ypp: computeYardsPerPlay(weighted),
    ppp: computePointsPerPlay(finalTeamScore, totalWeight),
    ppaPerPlay: ppa.ppaPerPlay,
    ppaCoveredPlayCount: ppa.ppaCoveredPlayCount,
    ppaCoveragePct: ppa.ppaCoveragePct,
    ppaSuccessRate: success.ppaSuccessRate,
    earlyDownPpaSuccessRate: success.earlyDownPpaSuccessRate,
    passingDownPpaSuccessRate: success.passingDownPpaSuccessRate,
    downDistanceSuccessRate: success.downDistanceSuccessRate,
    earlyDownDownDistanceSuccessRate: success.earlyDownDownDistanceSuccessRate,
    passingDownDownDistanceSuccessRate: success.passingDownDownDistanceSuccessRate,
    explosivePlayRate: explosiveness.explosivePlayRate,
    explosivePassRate: explosiveness.explosivePassRate,
    explosiveRushRate: explosiveness.explosiveRushRate,
    secondsPerPlay: pace.secondsPerPlay,
  };
}

export type BuildTeamGameMetricsInput = {
  game: CfbResearchGame;
  teamExternalId: string;
  teamId: string | null;
  opponentExternalId: string | null;
  opponentTeamId: string | null;
  classification: string | null;
  opponentClassification: string | null;
  homeAwayNeutral: CfbHomeAwayNeutral;
  finalTeamScore: number | null;
  /** All normalized plays for this game where offenseExternalId === teamExternalId (already classified). */
  offensivePlays: readonly PlayMetricRow[];
  totalNormalizedPlayCount: number;
  identityResolutionPct: number;
};

export function buildTeamGameMetrics(input: BuildTeamGameMetricsInput): CfbDerivedTeamGameMetrics {
  const eligiblePlays = input.offensivePlays.filter((row) => row.eligible);

  const situationNeutralPlays = filterSituationNeutralPlays(eligiblePlays);
  const situationNeutralPace = computeSecondsPerPlay(situationNeutralPlays);

  const policyVariants = Object.fromEntries(
    POLICIES.map((policy) => [policy, computePolicyMetrics(eligiblePlays, policy, input.finalTeamScore)]),
  ) as Record<Exclude<CfbGarbageTimePolicyName, "LEVERAGE">, CfbGarbageTimePolicyMetrics>;

  const nonePolicy = policyVariants.NONE;

  return {
    season: input.game.season,
    week: input.game.week,
    gameId: input.game.gameId,
    teamExternalId: input.teamExternalId,
    teamId: input.teamId,
    opponentExternalId: input.opponentExternalId,
    opponentTeamId: input.opponentTeamId,
    classification: input.classification,
    opponentClassification: input.opponentClassification,
    homeAwayNeutral: input.homeAwayNeutral,
    matchupPopulation: classifyMatchupPopulation(input.game),

    totalNormalizedPlays: input.totalNormalizedPlayCount,
    eligibleScrimmagePlays: eligiblePlays.length,
    ppaCoveredEligiblePlays: nonePolicy.ppaCoveredPlayCount,
    ppaCoveragePct: nonePolicy.ppaCoveragePct,
    identityResolutionPct: input.identityResolutionPct,
    metricsAvailable: nonePolicy.ppaCoveragePct >= CFB_PHASE1_METRICS_CONFIG.minimumUsablePpaCoveragePct,

    situationNeutralSecondsPerPlay: situationNeutralPace.secondsPerPlay,
    situationNeutralPlayCount: situationNeutralPlays.length,

    policyVariants: { ...policyVariants, LEVERAGE: null },
  };
}
