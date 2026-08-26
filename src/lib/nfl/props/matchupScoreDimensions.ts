/**
 * Market-specific Matchup Score dimension/indicator definitions (Phase 8
 * `docs/nfl-matchup-score-research.md` sections 3-8). Extracted verbatim
 * from `scripts/run-nfl-matchup-score-research.ts` so the frozen research
 * design and any production scorer (Phase 9) share one definition -- never
 * two copies of "what a dimension is" that could silently drift apart.
 * Weights and reference distributions are NOT here: weights come from the
 * frozen `matchup-score-research.json` `selectedDefinition`, and reference
 * distributions must be rebuilt from the same frozen 2022-2024 training
 * rows every consumer uses (`buildDimensionReference`/`buildGroupedDimensionReferences`
 * in `matchupScore.ts`).
 */
import type { MatchupIndicatorDefinition } from "./matchupScore";
import type { NflQbPassingFeatureRow, NflWindowedRate as PassingWindow } from "./types/qbPassingFeatures";
import type { NflRushingFeatureRow, NflWindowedRate as RushingWindow } from "./types/rushingFeatures";
import type { NflReceivingFeatureRow, NflWindowedRate as ReceivingWindow } from "./types/receivingFeatures";

type Window = PassingWindow | RushingWindow | ReceivingWindow;
export type DimensionDefinitions<Row> = Readonly<Record<string, readonly MatchupIndicatorDefinition<Row>[]>>;

/** seasonPrior -> priorSeason coalesce, deliberately WITHOUT last3 (last3 is used only for the stability indicators below). */
export function current(window: Window): number | null {
  return window.seasonPrior ?? window.priorSeason;
}

/** Negative absolute change between last3 and seasonPrior -- higher (closer to 0) means a more stable recent role. Null with no seasonPrior/last3 pair yet (e.g. Week 1-3). */
export function stability(window: Window): number | null {
  if (window.seasonPrior == null || window.last3 == null) return null;
  return -Math.abs(window.last3 - window.seasonPrior);
}

function indicator<Row>(
  key: string,
  value: (row: Row) => number | null,
  direction: "higherIsBetter" | "lowerIsBetter" = "higherIsBetter",
): MatchupIndicatorDefinition<Row> {
  return { key, value, direction };
}

export const PASSING_DIMENSIONS: DimensionDefinitions<NflQbPassingFeatureRow> = {
  opportunity: [
    indicator("teamOffensivePlays", (row) => current(row.features.opportunity.offensivePlaysPerGame)),
    indicator("teamPassAttempts", (row) => current(row.features.opportunity.passAttemptsPerGame)),
    indicator("qbAttemptRole", (row) => current(row.features.opportunity.qbAttemptsPerGame)),
    indicator("dropbackRate", (row) => current(row.features.proePassTendency.overallDropbackRate)),
    indicator("neutralPassRate", (row) => current(row.features.proePassTendency.earlyDownNeutralPassRate)),
    indicator("passRateOverExpected", (row) => current(row.features.proePassTendency.passRateOverExpected)),
  ],
  opponent: [
    indicator("passAttemptsAllowed", (row) => current(row.features.opponentPassDefense.passAttemptsPerGameAllowed)),
    indicator("dropbackRateAllowed", (row) => current(row.features.opponentPassDefense.overallDropbackRateAllowed)),
    indicator("passEpaAllowed", (row) => current(row.features.opponentPassDefense.passEpaPerPlayAllowed)),
  ],
  gameEnvironment: [
    indicator("gameTotal", (row) => row.features.market.total),
    indicator("impliedTeamTotal", (row) => row.features.market.impliedTeamTotal),
    indicator("trailingScriptSpread", (row) => row.features.market.spread),
    indicator("dome", (row) => (row.features.market.isDome == null ? null : row.features.market.isDome ? 1 : 0)),
  ],
  passingQuality: [
    indicator("qbYardsPerAttempt", (row) => current(row.features.qbEfficiency.yardsPerAttempt)),
    indicator("qbCompletionRate", (row) => current(row.features.qbEfficiency.completionPct)),
  ],
};

export const RUSHING_DIMENSIONS: DimensionDefinitions<NflRushingFeatureRow> = {
  workload: [
    indicator("carriesPerGame", (row) => current(row.features.playerUsage.carriesPerGame)),
    indicator("carryShare", (row) => current(row.features.playerUsage.carryShare)),
  ],
  roleQuality: [indicator("teamTopRbCarryShare", (row) => row.diagnostics.recentTeamTopCarryShareConcentration)],
  teamRushingEnvironment: [
    indicator("teamRushAttempts", (row) => current(row.features.teamEnvironment.rushAttemptsPerGame)),
    indicator("teamDropbackRate", (row) => current(row.features.teamEnvironment.overallDropbackRate), "lowerIsBetter"),
    indicator("teamPassRateOverExpected", (row) => current(row.features.teamEnvironment.passRateOverExpected), "lowerIsBetter"),
  ],
  opponent: [
    indicator("rushAttemptsAllowed", (row) => current(row.features.opponentRushDefense.rushAttemptsPerGameAllowed)),
    indicator("rushEpaAllowed", (row) => current(row.features.opponentRushDefense.rushEpaPerPlayAllowed)),
  ],
};

export const RECEIVING_DIMENSIONS: DimensionDefinitions<NflReceivingFeatureRow> = {
  opportunity: [
    indicator("targetsPerGame", (row) => current(row.features.playerUsage.targetsPerGame)),
    indicator("targetShare", (row) => current(row.features.playerUsage.targetShare)),
    indicator("teamPassAttempts", (row) => current(row.features.teamEnvironment.passAttemptsPerGame)),
    indicator("teamDropbackRate", (row) => current(row.features.teamEnvironment.overallDropbackRate)),
    indicator("teamPassRateOverExpected", (row) => current(row.features.teamEnvironment.passRateOverExpected)),
  ],
  roleStability: [
    indicator("targetVolumeStability", (row) => stability(row.features.playerUsage.targetsPerGame)),
    indicator("targetShareStability", (row) => stability(row.features.playerUsage.targetShare)),
  ],
  opponent: [
    indicator("targetsAllowed", (row) => current(row.features.opponentPassDefense.targetsPerGameAllowed)),
    indicator("passEpaAllowed", (row) => current(row.features.opponentPassDefense.passEpaPerPlayAllowed)),
  ],
  efficiencyProfile: [
    indicator("yardsPerTarget", (row) => current(row.features.playerEfficiency.yardsPerTarget)),
    indicator("averageDepthOfTarget", (row) => current(row.features.airYards.adot)),
  ],
};
