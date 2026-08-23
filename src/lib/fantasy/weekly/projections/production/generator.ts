import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { buildTrainingRow, type HistoricalTeamGameRow, type ScheduleTeamWeek, type SnapShareLookup, type UniverseCandidate } from "../build";
import { WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION, type WeeklyFantasyProjectionDeploymentBundle } from "../model/deploymentFit";
import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "../model/frozenSpec";
import { computeShadowProjection } from "../shadow/inference";
import { WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION } from "../shadow/inferencePolicy";
import {
  WEEKLY_FANTASY_PROJECTION_PRODUCTION_ARTIFACT_SCHEMA_VERSION,
  weeklyFantasyProjectionProductionArtifactSchema,
  assertProductionArtifactRankInvariants,
  type WeeklyFantasyProjectionProductionArtifact,
  type WeeklyFantasyProjectionProductionRow,
} from "./artifactContract";
import {
  WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION,
  computeOpponentFpaContext,
  computeScoringEnvironmentContext,
  leagueAverageBlendedOpponentFpa,
} from "./context";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";

const POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

/**
 * One resolved, pregame-known candidate for the target season/week. Built by
 * the caller from identity/roster/schedule sources (e.g.
 * `buildWeek1ShadowUniverse`, which is generic on season/week despite its
 * name) -- this module performs no identity resolution of its own.
 */
export type ProductionProjectionCandidate = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  team: string;
  opponent: string;
  homeAway: "home" | "away" | "neutral";
  rosProjectedPpg: number | null;
};

export type BuildProductionProjectionArtifactInput = {
  season: number;
  week: number;
  generatedAt: string;
  inputAsOf: string;
  candidates: readonly ProductionProjectionCandidate[];
  /**
   * Player-week outcomes strictly before `{season, week}` -- prior-season
   * rows plus any current-season rows for weeks < `week`. Passing rows for
   * `week` or later is a caller defect; `buildTrainingRow` only ever reads
   * rows with `row.week < target.week` for the current season and
   * `row.season === target.season - 1` for the prior season, so it cannot by
   * itself leak a later week, but the caller must not pass one in expecting
   * it to be silently ignored for freshness-reporting purposes.
   */
  history: readonly HistoricalPlayerWeek[];
  teamHistory?: readonly HistoricalTeamGameRow[];
  schedule?: readonly ScheduleTeamWeek[];
  snapShareFor?: SnapShareLookup;
  deploymentBundle: WeeklyFantasyProjectionDeploymentBundle;
  provenance: WeeklyFantasyProjectionProductionArtifact["provenance"];
  /**
   * Current market (spread/total) authority for the target week, e.g. the
   * `currentMarket` map from `public/data/nfl/matchup-market.json`
   * (`@/lib/nfl/marketData`'s `MarketArtifact`). Omit or pass `null` when no
   * fresher market artifact is available -- `scoringEnvironmentAdjustment`
   * then resolves to `0` with `marketContextAvailable: false` for every row
   * rather than fabricating an implied total.
   */
  currentMarket?: Readonly<Record<string, MarketCurrentGame>> | null;
};

/** Throws if any history row is at or after the target week/season -- a defense-in-depth check on top of `buildTrainingRow`'s own filtering. */
function assertNoFutureHistory(history: readonly HistoricalPlayerWeek[], season: number, week: number): void {
  for (const row of history) {
    if (row.season > season || (row.season === season && row.week >= week)) {
      throw new Error(
        `History row for player "${row.playerId}" (season ${row.season}, week ${row.week}) is not strictly before the target week ${season}/${week}.`,
      );
    }
  }
}

