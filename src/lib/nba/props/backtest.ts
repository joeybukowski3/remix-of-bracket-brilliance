/**
 * Chronological walk-forward evaluation of the baseline.
 *
 * Every target's features use only games dated before that target (enforced in
 * features.ts), so each prediction is what the baseline would have produced
 * the morning of the game. Population priors are estimated once from the
 * training period; hyperparameters are tuned on the validation period only;
 * the holdout period is scored once with frozen parameters.
 *
 * Predictions (`NbaPredictionSnapshot`) never carry results. Outcomes
 * (`NbaOutcomeRecord`) are produced separately and joined only here.
 */
import { buildTeamGameDates, computePregameFeatures, type PregameFeatures } from "./features";
import {
  BASELINE_MODEL_VERSION,
  projectBaseline,
  projectNaive,
  RATE_STATS,
  type BaselineParams,
  type BaselinePriors,
  type RateStat,
} from "./projection";
import { roleTier } from "./role";
import { NBA_COMPETITIVE_SEASON_TYPES, type NbaSeasonType } from "./seasonType";
import {
  PROJECTED_STATS,
  type NbaOutcomeRecord,
  type NbaPlayerGame,
  type NbaPredictionSnapshot,
  type NbaTeamGame,
  type ProjectedStat,
} from "./types";

export const MODEL_METHOD = "model";

export interface BacktestPeriod {
  name: string;
  seasons: string[];
  seasonTypes: NbaSeasonType[];
}

export interface BacktestTarget {
  row: NbaPlayerGame;
  features: PregameFeatures;
}

export interface ErrorStats {
  n: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
}

const targetKey = (gameId: string, playerId: number) => `${gameId}|${playerId}`;

/** Group without copying per insert; the map is local, the inputs are untouched. */
function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function inPeriod(row: Pick<NbaPlayerGame, "season" | "seasonType">, period: BacktestPeriod): boolean {
  return period.seasons.includes(row.season) && period.seasonTypes.includes(row.seasonType);
}

/** Features for every player-game in the period, each using only earlier games. */
export function buildTargets(
  playerGames: readonly NbaPlayerGame[],
  teamGames: readonly NbaTeamGame[],
  period: BacktestPeriod,
): BacktestTarget[] {
  const byPlayer = groupBy(playerGames, (row) => row.playerId);
  const teamGameDates = buildTeamGameDates(teamGames);
  return playerGames
    .filter((row) => inPeriod(row, period))
    .map((row) => ({
      row,
      features: computePregameFeatures(
        byPlayer.get(row.playerId) ?? [],
        { gameId: row.gameId, cutoffDate: row.gameDate, season: row.season, teamId: row.teamId },
        teamGameDates,
      ),
    }));
}

/** League per-minute rates from competitive training-period rows. */
export function estimatePriors(playerGames: readonly NbaPlayerGame[], period: BacktestPeriod): BaselinePriors {
  const rows = playerGames.filter((row) => inPeriod(row, period) && NBA_COMPETITIVE_SEASON_TYPES.includes(row.seasonType));
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  if (minutes === 0) throw new Error(`Training period "${period.name}" has no minutes; cannot estimate priors`);
  const rate = (stat: RateStat) => rows.reduce((sum, row) => sum + row[stat], 0) / minutes;
  return { leagueRate: { pts: rate("pts"), reb: rate("reb"), ast: rate("ast") } };
}

export function toPredictionSnapshot(
  target: BacktestTarget,
  priors: BaselinePriors,
  params: BaselineParams,
): NbaPredictionSnapshot {
  const { row, features } = target;
  return {
    schemaVersion: "nba-prediction-snapshot-v1",
    modelVersion: BASELINE_MODEL_VERSION,
    cutoffDate: row.gameDate,
    gameId: row.gameId,
    playerId: row.playerId,
    teamId: row.teamId,
    season: row.season,
    seasonType: row.seasonType,
    flags: {
      historyTier: features.historyTier,
      teamChanged: features.teamChanged,
      teamChangedRecently: features.teamChangedRecently,
      returningFromAbsence: features.returningFromAbsence,
      roleChange: features.roleChange,
    },
    priorGames: features.priorGames,
    projections: { [MODEL_METHOD]: projectBaseline(features, priors, params), ...projectNaive(features) },
  };
}

