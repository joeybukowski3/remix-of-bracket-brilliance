/**
 * Chronological, leakage-gated backtest of the NBA player-prop models.
 *
 * Per fold: priors, usage buckets and availability rates come from the
 * training window only; validation targets are scored with features frozen at
 * (tipoff - lead). Conditional production (given the player played) and
 * availability (did the player play) are scored separately.
 *
 * A dataset is accepted only if its source license permits model development,
 * so a real provider is usable here exactly when licenses.ts says so.
 */
import { computePregameFeatures, selectPriorGames, type PregameFeatures, type PregameTarget } from "../features";
import { assertUsePermitted } from "../sources/ingest";
import type { DataUse, SourceLicense } from "../sources/types";
import { NBA_COMPETITIVE_SEASON_TYPES } from "../seasonType";
import { roleTier } from "../role";
import type { BaselineParams, BaselinePriors, StatProjection } from "../projection";
import { PROJECTED_STATS, type NbaPlayerGame, type ProjectedStat } from "../types";
import { countHistoryViolations, createDataAccess, type DataAccess } from "./access";
import { computeMinutesV1Features, type MinutesV1Features, type MinutesV1Params } from "./minutesV1Candidate";
import { projectAllMethods, type MethodContext } from "./methods";
import { predictAvailability, trainStatusRates, type AvailabilitySample } from "./availability";
import { assertCutoffPolicy, assertFolds, validateSchedule } from "./clock";
import { CALIBRATION_EDGES, FTA_WEIGHT, SEGMENT_NAMES, USAGE_MIN_RECENT_MINUTES, USAGE_MIN_TRAIN_MINUTES, USAGE_RECENT_GAMES } from "./constants";
import { buildManifest, DEFAULT_ACCEPTANCE, type AcceptanceCriterion, type EvaluationManifest } from "./manifest";
import { calibrationBins, scoreProbabilities, summarizeErrors, terciles, type ErrorSummary } from "./metrics";
import type { AvailabilitySummary, ByMethod, ConditionalSummary, Diagnostics, FoldReport, ReportBody, SegmentSummary } from "./report";
import { AVAILABILITY_MODELS, CONDITIONAL_METHODS, type AvailabilityModelId, type ConditionalMethodId, type CutoffPolicy, type EvaluationDataset, type FoldSpec, type ScheduledGame } from "./types";

/** Evaluating a model on a dataset trains its priors and rates on that dataset. */
export const EVALUATION_USE: DataUse = "model-development";

export interface EvaluationConfig {
  cutoffPolicy: CutoffPolicy;
  folds: readonly FoldSpec[];
  baselineParams: BaselineParams;
  minutesV1Params: MinutesV1Params;
  acceptance?: readonly AcceptanceCriterion[];
}

export interface EvaluationInput {
  dataset: EvaluationDataset;
  license: SourceLicense;
  config: EvaluationConfig;
  /** Also return per-target records (for tests and audits). Never part of the hashed results. */
  trace?: boolean;
}

export interface EvaluationReport extends ReportBody {
  manifest: EvaluationManifest;
  trace?: { conditional: ConditionalRecord[]; availability: AvailabilityRecord[] };
}

export interface ConditionalRecord {
  fold: string;
  gameId: string;
  playerId: number;
  teamId: number;
  predictions: Record<ConditionalMethodId, StatProjection>;
  actual: Record<ProjectedStat, number>;
  segments: Record<string, string>;
}

export interface AvailabilityRecord {
  fold: string;
  gameId: string;
  playerId: number;
  teamId: number;
  status: string | null;
  played: boolean;
  p: Record<AvailabilityModelId, number>;
  conditionalMinutes: number;
  actualMinutes: number;
}

const usageNumerator = (row: NbaPlayerGame) => row.fga + FTA_WEIGHT * row.fta + row.tov;