export function buildProductionProjectionArtifact(
  input: BuildProductionProjectionArtifactInput,
): WeeklyFantasyProjectionProductionArtifact {
  assertNoFutureHistory(input.history, input.season, input.week);

  const seenGsis = new Map<string, number>();
  const grouped: Record<FantasyPosition, WeeklyFantasyProjectionProductionRow[]> = { QB: [], RB: [], WR: [], TE: [] };

  const currentMarket = input.currentMarket ?? null;
  const leagueAverageFpaByPosition = new Map<FantasyPosition, number | null>();
  const leagueAverageFpaFor = (position: FantasyPosition): number | null => {
    if (!leagueAverageFpaByPosition.has(position)) {
      leagueAverageFpaByPosition.set(position, leagueAverageBlendedOpponentFpa(input.history, input.season, input.week, position));
    }
    return leagueAverageFpaByPosition.get(position) ?? null;
  };

  for (const candidate of input.candidates) {
    if (!POSITIONS.includes(candidate.position)) {
      throw new Error(`Unsupported position "${candidate.position}" for player "${candidate.playerId}".`);
    }
    seenGsis.set(candidate.playerId, (seenGsis.get(candidate.playerId) ?? 0) + 1);

    const target: UniverseCandidate = {
      season: input.season, week: input.week,
      playerId: candidate.playerId, playerName: candidate.playerName, position: candidate.position,
      team: candidate.team, opponent: candidate.opponent, eligible: true,
    };
    const row = buildTrainingRow(
      target, input.history, input.teamHistory ?? [], input.schedule ?? [],
      input.snapShareFor ?? (() => null), input.generatedAt,
    );

    const bundle = candidate.position === "QB" ? null : input.deploymentBundle.positions[candidate.position as "RB" | "WR" | "TE"];
    const projection = computeShadowProjection({ ...row, homeAway: candidate.homeAway === "neutral" ? "home" : candidate.homeAway }, candidate.rosProjectedPpg, bundle);

    if (!Number.isFinite(projection.projectedFantasyPoints)) {
      throw new Error(`Non-finite projectedFantasyPoints for player "${candidate.playerId}".`);
    }

    const scoringEnvironment = computeScoringEnvironmentContext(
      candidate.position, currentMarket, input.season, input.week, candidate.team,
    );
    const opponentFpa = computeOpponentFpaContext(candidate.position, projection.baselineFantasyPoints, {
      priorSeasonFpa: row.opponentPositionFpaPriorSeason,
      currentSeasonFpa: row.opponentPositionFpaPrior,
      currentSeasonGames: row.opponentPositionFpaGamesPrior,
      leagueAverageFpa: leagueAverageFpaFor(candidate.position),
    });

    const projectedFantasyPoints =
      projection.projectedFantasyPoints + scoringEnvironment.scoringEnvironmentAdjustment + opponentFpa.opponentFpaAdjustment;
    if (!Number.isFinite(projectedFantasyPoints)) {
      throw new Error(`Non-finite context-adjusted projectedFantasyPoints for player "${candidate.playerId}".`);
    }

    grouped[candidate.position].push({
      playerId: candidate.playerId, playerName: candidate.playerName, position: candidate.position,
      team: candidate.team, opponent: candidate.opponent, homeAway: candidate.homeAway, kickoff: row.kickoff,
      positionRank: 0, // assigned after sort, below
      projectedFantasyPoints,
      baselineFantasyPoints: projection.baselineFantasyPoints,
      rosProjectedPpg: projection.rosProjectedPpg,
      priorSeasonPpg: projection.priorSeasonPpg,
      seasonPpgPrior: projection.seasonPpgPrior,
      priorGames: projection.priorGames,
      modelAuthority: projection.modelAuthority,
      inferenceAuthority: WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION,
      components: {
        ...projection.components,
        scoringEnvironmentAdjustment: scoringEnvironment.scoringEnvironmentAdjustment,
        opponentFpaAdjustment: opponentFpa.opponentFpaAdjustment,
      },
      context: {
        contextPolicyVersion: WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION,
        scoringEnvironment: {
          marketContextAvailable: scoringEnvironment.marketContextAvailable,
          teamImpliedTotal: scoringEnvironment.teamImpliedTotal,
          leagueAverageImpliedTeamTotal: scoringEnvironment.leagueAverageImpliedTeamTotal,
          impliedTotalDelta: scoringEnvironment.impliedTotalDelta,
        },
        opponentFpa: {
          opponentFpaPerGamePriorSeason: opponentFpa.opponentFpaPerGamePriorSeason,
          opponentFpaPerGameCurrentSeason: opponentFpa.opponentFpaPerGameCurrentSeason,
          opponentFpaLeagueAverage: opponentFpa.opponentFpaLeagueAverage,
          opponentFpaCurrentSeasonGames: opponentFpa.opponentFpaCurrentSeasonGames,
          opponentFpaCurrentSeasonWeight: opponentFpa.opponentFpaCurrentSeasonWeight,
          opponentFpaPriorSeasonWeight: opponentFpa.opponentFpaPriorSeasonWeight,
          opponentFpaBlended: opponentFpa.opponentFpaBlended,
          opponentFpaRatio: opponentFpa.opponentFpaRatio,
          fallbackReason: opponentFpa.fallbackReason,
        },
      },
      residualActivated: projection.residualActivated,
      residualActivationReason: projection.residualActivationReason,
      confidence: projection.confidence,
      missingInputs: projection.confidence.missingInputs,
      provenance: input.provenance,
    });
  }

  const duplicateGsisIds = [...seenGsis.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicateGsisIds.length > 0) {
    throw new Error(`Duplicate GSIS id(s) in production candidate universe: ${duplicateGsisIds.sort().join(", ")}`);
  }

  for (const position of POSITIONS) {
    grouped[position].sort((left, right) => right.projectedFantasyPoints - left.projectedFantasyPoints || left.playerId.localeCompare(right.playerId));
    grouped[position].forEach((row, index) => { row.positionRank = index + 1; });
  }

  const artifact: WeeklyFantasyProjectionProductionArtifact = {
    schemaVersion: WEEKLY_FANTASY_PROJECTION_PRODUCTION_ARTIFACT_SCHEMA_VERSION,
    season: input.season, week: input.week,
    scoringVersion: FANTASY_SCORING_VERSION,
    modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
    inferencePolicyVersion: WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION,
    deploymentFitVersion: WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION,
    generatedAt: input.generatedAt, inputAsOf: input.inputAsOf, status: "production",
    provenance: input.provenance,
    rows: grouped,
  };

  const parsed = weeklyFantasyProjectionProductionArtifactSchema.parse(artifact);
  assertProductionArtifactRankInvariants(parsed);
  return parsed;
}