export function toOutcome(row: NbaPlayerGame): NbaOutcomeRecord {
  return { schemaVersion: "nba-outcome-v1", gameId: row.gameId, playerId: row.playerId, minutes: row.minutes, pts: row.pts, reb: row.reb, ast: row.ast };
}

export function errorStats(pairs: ReadonlyArray<[number, number]>): ErrorStats {
  if (pairs.length === 0) return { n: 0, mae: null, rmse: null, bias: null };
  let abs = 0;
  let sq = 0;
  let signed = 0;
  for (const [predicted, actual] of pairs) {
    const error = predicted - actual;
    abs += Math.abs(error);
    sq += error * error;
    signed += error;
  }
  return { n: pairs.length, mae: abs / pairs.length, rmse: Math.sqrt(sq / pairs.length), bias: signed / pairs.length };
}

export { roleTier, type RoleTier } from "./role";

type Segmenter = (snapshot: NbaPredictionSnapshot) => string;

export const SEGMENTERS: Record<string, Segmenter> = {
  role: (s) => roleTier(s.projections[MODEL_METHOD].minutes ?? 0),
  historyTier: (s) => s.flags.historyTier,
  teamChangedRecently: (s) => String(s.flags.teamChangedRecently),
  returningFromAbsence: (s) => String(s.flags.returningFromAbsence),
  roleChange: (s) => String(s.flags.roleChange),
};

export interface PeriodEvaluation {
  targets: number;
  methods: string[];
  /** Each method scored on every target where it is defined. */
  byMethod: Record<string, Record<ProjectedStat, ErrorStats>>;
  /** Share of targets where a method is undefined (no qualifying history). */
  missingRate: Record<string, number>;
  /** All methods scored on the identical subset where every method is defined. */
  commonSample: { n: number; byMethod: Record<string, Record<ProjectedStat, ErrorStats>> };
  /** Model and comparison methods by segment, on the common sample. */
  segments: Record<string, Record<string, Record<string, Record<ProjectedStat, ErrorStats>>>>;
}

function scoreMethods(
  snapshots: readonly NbaPredictionSnapshot[],
  outcomes: ReadonlyMap<string, NbaOutcomeRecord>,
  methods: readonly string[],
): Record<string, Record<ProjectedStat, ErrorStats>> {
  return Object.fromEntries(
    methods.map((method) => [
      method,
      Object.fromEntries(
        PROJECTED_STATS.map((stat) => {
          const pairs: Array<[number, number]> = [];
          for (const snapshot of snapshots) {
            const predicted = snapshot.projections[method]?.[stat];
            const outcome = outcomes.get(targetKey(snapshot.gameId, snapshot.playerId));
            if (predicted !== null && predicted !== undefined && outcome) pairs.push([predicted, outcome[stat]]);
          }
          return [stat, errorStats(pairs)];
        }),
      ),
    ]),
  ) as Record<string, Record<ProjectedStat, ErrorStats>>;
}