/** Possessions-used per minute over the most recent games, or null on thin evidence. */
function usageProxy(priorNewestFirst: readonly NbaPlayerGame[]): number | null {
  const recent = priorNewestFirst.slice(0, USAGE_RECENT_GAMES);
  const minutes = recent.reduce((sum, row) => sum + row.minutes, 0);
  return minutes < USAGE_MIN_RECENT_MINUTES ? null : recent.reduce((sum, row) => sum + usageNumerator(row), 0) / minutes;
}

function bucketOf(value: number | null, cuts: readonly [number, number] | null): string {
  if (value === null || cuts === null) return "unknown";
  return value < cuts[0] ? "low" : value < cuts[1] ? "mid" : "high";
}

function leaguePriors(rows: readonly NbaPlayerGame[], window: string): BaselinePriors {
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  if (minutes === 0) throw new Error(`Training window ${window} has no minutes; cannot estimate priors`);
  const rate = (stat: "pts" | "reb" | "ast") => rows.reduce((sum, row) => sum + row[stat], 0) / minutes;
  return { leagueRate: { pts: rate("pts"), reb: rate("reb"), ast: rate("ast") } };
}

/**
 * The source id and provenance are labels the license gate relies on, so they
 * are cross-checked against the data: a real source must list its snapshots,
 * name them under its own id, and every row must cite one of them.
 */
export function assertProvenance(dataset: EvaluationDataset): void {
  const { provenance, sourceId } = dataset;
  if ((sourceId === "synthetic") !== (provenance.kind === "synthetic-generator")) {
    throw new Error(`Dataset provenance (${provenance.kind}) does not match source ${sourceId}`);
  }
  if (provenance.kind !== "source-snapshots") return;
  if (provenance.snapshotIds.length === 0) throw new Error("Real-source provenance must list its snapshot ids");
  const foreign = provenance.snapshotIds.find((id) => !id.startsWith(`${sourceId}/`));
  if (foreign) throw new Error(`Snapshot ${foreign} does not belong to source ${sourceId}`);
  const listed = new Set(provenance.snapshotIds);
  const cited = [...dataset.playerGames, ...dataset.teamGames, ...dataset.availability].find((row) => !listed.has(row.sourceSnapshotId));
  if (cited) throw new Error(`Row cites snapshot ${cited.sourceSnapshotId}, which is not in the declared provenance`);
}

function assertLeakageCriterion(criteria: readonly AcceptanceCriterion[]): void {
  if (!criteria.some((c) => c.kind === "leakage-invariants")) throw new Error("Acceptance criteria must include the leakage-invariants criterion");
}

const inWindow = (date: string, start: string, end: string) => date >= start && date <= end;
const isCompetitive = (game: ScheduledGame) => NBA_COMPETITIVE_SEASON_TYPES.includes(game.seasonType);

const tipoffOrder = (a: ScheduledGame, b: ScheduledGame) => Date.parse(a.tipoffUtc) - Date.parse(b.tipoffUtc) || a.gameId.localeCompare(b.gameId);

function trainingSamples(access: DataAccess, games: readonly ScheduledGame[]): AvailabilitySample[] {
  const samples: AvailabilitySample[] = [];
  for (const game of games) {
    for (const teamId of access.teamsOf(game)) {
      for (const playerId of access.universe(game, teamId)) {
        const outcome = access.outcome(game.gameId, playerId);
        if (outcome) samples.push({ status: access.statusAt(game, playerId), played: outcome.played });
      }
    }
  }
  return samples;
}

function emptyErrors(): ErrorSummary {
  return summarizeErrors([]);
}

function scoreMethods(records: readonly ConditionalRecord[]): ByMethod {
  return Object.fromEntries(
    CONDITIONAL_METHODS.map((method) => [
      method,
      Object.fromEntries(
        PROJECTED_STATS.map((stat) => {
          const pairs: Array<[number, number]> = [];
          for (const record of records) {
            const predicted = record.predictions[method][stat];
            if (predicted !== null) pairs.push([predicted, record.actual[stat]]);
          }
          return [stat, summarizeErrors(pairs)];
        }),
      ),
    ]),
  ) as ByMethod;
}

