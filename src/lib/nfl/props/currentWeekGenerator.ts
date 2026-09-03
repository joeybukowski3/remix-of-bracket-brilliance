/**
 * Phase 9: current-week yardage projection orchestrator. Ties together the
 * live roster universe, the "ForTarget" live feature-row builders, the
 * production model fits, the frozen Matchup Score reference/weights, and
 * empirical prediction intervals into one canonical artifact. This module
 * contains no data loading (no `fs`/`fetch`) -- every input is passed in
 * already parsed, so it stays unit-testable without touching disk.
 */
import type { NflGameJoinRecord, NflPropRawGameRecord } from "./historicalOutcomes";
import type { NflTeamPregameFeatures, NflTeamGamePlayVolumeRecord } from "./types/teamPregameFeatures";
import { buildTeamPregameFeatures, type NflTeamGameLogEntry } from "./teamPlayVolume";
import type { NflTeamEpaGameLogEntry } from "./qbPassingEpaContext";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import {
  buildCurrentWeekRosterUniverse,
  type NflCurrentWeekCandidate,
  type NflCurrentWeekRosterSourceRow,
  type NflCurrentWeekUnresolvedRosterRow,
} from "./currentWeekRosterUniverse";
import { resolvePassingStarters } from "./qbStarterResolution";
import { computeDepthChartStaleness, fallbackRoleEvidence, type NflDepthChartIndex } from "./currentWeekDepthChart";
import { buildQbPassingFeatureRowForTarget, type NflQbStatGameLogEntry } from "./qbPassingFeatures";
import { buildRushingFeatureRowForTarget, type NflPlayerRushingStatLogEntry } from "./rushingFeatures";
import { buildReceivingFeatureRowForTarget, type NflPlayerReceivingStatLogEntry } from "./receivingFeatures";
import {
  allocateReceivingTargetsForTeam,
  NFL_RECEIVING_V2_MODEL_VERSION,
  type NflReceivingAllocationCandidate,
  type NflReceivingShareModel,
} from "./roleAllocation/receivingProduction";
import type { NflQbPassingFeatureRow } from "./types/qbPassingFeatures";
import type { NflRushingFeatureRow } from "./types/rushingFeatures";
import type { NflReceivingFeatureRow } from "./types/receivingFeatures";
import { encodePassingFeatureRow, extractRawPassingFeatureValues, PASSING_FEATURE_KEYS } from "./qbPassingEncoding";
import {
  PRODUCTION_TRAIN_SEASONS, MODEL_VERSIONS, INTERVAL_VERSION,
  fitPassingModel, fitRushingModel, fitReceivingModel,
  predictPassing, predictRushing, predictReceiving,
  buildPassingResidualQuantiles, buildRushingResidualQuantiles, buildReceivingResidualQuantiles,
} from "./currentWeekYardageModel";
import { applyInterval, type NflResidualQuantiles } from "./predictionIntervals";
import { PASSING_DIMENSIONS, RUSHING_DIMENSIONS, RECEIVING_DIMENSIONS } from "./matchupScoreDimensions";
import { buildPooledReference, buildGroupedReference, scoreLiveRowPooled, scoreLiveRowGrouped, type NflFrozenScoreDefinition } from "./currentWeekMatchupScore";
import { NFL_YARDAGE_MATCHUP_SCORE_SCHEMA_VERSION, NFL_YARDAGE_MATCHUP_SCORE_VERSION, NFL_YARDAGE_MATCHUP_REFERENCE_VERSION } from "./types/matchupScore";
import type { NflYardageMatchupScore } from "./types/matchupScore";
import {
  NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION, NFL_CURRENT_WEEK_TEMPORAL_CONTRACT,
  type NflCurrentWeekProjectionArtifact, type NflCurrentWeekProjectionRow,
  type NflCurrentWeekPassingRow, type NflCurrentWeekRushingRow, type NflCurrentWeekReceivingRow,
  type NflCurrentWeekHardCaseFlags, type NflCurrentWeekHistoryStatus, type NflCurrentWeekQaSummary,
} from "./types/currentWeekProjection";

const FINAL_TRAIN_SEASONS: readonly number[] = [2022, 2023, 2024];