export function evaluate(
  snapshots: readonly NbaPredictionSnapshot[],
  outcomeRecords: readonly NbaOutcomeRecord[],
  segmentMethods: readonly string[],
): PeriodEvaluation {
  const outcomes = new Map(outcomeRecords.map((o) => [targetKey(o.gameId, o.playerId), o]));
  const missingOutcome = snapshots.filter((s) => !outcomes.has(targetKey(s.gameId, s.playerId))).length;
  if (missingOutcome > 0) throw new Error(`${missingOutcome} prediction snapshot(s) have no outcome record`);
  const methods = [...new Set(snapshots.flatMap((s) => Object.keys(s.projections)))].sort();
  const isDefined = (s: NbaPredictionSnapshot, method: string) => s.projections[method]?.minutes != null;
  const common = snapshots.filter((s) => methods.every((method) => isDefined(s, method)));
  const segments: PeriodEvaluation["segments"] = {};
  for (const [name, segmenter] of Object.entries(SEGMENTERS)) {
    const groups = groupBy(common, segmenter);
    segments[name] = Object.fromEntries(
      [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([value, group]) => [value, scoreMethods(group, outcomes, segmentMethods)]),
    );
  }
  return {
    targets: snapshots.length,
    methods,
    byMethod: scoreMethods(snapshots, outcomes, methods),
    missingRate: Object.fromEntries(
      methods.map((method) => [method, snapshots.filter((s) => !isDefined(s, method)).length / Math.max(snapshots.length, 1)]),
    ),
    commonSample: { n: common.length, byMethod: scoreMethods(common, outcomes, methods) },
    segments,
  };
}

export interface TuningGrid {
  minutesShrinkGames: number[];
  newPlayerMinutes: number[];
  rateShrinkMinutes: number[];
}

export const DEFAULT_TUNING_GRID: TuningGrid = {
  minutesShrinkGames: [0, 1, 2, 4, 8],
  newPlayerMinutes: [8, 12, 16, 20],
  rateShrinkMinutes: [0, 25, 50, 100, 200, 400],
};

export interface TuningTrial {
  stage: "minutes" | RateStat;
  params: Record<string, number>;
  mae: number;
}

function meanAbsoluteError(targets: readonly BacktestTarget[], predict: (t: BacktestTarget) => number, actual: (t: BacktestTarget) => number): number {
  return targets.reduce((sum, t) => sum + Math.abs(predict(t) - actual(t)), 0) / Math.max(targets.length, 1);
}

/**
 * Coordinate search on validation-period MAE: minutes parameters first, then
 * each stat's rate shrinkage with the chosen minutes parameters fixed.
 */
export function tuneParams(
  validationTargets: readonly BacktestTarget[],
  priors: BaselinePriors,
  base: BaselineParams,
  grid: TuningGrid = DEFAULT_TUNING_GRID,
): { params: BaselineParams; trials: TuningTrial[] } {
  if (validationTargets.length === 0) throw new Error("Cannot tune on an empty validation period");
  const trials: TuningTrial[] = [];
  let best = { mae: Infinity, params: base };
  for (const minutesShrinkGames of grid.minutesShrinkGames) {
    for (const newPlayerMinutes of grid.newPlayerMinutes) {
      const params = { ...base, minutesShrinkGames, newPlayerMinutes };
      const mae = meanAbsoluteError(validationTargets, (t) => projectBaseline(t.features, priors, params).minutes!, (t) => t.row.minutes);
      trials.push({ stage: "minutes", params: { minutesShrinkGames, newPlayerMinutes }, mae });
      if (mae < best.mae) best = { mae, params };
    }
  }
  let tuned = best.params;
  for (const stat of RATE_STATS) {
    let bestStat = { mae: Infinity, k: tuned.rateShrinkMinutes[stat] };
    for (const k of grid.rateShrinkMinutes) {
      const params = { ...tuned, rateShrinkMinutes: { ...tuned.rateShrinkMinutes, [stat]: k } };
      const mae = meanAbsoluteError(validationTargets, (t) => projectBaseline(t.features, priors, params)[stat]!, (t) => t.row[stat]);
      trials.push({ stage: stat, params: { rateShrinkMinutes: k }, mae });
      if (mae < bestStat.mae) bestStat = { mae, k };
    }
    tuned = { ...tuned, rateShrinkMinutes: { ...tuned.rateShrinkMinutes, [stat]: bestStat.k } };
  }
  return { params: tuned, trials };
}