function groupRecords(records: readonly ConditionalRecord[], segment: string): Map<string, ConditionalRecord[]> {
  const groups = new Map<string, ConditionalRecord[]>();
  for (const record of records) {
    const value = record.segments[segment];
    (groups.get(value) ?? groups.set(value, []).get(value)!).push(record);
  }
  return groups;
}

function summarizeConditional(records: readonly ConditionalRecord[]): ConditionalSummary {
  const defined = (record: ConditionalRecord) => CONDITIONAL_METHODS.every((m) => PROJECTED_STATS.every((s) => record.predictions[m][s] !== null));
  const common = records.filter(defined);
  const segments: ConditionalSummary["segments"] = {};
  for (const name of SEGMENT_NAMES) {
    segments[name] = Object.fromEntries(
      [...groupRecords(common, name)].sort(([a], [b]) => a.localeCompare(b)).map(([value, group]): [string, SegmentSummary] => [value, { n: group.length, byMethod: scoreMethods(group) }]),
    );
  }
  return {
    targets: records.length,
    byMethod: scoreMethods(records),
    missingRate: Object.fromEntries(
      CONDITIONAL_METHODS.map((m) => [m, records.filter((r) => PROJECTED_STATS.some((s) => r.predictions[m][s] === null)).length / Math.max(records.length, 1)]),
    ) as Record<ConditionalMethodId, number>,
    commonSample: { n: common.length, byMethod: scoreMethods(common) },
    segments,
  };
}

function summarizeAvailability(records: readonly AvailabilityRecord[], excluded: AvailabilitySummary["excluded"]): AvailabilitySummary {
  const pairsFor = (model: AvailabilityModelId) => records.map((r): [number, 0 | 1] => [r.p[model], r.played ? 1 : 0]);
  const byStatus: AvailabilitySummary["byStatus"] = {};
  for (const status of [...new Set(records.map((r) => r.status ?? "none"))].sort()) {
    const group = records.filter((r) => (r.status ?? "none") === status);
    byStatus[status] = { n: group.length, observedRate: group.filter((r) => r.played).length / group.length };
  }
  return {
    universe: records.length,
    excluded,
    withoutPregameStatus: records.filter((r) => r.status === null).length,
    byModel: Object.fromEntries(AVAILABILITY_MODELS.map((m) => [m, scoreProbabilities(pairsFor(m))])) as AvailabilitySummary["byModel"],
    calibration: Object.fromEntries(AVAILABILITY_MODELS.map((m) => [m, calibrationBins(pairsFor(m), CALIBRATION_EDGES)])) as AvailabilitySummary["calibration"],
    byStatus,
    unconditionalMinutes: {
      conditionalOnly: records.length === 0 ? emptyErrors() : summarizeErrors(records.map((r) => [r.conditionalMinutes, r.actualMinutes])),
      availabilityWeighted: records.length === 0 ? emptyErrors() : summarizeErrors(records.map((r) => [r.p.status_aware * r.conditionalMinutes, r.actualMinutes])),
    },
  };
}