export type NflCurrentWeekSources = {
  season: number;
  week: number;
  generatedAt: string;
  rosterRows: readonly NflCurrentWeekRosterSourceRow[];
  games: readonly NflPropRawGameRecord[];
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
  fullTeamGameLog: readonly NflTeamGameLogEntry[];
  passEpaGameLog: readonly NflTeamEpaGameLogEntry[];
  rushEpaGameLog: readonly NflTeamEpaGameLogEntry[];
  marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
  marketAvailable: boolean;
  domeByGameId: ReadonlyMap<string, boolean>;
  qbStatGameLog: readonly NflQbStatGameLogEntry[];
  playerRushingStatLog: readonly NflPlayerRushingStatLogEntry[];
  playerReceivingStatLog: readonly NflPlayerReceivingStatLogEntry[];
  teamTopRbCarryShareByGameTeam: ReadonlyMap<string, number>;
  teamTopTargetShareByGameTeam: ReadonlyMap<string, number>;
  rushActivityLog: readonly { playerId: string; season: number; gameDateUtc: string; activityCount: number }[];
  targetActivityLog: readonly { playerId: string; season: number; gameDateUtc: string; activityCount: number }[];
  attemptActivityLog: readonly { playerId: string; season: number; gameDateUtc: string; activityCount: number }[];
  // Historical feature rows for model fit / score reference / interval construction (2022-2025).
  historicalPassingRows: readonly NflQbPassingFeatureRow[];
  historicalRushingRows: readonly NflRushingFeatureRow[];
  historicalReceivingRows: readonly NflReceivingFeatureRow[];
  scoreDefinitions: { passing: NflFrozenScoreDefinition; rushing: NflFrozenScoreDefinition; receiving: NflFrozenScoreDefinition };
  generationMode?: "currentWeek" | "historicalReplay";
  /** Phase 9.2: null when the depth-chart source is unavailable this run -- generation still succeeds via Phase 9.1 fallback behavior (see `depthChartSource` on the returned artifact). */
  depthChartIndex: NflDepthChartIndex | null;
  /**
   * WU4B S6: when present, the receiving VOLUME leg is produced by
   * `nfl-receiving-share-x-efficiency-v2.0.0` (finite targetable-pass pool
   * allocation) instead of the v1 per-player projection. The v1 YPT
   * efficiency leg is unchanged. Absent => v1 receiving behaviour
   * (backwards compatible). QB rushing and the rushing model are untouched
   * by S6.
   */
  receivingShareModel?: NflReceivingShareModel;
  /** WU4B S6: WU4A `projected_pass_attempts` (dropbacks) per team for the target week. A team missing here falls back to v1 for its receivers. */
  teamOpportunityDropbacksByTeam?: ReadonlyMap<string, number>;
  /** Optional infrastructure-only observer. It receives the exact fitted states and live feature rows used during generation without changing the browser artifact. */
  archiveObserver?: {
    onFittedModels(models: { passing: ReturnType<typeof fitPassingModel>; rushing: ReturnType<typeof fitRushingModel>; receiving: ReturnType<typeof fitReceivingModel> }): void;
    onPrediction(input: { row: NflCurrentWeekProjectionRow; featureValues: unknown; orderedVector?: number[]; imputationFlags?: Record<string, string> }): void;
  };
};

function historyStatusFor(gamesPriorThisSeason: number, hasPriorSeason: boolean): NflCurrentWeekHistoryStatus {
  if (gamesPriorThisSeason === 0 && !hasPriorSeason) return "noHistory";
  if (gamesPriorThisSeason < 3 && !hasPriorSeason) return "limitedHistory";
  return "normal";
}

function mostRecentTeam<T extends { playerId: string; team: string; gameDateUtc: string }>(
  log: readonly T[],
  playerId: string,
  beforeDateUtc: string,
): string | null {
  const prior = log.filter((e) => e.playerId === playerId && e.gameDateUtc < beforeDateUtc).sort((a, b) => b.gameDateUtc.localeCompare(a.gameDateUtc));
  return prior[0]?.team ?? null;
}

function buildLiveTeamPregameFeatures(
  season: number, week: number, team: string, opponent: string, gameId: string,
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>, fullTeamGameLog: readonly NflTeamGameLogEntry[],
): NflTeamPregameFeatures {
  const syntheticTarget: NflTeamGamePlayVolumeRecord = {
    gameId, season, week, team, opponent,
    eligiblePlays: 0, passPlays: 0, rushPlays: 0, neutralEligiblePlays: 0, neutralPassPlays: 0, passOeSum: 0, passOeCount: 0,
  };
  return buildTeamPregameFeatures(syntheticTarget, gameJoinIndex, fullTeamGameLog);
}

function toScoreObject<M extends "passing" | "rushing" | "receiving">(
  market: M,
  identity: { season: number; week: number; gameId: string; playerId: string; playerName: string; team: string; opponent: string; generatedAt: string },
  result: { matchupScore: number; opportunityScore: number; environmentScore: number; components: Readonly<Record<string, { score: number; indicatorScores: Readonly<Record<string, number>> }>> },
  position?: "RB" | "WR" | "TE",
): NflYardageMatchupScore {
  const base = {
    schemaVersion: NFL_YARDAGE_MATCHUP_SCORE_SCHEMA_VERSION, scoreVersion: NFL_YARDAGE_MATCHUP_SCORE_VERSION,
    referenceDistributionVersion: NFL_YARDAGE_MATCHUP_REFERENCE_VERSION,
    season: identity.season, week: identity.week, gameId: identity.gameId, playerId: identity.playerId, playerName: identity.playerName,
    team: identity.team, opponent: identity.opponent, matchupScore: result.matchupScore, opportunityScore: result.opportunityScore,
    environmentScore: result.environmentScore, generatedAt: identity.generatedAt,
  };
  if (market === "passing") {
    return {
      ...base, market: "passing",
      components: {
        opportunity: result.components.opportunity, opponent: result.components.opponent,
        gameEnvironment: result.components.gameEnvironment, passingQuality: result.components.passingQuality,
      },
    } as NflYardageMatchupScore;
  }
  if (market === "rushing") {
    return {
      ...base, market: "rushing",
      components: {
        workload: result.components.workload, roleQuality: result.components.roleQuality,
        teamRushingEnvironment: result.components.teamRushingEnvironment, opponent: result.components.opponent,
      },
    } as NflYardageMatchupScore;
  }
  return {
    ...base, market: "receiving", position: position as "RB" | "WR" | "TE",
    components: {
      opportunity: result.components.opportunity, roleStability: result.components.roleStability,
      opponent: result.components.opponent, efficiencyProfile: result.components.efficiencyProfile,
    },
  } as NflYardageMatchupScore;
}

function emptyDistribution() {
  return { n: 0, mean: null, p10: null, p50: null, p90: null };
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index];
}

function distributionOf(values: readonly number[]) {
  if (values.length === 0) return emptyDistribution();
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, mean: sorted.reduce((s, v) => s + v, 0) / sorted.length, p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) };
}

/**
 * Generates the current-week projection artifact. Deterministic given
 * identical `sources` -- every model fit is closed-form ridge/shrinkage
 * (no randomness), every reference/eligibility computation reads only
 * `sources` fields that are themselves strictly-prior-to-kickoff by
 * construction (the adversarial leakage tests in the test file assert
 * this holds even under a mutated target-week outcome).
 */