export function runEvaluation(input: EvaluationInput): EvaluationReport {
  const { dataset, license, config } = input;
  assertUsePermitted(dataset.sourceId, license, EVALUATION_USE);
  assertProvenance(dataset);
  assertCutoffPolicy(config.cutoffPolicy);
  assertFolds(config.folds);
  assertLeakageCriterion(config.acceptance ?? DEFAULT_ACCEPTANCE);
  const schedule = validateSchedule(dataset.schedule);
  const access = createDataAccess(dataset, schedule, config.cutoffPolicy);

  const features = new Map<string, { v0: PregameFeatures; v1: MinutesV1Features; prior: NbaPlayerGame[] }>();
  const featuresFor = (game: ScheduledGame, playerId: number, teamId: number) => {
    const key = `${game.gameId}|${playerId}|${teamId}`;
    const hit = features.get(key);
    if (hit) return hit;
    const cutoff = access.cutoffOf(game);
    const history = access.history(playerId, cutoff);
    leakageViolations += countHistoryViolations(history, game, schedule, config.cutoffPolicy);
    const target: PregameTarget = { gameId: game.gameId, cutoffDate: game.gameDate, season: game.season, teamId };
    const teamDates = new Map([[teamId, access.teamDates(teamId, cutoff)]]);
    const value = {
      v0: computePregameFeatures(history, target, teamDates),
      v1: computeMinutesV1Features(history, target, teamDates),
      prior: selectPriorGames(history, target),
    };
    features.set(key, value);
    return value;
  };

  let leakageViolations = 0;
  const foldReports: FoldReport[] = [];
  const conditionalRecords: ConditionalRecord[] = [];
  const availabilityRecords: AvailabilityRecord[] = [];
  const excluded: AvailabilitySummary["excluded"] = { unestablished: 0, unestablishedByStatus: {}, playedOutsideUniverse: 0 };
  const diagnostics: Diagnostics = { validationGamesScheduled: 0, gamesWithoutResults: 0, neutralSiteGames: 0, unscheduledRows: 0, availabilityIgnoredAsLate: 0, leakageInvariantViolations: 0 };
  let firstCutoff = Number.POSITIVE_INFINITY;
  let lastCutoff = Number.NEGATIVE_INFINITY;

  for (const fold of config.folds) {
    const validationGames = [...schedule.values()].filter((g) => isCompetitive(g) && inWindow(g.gameDate, fold.validationStart, fold.validationEnd)).sort(tipoffOrder);
    // Training uses only results that were available before the fold's first validation cutoff.
    const foldCutoff = validationGames.length > 0 ? access.cutoffOf(validationGames[0]) : Date.parse(`${fold.validationStart}T00:00:00Z`);
    const trainRows = dataset.playerGames
      .filter((row) => inWindow(row.gameDate, fold.trainStart, fold.trainEnd) && NBA_COMPETITIVE_SEASON_TYPES.includes(row.seasonType) && row.minutes > 0 && access.resultUsable(row.gameId, foldCutoff))
      .sort((a, b) => a.gameId.localeCompare(b.gameId) || a.playerId - b.playerId);
    const priors = leaguePriors(trainRows, fold.name);
    const trainGames = [...schedule.values()]
      .filter((g) => isCompetitive(g) && access.hasResults(g.gameId) && inWindow(g.gameDate, fold.trainStart, fold.trainEnd) && access.resultUsable(g.gameId, foldCutoff))
      .sort(tipoffOrder);
    const table = trainStatusRates(trainingSamples(access, trainGames));

    const minutesByPlayer = new Map<number, { minutes: number; usage: number }>();
    for (const row of trainRows) {
      const entry = minutesByPlayer.get(row.playerId) ?? { minutes: 0, usage: 0 };
      minutesByPlayer.set(row.playerId, { minutes: entry.minutes + row.minutes, usage: entry.usage + usageNumerator(row) });
    }
    const usageCuts = terciles([...minutesByPlayer.values()].filter((e) => e.minutes >= USAGE_MIN_TRAIN_MINUTES).map((e) => e.usage / e.minutes));
    const ctx: MethodContext = { priors, baselineParams: config.baselineParams, minutesV1Params: { ...config.minutesV1Params, participationPrior: table.overall } };

    const foldConditional: ConditionalRecord[] = [];
    const foldAvailability: AvailabilityRecord[] = [];
    diagnostics.validationGamesScheduled += validationGames.length;

    for (const game of validationGames) {
      if (!access.hasResults(game.gameId)) {
        diagnostics.gamesWithoutResults += 1;
        continue;
      }
      if (game.neutralSite) diagnostics.neutralSiteGames += 1;
      firstCutoff = Math.min(firstCutoff, access.cutoffOf(game));
      lastCutoff = Math.max(lastCutoff, access.cutoffOf(game));
      const universeByTeam = new Map(access.teamsOf(game).map((teamId) => [teamId, new Set(access.universe(game, teamId))]));

      for (const row of access.rowsOf(game.gameId)) {
        if (row.minutes <= 0) continue;
        const f = featuresFor(game, row.playerId, row.teamId);
        const predictions = projectAllMethods({ priorNewestFirst: f.prior, features: f.v0, v1: f.v1 }, ctx);
        foldConditional.push({
          fold: fold.name,
          gameId: game.gameId,
          playerId: row.playerId,
          teamId: row.teamId,
          predictions,
          actual: { minutes: row.minutes, pts: row.pts, reb: row.reb, ast: row.ast },
          segments: {
            minutesBucket: predictions.jkb_baseline_v0.minutes === null ? "unknown" : roleTier(predictions.jkb_baseline_v0.minutes),
            usageBucket: bucketOf(usageProxy(f.prior), usageCuts),
            teamChange: f.v0.teamChangedRecently ? "recent" : "stable",
            venue: game.neutralSite ? "neutral" : row.teamId === game.homeTeamId ? "home" : "away",
            historyTier: f.v0.historyTier,
          },
        });
        if (!universeByTeam.get(row.teamId)?.has(row.playerId)) excluded.playedOutsideUniverse += 1;
      }

      for (const [teamId, members] of universeByTeam) {
        for (const playerId of members) {
          const outcome = access.outcome(game.gameId, playerId);
          const status = access.statusAt(game, playerId);
          if (!outcome) {
            excluded.unestablished += 1;
            excluded.unestablishedByStatus[status ?? "none"] = (excluded.unestablishedByStatus[status ?? "none"] ?? 0) + 1;
            continue;
          }
          const f = featuresFor(game, playerId, teamId);
          const row = access.rowsOf(game.gameId).find((r) => r.playerId === playerId);
          foldAvailability.push({
            fold: fold.name,
            gameId: game.gameId,
            playerId,
            teamId,
            status,
            played: outcome.played,
            p: predictAvailability(table, { status, v1: f.v1 }, ctx.minutesV1Params),
            conditionalMinutes: projectAllMethods({ priorNewestFirst: f.prior, features: f.v0, v1: f.v1 }, ctx).jkb_minutes_v1.minutes ?? 0,
            actualMinutes: outcome.played ? (row?.minutes ?? 0) : 0,
          });
        }
      }
    }

    conditionalRecords.push(...foldConditional);
    availabilityRecords.push(...foldAvailability);
    foldReports.push({
      spec: fold,
      trainingRows: trainRows.length,
      priors,
      participationPrior: table.overall,
      usageTerciles: usageCuts,
      conditional: { targets: foldConditional.length, byMethod: scoreMethods(foldConditional) },
      availability: { universe: foldAvailability.length, byModel: summarizeAvailability(foldAvailability, { unestablished: 0, unestablishedByStatus: {}, playedOutsideUniverse: 0 }).byModel },
    });
  }

  diagnostics.unscheduledRows = access.counters.unscheduledRows;
  diagnostics.availabilityIgnoredAsLate = access.counters.availabilityIgnoredAsLate;
  diagnostics.leakageInvariantViolations = leakageViolations;
  const body: ReportBody = {
    folds: foldReports,
    pooled: { conditional: summarizeConditional(conditionalRecords), availability: summarizeAvailability(availabilityRecords, excluded) },
    diagnostics,
    cutoffRange: Number.isFinite(firstCutoff) ? { first: new Date(firstCutoff).toISOString(), last: new Date(lastCutoff).toISOString() } : null,
  };
  const manifest = buildManifest(
    {
      dataset,
      use: EVALUATION_USE,
      cutoffPolicy: config.cutoffPolicy,
      folds: config.folds,
      baselineParams: config.baselineParams,
      minutesV1Params: config.minutesV1Params,
      criteria: config.acceptance ?? DEFAULT_ACCEPTANCE,
      license,
    },
    body,
  );
  return input.trace ? { ...body, manifest, trace: { conditional: conditionalRecords, availability: availabilityRecords } } : { ...body, manifest };
}