export function generateCurrentWeekYardageProjections(sources: NflCurrentWeekSources): NflCurrentWeekProjectionArtifact {
  const { season, week } = sources;

  // Hard leakage guard: no historical training/reference/interval row may ever
  // describe the exact target (season, week), regardless of generation mode.
  // This is a no-op for a genuine future/current week (that data cannot exist
  // yet) and is the load-bearing guard for `generationMode: "historicalReplay"`,
  // where the replay season is otherwise a legitimate member of
  // `PRODUCTION_TRAIN_SEASONS`/`FINAL_TRAIN_SEASONS`.
  const notTargetWeek = <T extends { season: number; week: number }>(r: T) => !(r.season === season && r.week === week);
  const historicalPassingRows = sources.historicalPassingRows.filter(notTargetWeek);
  const historicalRushingRows = sources.historicalRushingRows.filter(notTargetWeek);
  const historicalReceivingRows = sources.historicalReceivingRows.filter(notTargetWeek);

  // Phase 9.2 source-failure handling: a stale or missing depth-chart
  // snapshot never silently masquerades as current sourced evidence --
  // generation falls back to Phase 9.1 historical-volume/scarcity-floor
  // behavior only, with the failure disclosed on `depthChartSource`.
  const rawStaleness = computeDepthChartStaleness(sources.depthChartIndex?.sourceSnapshotAt ?? null, sources.generatedAt);
  const depthChartSource = {
    available: sources.depthChartIndex != null && !rawStaleness.isStale,
    stale: sources.depthChartIndex != null && rawStaleness.isStale,
    snapshotAt: sources.depthChartIndex?.sourceSnapshotAt ?? null,
    ageHours: rawStaleness.ageHours,
  };
  const effectiveDepthChartIndex = depthChartSource.available ? sources.depthChartIndex : null;

  const { candidates, unresolved } = buildCurrentWeekRosterUniverse(
    sources.rosterRows, season, week, sources.gameJoinIndex, sources.games,
    sources.rushActivityLog, sources.targetActivityLog, sources.attemptActivityLog,
    effectiveDepthChartIndex,
  );

  const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
  for (const c of candidates) {
    const key = `${season}|${week}|${c.team}`;
    if (!teamPregameFeaturesByKey.has(key)) {
      teamPregameFeaturesByKey.set(key, buildLiveTeamPregameFeatures(season, week, c.team, c.opponent, c.gameId, sources.gameJoinIndex, sources.fullTeamGameLog));
    }
  }

  // --- Model fits (production training window: 2022-2025) ---
  const passingTrain = historicalPassingRows.filter((r) => PRODUCTION_TRAIN_SEASONS.includes(r.season));
  const rushingTrain = historicalRushingRows.filter((r) => PRODUCTION_TRAIN_SEASONS.includes(r.season));
  const receivingTrain = historicalReceivingRows.filter((r) => PRODUCTION_TRAIN_SEASONS.includes(r.season));
  const passingModel = fitPassingModel(passingTrain);
  const rushingModel = fitRushingModel(rushingTrain);
  const receivingModel = fitReceivingModel(receivingTrain);
  sources.archiveObserver?.onFittedModels({ passing: passingModel, rushing: rushingModel, receiving: receivingModel });

  const passingIntervalQ = buildPassingResidualQuantiles(historicalPassingRows);
  const rushingIntervalQ = buildRushingResidualQuantiles(historicalRushingRows);
  const receivingIntervalQ = buildReceivingResidualQuantiles(historicalReceivingRows);

  // --- Matchup Score references (frozen 2022-2024 dev rows only) ---
  const passingDev = historicalPassingRows.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
  const rushingDev = historicalRushingRows.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
  const receivingDev = historicalReceivingRows.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
  const passingReference = buildPooledReference("passing", passingDev, PASSING_DIMENSIONS);
  const rushingReference = buildPooledReference("rushing", rushingDev, RUSHING_DIMENSIONS);
  const receivingReference = buildGroupedReference("receiving", receivingDev, RECEIVING_DIMENSIONS, (row) => row.diagnostics.position);

  const rows: NflCurrentWeekProjectionRow[] = [];
  const fallbackCounts: Record<string, number> = {};
  const bump = (key: string) => { fallbackCounts[key] = (fallbackCounts[key] ?? 0) + 1; };

  // --- Passing: one candidate row per team (the resolved starter). Every
  // team with at least one ACT QB gets a row -- passing candidacy is
  // decided entirely by roster/role evidence (`qbStarterResolution.ts`),
  // never gated on the historical `passingEligiblePregame` threshold. A
  // rookie/new starter with zero qualifying prior-season attempts still
  // gets a projected row (via the model's own league-mean shrinkage
  // fallback), flagged `historyStatus: "noHistory"` /
  // `status: "eligibleInsufficientHistory"` / `roleUncertain: true`
  // instead of being silently omitted (Phase 9.1).
  const starters = resolvePassingStarters(candidates, sources.qbStatGameLog, effectiveDepthChartIndex);
  const teamsWithAnActQb = new Set(starters.map((s) => s.candidate.team));
  const ambiguousQbDepthGroups: string[] = [];
  for (const s of starters) {
    const c = s.candidate;
    if (s.sourceAmbiguous) ambiguousQbDepthGroups.push(c.team);
    const noHistoryAtAll = s.gamesStartedPriorThisSeason === 0 && !s.hasPriorSeasonStarts;
    const status = noHistoryAtAll ? "eligibleInsufficientHistory" : "projected";
    const historyStatus = historyStatusFor(s.gamesStartedPriorThisSeason, s.hasPriorSeasonStarts);
    const liveRow = buildQbPassingFeatureRowForTarget(
      { season, week, gameId: c.gameId, team: c.team, opponent: c.opponent, primaryQbPlayerId: c.playerId, primaryQbPlayerName: c.playerName, gameDateUtc: c.gameDateUtc, homeAway: c.homeAway },
      { teamPregameFeaturesByKey, fullTeamGameLog: sources.fullTeamGameLog, epaGameLog: sources.passEpaGameLog, marketByKey: sources.marketByKey, domeByGameId: sources.domeByGameId, qbStatGameLog: sources.qbStatGameLog },
    );
    const projectedYards = predictPassing(passingModel, liveRow);
    const interval = applyInterval(projectedYards, passingIntervalQ);
    const estimatedRange: NflCurrentWeekPassingRow["estimatedRange"] = { estimatedLow: interval.low, estimatedHigh: interval.high, nominalLevel: passingIntervalQ.nominalLevel, intervalVersion: INTERVAL_VERSION };
    if (noHistoryAtAll) bump("passing_noHistoryFallback");
    if (s.resolution === "sourcedDepthChart") bump("passing_sourcedDepthChart");
    const priorTeam = mostRecentTeam(sources.qbStatGameLog, c.playerId, c.gameDateUtc);
    const roleUncertain = (s.starterUncertain || s.multiQbRoleUncertain) && s.resolution !== "sourcedDepthChart";
    const flags: NflCurrentWeekHardCaseFlags = {
      noHistory: historyStatus === "noHistory", limitedHistory: historyStatus === "limitedHistory",
      multiQbRoleUncertain: s.multiQbRoleUncertain, committeeRole: false, zeroTargetRisk: false,
      teamChanged: priorTeam != null && priorTeam !== c.team, roleUncertain,
    };
    const matchup = scoreLiveRowPooled(liveRow, PASSING_DIMENSIONS, passingReference, sources.scoreDefinitions.passing);
    const passingRow: NflCurrentWeekPassingRow = {
      schemaVersion: NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION, season, week, gameId: c.gameId, kickoff: c.gameDateUtc,
      playerId: c.playerId, playerName: c.playerName, team: c.team, opponent: c.opponent, homeAway: c.homeAway, position: "QB",
      market: "passing", status, historyStatus, generatedAt: sources.generatedAt, modelVersion: MODEL_VERSIONS.passing,
      fallbackProvenance: s.resolution === "sourcedDepthChart" ? "depthChart" : "starterHeuristic",
      roleSource: s.roleEvidence.roleSource, roleSourceUpdatedAt: s.roleEvidence.roleSourceUpdatedAt,
      depthRank: s.roleEvidence.depthRank, starterFlag: s.roleEvidence.starterFlag, roleConfidence: s.roleEvidence.roleConfidence,
      projectedYards, directModelPrediction: projectedYards, estimatedRange,
      matchupScore: toScoreObject("passing", { season, week, gameId: c.gameId, playerId: c.playerId, playerName: c.playerName, team: c.team, opponent: c.opponent, generatedAt: sources.generatedAt }, matchup),
      hardCaseFlags: flags,
      featureSnapshot: {
        qbAttemptsPerGame: liveRow.features.opportunity.qbAttemptsPerGame,
        yardsPerAttempt: liveRow.features.qbEfficiency.yardsPerAttempt,
        completionPct: liveRow.features.qbEfficiency.completionPct,
        teamPassAttemptsPerGame: liveRow.features.opportunity.passAttemptsPerGame,
        teamDropbackRate: liveRow.features.proePassTendency.overallDropbackRate,
        earlyDownNeutralPassRate: liveRow.features.proePassTendency.earlyDownNeutralPassRate,
        passRateOverExpected: liveRow.features.proePassTendency.passRateOverExpected,
        market: { spread: liveRow.features.market.spread, total: liveRow.features.market.total, impliedTeamTotal: liveRow.features.market.impliedTeamTotal, isDome: liveRow.features.market.isDome },
      },
      diagnostics: {
        starterResolution: s.resolution === "noCompetingQb" ? "onlyActiveQb" : s.resolution === "rosterOnlyCandidate" ? "noHistoryFallback" : s.resolution === "sourcedDepthChart" ? "sourcedDepthChart" : "rollingAttemptsLeader",
        gamesStartedPriorThisSeason: s.gamesStartedPriorThisSeason,
        sourceAmbiguous: s.sourceAmbiguous,
      },
    };
    rows.push(passingRow);
    const passingRawValues = extractRawPassingFeatureValues(liveRow as unknown as NflQbPassingFeatureRow);
    sources.archiveObserver?.onPrediction({
      row: passingRow,
      featureValues: liveRow.features,
      orderedVector: encodePassingFeatureRow(liveRow as unknown as NflQbPassingFeatureRow, passingModel.fallbacks),
      imputationFlags: Object.fromEntries(PASSING_FEATURE_KEYS.flatMap((feature, index) => passingRawValues[index] == null ? [[feature.key, "training_mean"]] : [])),
    });
  }
  const teamsWithoutActQb = new Set(candidates.map((c) => c.team)).size > 0
    ? [...new Set(candidates.map((c) => c.team))].filter((t) => !teamsWithAnActQb.has(t))
    : [];

  // --- Rushing ---
  for (const c of candidates) {
    if (!c.rushingEligiblePregame) continue;
    const liveRow = buildRushingFeatureRowForTarget(
      { season, week, gameId: c.gameId, team: c.team, opponent: c.opponent, playerId: c.playerId, playerName: c.playerName, position: c.position, gameDateUtc: c.gameDateUtc, homeAway: c.homeAway },
      { teamPregameFeaturesByKey, fullTeamGameLog: sources.fullTeamGameLog, rushEpaGameLog: sources.rushEpaGameLog, marketByKey: sources.marketByKey, domeByGameId: sources.domeByGameId, playerRushingStatLog: sources.playerRushingStatLog, teamTopRbCarryShareByGameTeam: sources.teamTopRbCarryShareByGameTeam },
    );
    const historyStatus = historyStatusFor(liveRow.diagnostics.gamesWithCarriesPriorThisSeason, liveRow.diagnostics.hasPriorSeasonCarries);
    const status = historyStatus === "noHistory" ? "eligibleInsufficientHistory" : "projected";
    const prediction = predictRushing(rushingModel, liveRow);
    const interval = applyInterval(prediction.predicted, rushingIntervalQ);
    const priorTeam = mostRecentTeam(sources.playerRushingStatLog, c.playerId, c.gameDateUtc);
    const concentration = liveRow.diagnostics.recentTeamTopCarryShareConcentration;
    const flags: NflCurrentWeekHardCaseFlags = {
      noHistory: historyStatus === "noHistory", limitedHistory: historyStatus === "limitedHistory",
      multiQbRoleUncertain: false, committeeRole: concentration != null && concentration < 0.6, zeroTargetRisk: false,
      teamChanged: priorTeam != null && priorTeam !== c.team, roleUncertain: c.rushingRoleUncertain,
    };
    const matchup = scoreLiveRowPooled(liveRow, RUSHING_DIMENSIONS, rushingReference, sources.scoreDefinitions.rushing);
    if (status === "eligibleInsufficientHistory") bump("rushing_noHistoryFallback");
    if (c.rushingRoleUncertain) bump("rushing_rosterScarcityFloorAdmit");
    if (c.rushingFallbackProvenance === "depthChart") bump("rushing_sourcedDepthChart");
    const rushingRoleEvidence = c.rushingRoleEvidence ?? fallbackRoleEvidence("unavailable", "No eligibility evidence recorded (unexpected).");
    const rushingRow: NflCurrentWeekRushingRow = {
      schemaVersion: NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION, season, week, gameId: c.gameId, kickoff: c.gameDateUtc,
      playerId: c.playerId, playerName: c.playerName, team: c.team, opponent: c.opponent, homeAway: c.homeAway, position: c.position,
      market: "rushing", status, historyStatus, generatedAt: sources.generatedAt, modelVersion: MODEL_VERSIONS.rushing,
      fallbackProvenance: c.rushingFallbackProvenance ?? "historicalVolume",
      roleSource: rushingRoleEvidence.roleSource, roleSourceUpdatedAt: rushingRoleEvidence.roleSourceUpdatedAt,
      depthRank: rushingRoleEvidence.depthRank, starterFlag: rushingRoleEvidence.starterFlag, roleConfidence: rushingRoleEvidence.roleConfidence,
      projectedCarries: prediction.projectedCarries, projectedYardsPerCarry: prediction.projectedYpc, projectedYards: prediction.predicted,
      estimatedRange: { estimatedLow: interval.low, estimatedHigh: interval.high, nominalLevel: rushingIntervalQ.nominalLevel, intervalVersion: INTERVAL_VERSION },
      matchupScore: toScoreObject("rushing", { season, week, gameId: c.gameId, playerId: c.playerId, playerName: c.playerName, team: c.team, opponent: c.opponent, generatedAt: sources.generatedAt }, matchup),
      hardCaseFlags: flags,
      featureSnapshot: {
        carriesPerGame: liveRow.features.playerUsage.carriesPerGame,
        carryShare: liveRow.features.playerUsage.carryShare,
        rollingYardsPerCarry: liveRow.features.playerEfficiency.yardsPerCarry,
        teamRushAttemptsPerGame: liveRow.features.teamEnvironment.rushAttemptsPerGame,
        teamDropbackRate: liveRow.features.teamEnvironment.overallDropbackRate,
        teamPassRateOverExpected: liveRow.features.teamEnvironment.passRateOverExpected,
        opponentRushAttemptsAllowedPerGame: liveRow.features.opponentRushDefense.rushAttemptsPerGameAllowed,
        market: { spread: liveRow.features.market.spread, total: liveRow.features.market.total, impliedTeamTotal: liveRow.features.market.impliedTeamTotal, isDome: liveRow.features.market.isDome },
      },
      diagnostics: { gamesWithCarriesPriorThisSeason: liveRow.diagnostics.gamesWithCarriesPriorThisSeason, recentTeamTopCarryShareConcentration: concentration },
    };
    rows.push(rushingRow);
    sources.archiveObserver?.onPrediction({ row: rushingRow, featureValues: liveRow.features });
  }

  // --- Receiving ---
  // WU4B S6: when `sources.receivingShareModel` is present the target-VOLUME
  // leg is produced by a finite targetable-pass pool allocation per
  // team-game (`nfl-receiving-share-x-efficiency-v2.0.0`); the v1 YPT
  // efficiency leg is unchanged. Absent => exact v1 behaviour.
  type ReceivingUnit = {
    c: (typeof candidates)[number];
    liveRow: ReturnType<typeof buildReceivingFeatureRowForTarget>;
    historyStatus: NflCurrentWeekHistoryStatus;
    status: "projected" | "eligibleInsufficientHistory";
    prediction: ReturnType<typeof predictReceiving>;
    priorTeam: string | null;
    flags: NflCurrentWeekHardCaseFlags;
    matchup: ReturnType<typeof scoreLiveRowGrouped>;
    receivingRoleEvidence: ReturnType<typeof fallbackRoleEvidence>;
  };
  const receivingUnits: ReceivingUnit[] = [];
  for (const c of candidates) {
    if (!c.receivingEligiblePregame || c.position === "QB") continue;
    const liveRow = buildReceivingFeatureRowForTarget(
      { season, week, gameId: c.gameId, team: c.team, opponent: c.opponent, playerId: c.playerId, playerName: c.playerName, position: c.position as "RB" | "WR" | "TE", gameDateUtc: c.gameDateUtc, homeAway: c.homeAway },
      { teamPregameFeaturesByKey, fullTeamGameLog: sources.fullTeamGameLog, passEpaGameLog: sources.passEpaGameLog, marketByKey: sources.marketByKey, domeByGameId: sources.domeByGameId, playerReceivingStatLog: sources.playerReceivingStatLog, teamTopTargetShareByGameTeam: sources.teamTopTargetShareByGameTeam },
    );
    const historyStatus = historyStatusFor(liveRow.diagnostics.gamesWithTargetsPriorThisSeason, liveRow.diagnostics.hasPriorSeasonTargets);
    const status = historyStatus === "noHistory" ? "eligibleInsufficientHistory" : "projected";
    const prediction = predictReceiving(receivingModel, liveRow);
    const priorTeam = mostRecentTeam(sources.playerReceivingStatLog, c.playerId, c.gameDateUtc);
    const rollingTargets = liveRow.features.playerUsage.targetsPerGame.seasonPrior ?? liveRow.features.playerUsage.targetsPerGame.priorSeason;
    const flags: NflCurrentWeekHardCaseFlags = {
      noHistory: historyStatus === "noHistory", limitedHistory: historyStatus === "limitedHistory",
      multiQbRoleUncertain: false, committeeRole: false, zeroTargetRisk: rollingTargets != null && rollingTargets < 2,
      teamChanged: priorTeam != null && priorTeam !== c.team, roleUncertain: c.receivingRoleUncertain,
    };
    if (status === "eligibleInsufficientHistory") bump("receiving_noHistoryFallback");
    if (c.receivingRoleUncertain) bump("receiving_rosterScarcityFloorAdmit");
    if (c.receivingFallbackProvenance === "depthChart") bump("receiving_sourcedDepthChart");
    const matchup = scoreLiveRowGrouped(liveRow, RECEIVING_DIMENSIONS, receivingReference, c.position, sources.scoreDefinitions.receiving);
    const receivingRoleEvidence = c.receivingRoleEvidence ?? fallbackRoleEvidence("unavailable", "No eligibility evidence recorded (unexpected).");
    receivingUnits.push({ c, liveRow, historyStatus, status, prediction, priorTeam, flags, matchup, receivingRoleEvidence });
  }

  // Phase 2: per-team share allocation (v2) or empty map (v1).
  const shareModel: NflReceivingShareModel | undefined = sources.receivingShareModel;
  const allocatedByPlayerGame = new Map<string, { targets: number; yards: number; share: number; priorShare: number | null; fallback: "none" | "noTeamOpportunity" | "equalSplit"; targetablePool: number | null; impliedRatio: number | null; teamResidual: number | null; dropbacks: number | null; rosterCompetitionCount: number | null }>();
  if (shareModel) {
    const byTeamGame = new Map<string, ReceivingUnit[]>();
    for (const u of receivingUnits) (byTeamGame.get(`${u.c.gameId}|${u.c.team}`) ?? byTeamGame.set(`${u.c.gameId}|${u.c.team}`, []).get(`${u.c.gameId}|${u.c.team}`)!).push(u);
    for (const [key, units] of byTeamGame) {
      const team = units[0].c.team;
      const dropbacks = sources.teamOpportunityDropbacksByTeam?.get(team) ?? null;
      const posCount = new Map<string, number>();
      for (const u of units) posCount.set(u.c.position, (posCount.get(u.c.position) ?? 0) + 1);
      const candidatesForTeam: NflReceivingAllocationCandidate[] = units.map((u) => {
        const tp = u.liveRow.features.playerUsage.targetShare;
        const conc = u.liveRow.features.targetConcentration.recentTeamTopTargetShareConcentration;
        return {
          playerId: u.c.playerId,
          playerName: u.c.playerName,
          position: u.c.position as "RB" | "WR" | "TE",
          depthRank: u.receivingRoleEvidence.depthRank,
          roleSourced: u.receivingRoleEvidence.roleConfidence === "sourced",
          priorTargetShare: tp.seasonPrior ?? tp.priorSeason ?? null,
          priorGamesPlayed: u.liveRow.diagnostics.gamesWithTargetsPriorThisSeason + (u.liveRow.diagnostics.hasPriorSeasonTargets ? 1 : 0),
          noHistory: u.historyStatus === "noHistory",
          limitedHistory: u.historyStatus === "limitedHistory",
          teamChanged: u.priorTeam != null ? u.priorTeam !== team : null,
          rosterCompetitionCount: posCount.get(u.c.position) ?? null,
          concentration: conc.seasonPrior ?? conc.priorSeason ?? null,
          v1YardsPerTarget: u.prediction.projectedYpt,
          v1ProjectedTargets: u.prediction.projectedTargets,
        };
      });
      const teamAlloc = allocateReceivingTargetsForTeam({
        team,
        gameId: units[0].c.gameId,
        season,
        week,
        kickoffUtc: units[0].c.gameDateUtc,
        projectedDropbacks: dropbacks,
        candidates: candidatesForTeam,
        model: shareModel,
      });
      if (teamAlloc.usedV1Fallback) bump("receiving_v2NoTeamOpportunityFallback");
      if (!teamAlloc.coherenceOk) bump("receiving_v2CoherenceViolation");
      for (let i = 0; i < teamAlloc.players.length; i += 1) {
        const p = teamAlloc.players[i];
        allocatedByPlayerGame.set(`${key}|${p.playerId}`, {
          targets: p.projectedTargets,
          yards: p.projectedYards,
          share: p.opportunityShare,
          priorShare: p.priorOpportunityShare,
          fallback: p.allocationFallbackReason,
          targetablePool: teamAlloc.projectedTargetablePool,
          impliedRatio: teamAlloc.impliedTargetableRatio,
          teamResidual: teamAlloc.residualUnallocated,
          dropbacks: teamAlloc.projectedDropbacks,
          rosterCompetitionCount: candidatesForTeam[i].rosterCompetitionCount,
        });
      }
    }
  }

  // Phase 3: emit.
  for (const u of receivingUnits) {
    const { c, liveRow, historyStatus, status, prediction, matchup, flags, receivingRoleEvidence } = u;
    const alloc = allocatedByPlayerGame.get(`${c.gameId}|${c.team}|${c.playerId}`);
    const useV2 = !!shareModel && !!alloc;
    const projectedTargets = useV2 ? alloc!.targets : prediction.projectedTargets;
    const projectedYards = useV2 ? alloc!.yards : prediction.predicted;
    const interval = applyInterval(projectedYards, receivingIntervalQ);
    const receivingRow: NflCurrentWeekReceivingRow = {
      schemaVersion: NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION, season, week, gameId: c.gameId, kickoff: c.gameDateUtc,
      playerId: c.playerId, playerName: c.playerName, team: c.team, opponent: c.opponent, homeAway: c.homeAway, position: c.position,
      market: "receiving", status, historyStatus, generatedAt: sources.generatedAt,
      modelVersion: useV2 ? NFL_RECEIVING_V2_MODEL_VERSION : MODEL_VERSIONS.receiving,
      fallbackProvenance: c.receivingFallbackProvenance ?? "historicalVolume",
      roleSource: receivingRoleEvidence.roleSource, roleSourceUpdatedAt: receivingRoleEvidence.roleSourceUpdatedAt,
      depthRank: receivingRoleEvidence.depthRank, starterFlag: receivingRoleEvidence.starterFlag, roleConfidence: receivingRoleEvidence.roleConfidence,
      positionSegment: c.position as "RB" | "WR" | "TE",
      projectedTargets, projectedYardsPerTarget: prediction.projectedYpt, projectedYards,
      estimatedRange: { estimatedLow: interval.low, estimatedHigh: interval.high, nominalLevel: receivingIntervalQ.nominalLevel, intervalVersion: INTERVAL_VERSION },
      matchupScore: toScoreObject("receiving", { season, week, gameId: c.gameId, playerId: c.playerId, playerName: c.playerName, team: c.team, opponent: c.opponent, generatedAt: sources.generatedAt }, matchup, c.position as "RB" | "WR" | "TE"),
      hardCaseFlags: flags,
      featureSnapshot: {
        targetsPerGame: liveRow.features.playerUsage.targetsPerGame,
        targetShare: liveRow.features.playerUsage.targetShare,
        rollingYardsPerTarget: liveRow.features.playerEfficiency.yardsPerTarget,
        teamPassAttemptsPerGame: liveRow.features.teamEnvironment.passAttemptsPerGame,
        teamDropbackRate: liveRow.features.teamEnvironment.overallDropbackRate,
        teamPassRateOverExpected: liveRow.features.teamEnvironment.passRateOverExpected,
        targetConcentration: liveRow.features.targetConcentration.recentTeamTopTargetShareConcentration,
        opponentTargetsAllowedPerGame: liveRow.features.opponentPassDefense.targetsPerGameAllowed,
        market: { spread: liveRow.features.market.spread, total: liveRow.features.market.total, impliedTeamTotal: liveRow.features.market.impliedTeamTotal, isDome: liveRow.features.market.isDome },
      },
      diagnostics: { gamesWithTargetsPriorThisSeason: liveRow.diagnostics.gamesWithTargetsPriorThisSeason },
      ...(useV2 && alloc
        ? {
            allocationDiagnostics: {
              allocationModelVersion: shareModel!.allocationModelVersion,
              fittedArtifactHash: shareModel!.fittedArtifactHash ?? null,
              trainedThroughSeason: shareModel!.trainedThroughSeason ?? null,
              projectedTeamOpportunity: alloc.dropbacks,
              projectedTargetablePool: alloc.targetablePool,
              impliedTargetableRatio: alloc.impliedRatio,
              projectedOpportunityShare: alloc.share,
              priorOpportunityShare: alloc.priorShare,
              priorTeam: u.priorTeam,
              roleConfidenceEvidence: {
                depthRank: receivingRoleEvidence.depthRank,
                roleSourced: receivingRoleEvidence.roleConfidence === "sourced",
                teamChanged: u.priorTeam != null ? u.priorTeam !== c.team : null,
                noHistory: historyStatus === "noHistory",
                limitedHistory: historyStatus === "limitedHistory",
                priorGamesPlayed: liveRow.diagnostics.gamesWithTargetsPriorThisSeason + (liveRow.diagnostics.hasPriorSeasonTargets ? 1 : 0),
                rosterCompetitionCount: alloc.rosterCompetitionCount,
              },
              allocationFallbackReason: alloc.fallback,
              teamResidualUnallocated: alloc.teamResidual,
            },
          }
        : {}),
    };
    rows.push(receivingRow);
    sources.archiveObserver?.onPrediction({ row: receivingRow, featureValues: liveRow.features });
  }

  // --- QA ---
  const byMarket = (market: "passing" | "rushing" | "receiving") => rows.filter((r) => r.market === market);
  const projectionsEmittedByMarket = { passing: byMarket("passing").length, rushing: byMarket("rushing").length, receiving: byMarket("receiving").length };
  // "Excluded" now means genuinely absent from the artifact -- a team with
  // zero ACT QBs (passing), or a skill player beyond the roster-scarcity
  // floor at a position the team already has adequate historical coverage
  // for (rushing/receiving). It no longer means "failed the historical
  // threshold" -- that alone is not exclusion since Phase 9.1.
  const excludedByEligibility = {
    passing: teamsWithoutActQb.length,
    rushing: candidates.filter((c) => !c.rushingEligiblePregame).length,
    receiving: candidates.filter((c) => c.position !== "QB" && !c.receivingEligiblePregame).length,
  };
  const roleUncertainRows = {
    passing: byMarket("passing").filter((r) => r.hardCaseFlags.roleUncertain).length,
    rushing: byMarket("rushing").filter((r) => r.hardCaseFlags.roleUncertain).length,
    receiving: byMarket("receiving").filter((r) => r.hardCaseFlags.roleUncertain).length,
  };
  const limitedOrNoHistoryRows = {
    passing: byMarket("passing").filter((r) => r.historyStatus !== "normal").length,
    rushing: byMarket("rushing").filter((r) => r.historyStatus !== "normal").length,
    receiving: byMarket("receiving").filter((r) => r.historyStatus !== "normal").length,
  };
  const byProvenance = (market: "passing" | "rushing" | "receiving", provenance: string) => byMarket(market).filter((r) => r.fallbackProvenance === provenance).length;
  const sourcedRoleCandidates = { passing: byProvenance("passing", "depthChart"), rushing: byProvenance("rushing", "depthChart"), receiving: byProvenance("receiving", "depthChart") };
  const historicalVolumeCandidates = { passing: byProvenance("passing", "starterHeuristic"), rushing: byProvenance("rushing", "historicalVolume"), receiving: byProvenance("receiving", "historicalVolume") };
  const scarcityFloorCandidates = { passing: 0, rushing: byProvenance("rushing", "rosterScarcityFloor"), receiving: byProvenance("receiving", "rosterScarcityFloor") };
  const noHistoryAndSourced = (market: "passing" | "rushing" | "receiving") => byMarket(market).filter((r) => r.roleConfidence === "sourced" && r.historyStatus === "noHistory").length;
  const noHistorySourcedCandidates = { passing: noHistoryAndSourced("passing"), rushing: noHistoryAndSourced("rushing"), receiving: noHistoryAndSourced("receiving") };
  const missingDepthChartGroups: string[] = [];
  if (effectiveDepthChartIndex) {
    const teamsSeen = new Set(candidates.map((c) => c.team));
    for (const team of teamsSeen) {
      for (const position of ["QB", "RB", "WR", "TE"] as const) {
        if (!effectiveDepthChartIndex.byTeamPosition.has(`${team}|${position}`)) missingDepthChartGroups.push(`${team}|${position}`);
      }
    }
  }
  const yardsOf = (market: "passing" | "rushing" | "receiving") => byMarket(market).map((r) => r.projectedYards).filter((v): v is number => v != null);
  const scoresOf = (market: "passing" | "rushing" | "receiving") => byMarket(market).map((r) => r.matchupScore?.matchupScore).filter((v): v is number => v != null);
  const widthsOf = (market: "passing" | "rushing" | "receiving") => byMarket(market).map((r) => r.estimatedRange).filter((v): v is NonNullable<typeof v> => v != null).map((r) => r.estimatedHigh - r.estimatedLow);

  const gamesExpected = new Set(sources.games.filter((g) => g.season === season && g.week === week && String(g.seasonType).toUpperCase() === "REG").map((g) => g.gameId)).size;
  const gamesResolved = new Set(rows.map((r) => r.gameId)).size;

  const qa: NflCurrentWeekQaSummary = {
    gamesExpected, gamesResolved, playersEvaluated: candidates.length,
    projectionsEmittedByMarket, excludedByEligibility, limitedOrNoHistoryRows, roleUncertainRows,
    unresolvedIdentityRows: unresolved.length, fallbackCounts,
    sourcedRoleCandidates, historicalVolumeCandidates, scarcityFloorCandidates, noHistorySourcedCandidates,
    ambiguousQbDepthGroups, missingDepthChartGroups,
    projectionYardsDistribution: { passing: distributionOf(yardsOf("passing")), rushing: distributionOf(yardsOf("rushing")), receiving: distributionOf(yardsOf("receiving")) },
    matchupScoreDistribution: { passing: distributionOf(scoresOf("passing")), rushing: distributionOf(scoresOf("rushing")), receiving: distributionOf(scoresOf("receiving")) },
    intervalWidthDistribution: { passing: distributionOf(widthsOf("passing")), rushing: distributionOf(widthsOf("rushing")), receiving: distributionOf(widthsOf("receiving")) },
  };

  return {
    schemaVersion: NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION, season, week, generatedAt: sources.generatedAt,
    generationMode: sources.generationMode ?? "currentWeek", temporalContract: NFL_CURRENT_WEEK_TEMPORAL_CONTRACT,
    modelVersions: {
      passing: MODEL_VERSIONS.passing,
      rushing: MODEL_VERSIONS.rushing,
      receiving: sources.receivingShareModel ? NFL_RECEIVING_V2_MODEL_VERSION : MODEL_VERSIONS.receiving,
    },
    scoreVersions: { scoreVersion: NFL_YARDAGE_MATCHUP_SCORE_VERSION, referenceDistributionVersion: NFL_YARDAGE_MATCHUP_REFERENCE_VERSION },
    sourceVersions: {
      trainingSeasons: PRODUCTION_TRAIN_SEASONS, rosterSnapshotSeason: season, rosterSnapshotWeek: week,
      marketSource: sources.marketAvailable ? "matchup-market.json (live current-week feed)" : "unavailable",
    },
    depthChartSource,
    rows, qa,
  };
}

export type { NflCurrentWeekCandidate, NflCurrentWeekUnresolvedRosterRow };
