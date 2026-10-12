/**
 * Calibration and evaluation of minutes-v1 against the frozen baseline v0.
 *
 * Protocol:
 *   - `calibrateMinutesV1` runs on a development period only and refuses any
 *     target from a declared holdout season.
 *   - `evaluateMinutesV1` scores v1 and v0 on the same validation targets.
 *   - v1 PTS/REB/AST = v1 minutes x v0's per-minute rates, so stat changes come
 *     from minutes alone.
 *   - Participation (does the player appear?) is evaluated separately on team
 *     games, including the ones the player missed.
 */
import { computePregameFeatures, buildTeamGameDates, type PregameFeatures, type PregameTarget } from "./features";
import { computeMinutesV1Features, type MinutesV1Features } from "./minutesFeatures";
import { projectMinutesV1, projectParticipation, type MinutesV1Params } from "./minutesV1";
import { projectBaseline, projectRate, RATE_STATS, type BaselineParams, type BaselinePriors } from "./projection";
import { roleTier, type RoleTier } from "./role";
import type { NbaSeasonType } from "./seasonType";
import { pairedDifference, timeBlock, type PairedDifference } from "./stats";
import type { NbaPlayerGame, NbaTeamGame, ProjectedStat } from "./types";
import { PROJECTED_STATS } from "./types";

export interface EvaluationPeriod {
  name: string;
  seasons: string[];
  seasonTypes: NbaSeasonType[];
}

export interface MinutesTarget {
  row: NbaPlayerGame;
  v0: PregameFeatures;
  v1: MinutesV1Features;
}

const TIME_BLOCK_DAYS = 14;

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

const inPeriod = (row: { season: string; seasonType: NbaSeasonType }, period: EvaluationPeriod) =>
  period.seasons.includes(row.season) && period.seasonTypes.includes(row.seasonType);

const toTarget = (row: { gameId: string; gameDate: string; season: string; teamId: number }): PregameTarget => ({
  gameId: row.gameId,
  cutoffDate: row.gameDate,
  season: row.season,
  teamId: row.teamId,
});

export function buildMinutesTargets(playerGames: readonly NbaPlayerGame[], teamGames: readonly NbaTeamGame[], period: EvaluationPeriod): MinutesTarget[] {
  const byPlayer = groupBy(playerGames, (row) => row.playerId);
  const teamDates = buildTeamGameDates(teamGames);
  return playerGames.filter((row) => inPeriod(row, period)).map((row) => {
    const history = byPlayer.get(row.playerId) ?? [];
    return { row, v0: computePregameFeatures(history, toTarget(row), teamDates), v1: computeMinutesV1Features(history, toTarget(row), teamDates) };
  });
}

export function assertNoHoldout(targets: ReadonlyArray<{ row: { season: string } }>, holdoutSeasons: readonly string[]): void {
  const leaked = targets.find((target) => holdoutSeasons.includes(target.row.season));
  if (leaked) throw new Error(`Holdout season ${leaked.row.season} must not be used for calibration`);
}

export interface MinutesV1Grid {
  halfLifeGames: number[];
  roleChangeHalfLifeGames: number[];
  roleShrinkGames: number[];
  roleChangeShrinkGames: number[];
  newPlayerMinutes: number[];
}

export const DEFAULT_MINUTES_V1_GRID: MinutesV1Grid = {
  halfLifeGames: [3, 5, 8],
  roleChangeHalfLifeGames: [1.5, 3],
  roleShrinkGames: [0, 3, 8],
  roleChangeShrinkGames: [0, 3],
  newPlayerMinutes: [6, 10, 14],
};

/** Ramp factors are shrunk toward 1 by this many games' worth of prediction. */
const RAMP_PRIOR_GAMES = 10;
const MULTIPLIER_MIN_SAMPLE = 30;
const MULTIPLIER_BOUNDS: [number, number] = [0.5, 3];

const mae = (targets: readonly MinutesTarget[], params: MinutesV1Params) =>
  targets.reduce((sum, t) => sum + Math.abs(projectMinutesV1(t.v1, params).minutes - t.row.minutes), 0) / targets.length;

function tunePointParams(targets: readonly MinutesTarget[], base: MinutesV1Params, grid: MinutesV1Grid): MinutesV1Params {
  let best = { mae: Infinity, params: base };
  for (const halfLifeGames of grid.halfLifeGames)
    for (const roleChangeHalfLifeGames of grid.roleChangeHalfLifeGames)
      for (const roleShrinkGames of grid.roleShrinkGames)
        for (const roleChangeShrinkGames of grid.roleChangeShrinkGames)
          for (const newPlayerMinutes of grid.newPlayerMinutes) {
            const params = { ...base, halfLifeGames, roleChangeHalfLifeGames, roleShrinkGames, roleChangeShrinkGames, newPlayerMinutes };
            const score = mae(targets, params);
            if (score < best.mae) best = { mae: score, params };
          }
  return best.params;
}

/** ramp[g] = (sum actual + P * mean pred) / (sum pred + P * mean pred), with predictions made at ramp = 1. */
function estimateRampFactors(targets: readonly MinutesTarget[], params: MinutesV1Params): number[] {
  const neutral = { ...params, rampFactors: params.rampFactors.map(() => 1) };
  return params.rampFactors.map((_, g) => {
    const group = targets.filter((t) => t.v1.absence?.preAbsence && t.v1.absence.gamesSinceReturn === g);
    if (group.length === 0) return 1;
    const predicted = group.map((t) => projectMinutesV1(t.v1, neutral).minutes);
    const sumPred = predicted.reduce((a, b) => a + b, 0);
    const sumActual = group.reduce((sum, t) => sum + t.row.minutes, 0);
    const prior = RAMP_PRIOR_GAMES * (sumPred / group.length);
    return (sumActual + prior) / (sumPred + prior);
  });
}

const rms = (values: readonly number[]) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
const bound = (value: number) => Math.min(Math.max(value, MULTIPLIER_BOUNDS[0]), MULTIPLIER_BOUNDS[1]);

function estimateSdParams(targets: readonly MinutesTarget[], params: MinutesV1Params): Pick<MinutesV1Params, "sdPrior" | "sdMultipliers"> {
  const residuals = targets.map((t) => ({ t, p: projectMinutesV1(t.v1, params) }));
  const tiers: RoleTier[] = ["bench", "rotation", "core"];
  const sdPrior = Object.fromEntries(tiers.map((tier) => {
    const group = residuals.filter(({ p }) => roleTier(p.minutes) === tier);
    return [tier, group.length >= MULTIPLIER_MIN_SAMPLE ? rms(group.map(({ t, p }) => t.row.minutes - p.minutes)) : params.sdPrior[tier]];
  })) as Record<RoleTier, number>;
  const neutral = { ...params, sdPrior, sdMultipliers: { base: 1, returning: 1, roleShift: 1, teamChangedRecently: 1 } };
  const z = targets.map((t) => {
    const p = projectMinutesV1(t.v1, neutral);
    return { t, p, z: (t.row.minutes - p.minutes) / p.sd };
  });
  const scale = (filter: (item: (typeof z)[number]) => boolean) => {
    const group = z.filter(filter);
    return group.length >= MULTIPLIER_MIN_SAMPLE ? bound(rms(group.map((item) => item.z))) : 1;
  };
  return {
    sdPrior,
    sdMultipliers: {
      base: scale((item) => !item.p.components.inReturnRamp && !item.p.components.roleShift && !item.t.v1.teamChangedRecently),
      returning: scale((item) => item.p.components.inReturnRamp),
      roleShift: scale((item) => item.p.components.roleShift),
      teamChangedRecently: scale((item) => item.t.v1.teamChangedRecently),
    },
  };
}

export function calibrateMinutesV1(
  devTargets: readonly MinutesTarget[],
  base: MinutesV1Params,
  options: { holdoutSeasons: readonly string[]; grid?: MinutesV1Grid; participationRate?: number },
): MinutesV1Params {
  if (devTargets.length === 0) throw new Error("Cannot calibrate minutes-v1 on an empty development period");
  assertNoHoldout(devTargets, options.holdoutSeasons);
  const point = tunePointParams(devTargets, base, options.grid ?? DEFAULT_MINUTES_V1_GRID);
  const ramped = { ...point, rampFactors: estimateRampFactors(devTargets, point) };
  const withSd = { ...ramped, ...estimateSdParams(devTargets, ramped) };
  return options.participationRate === undefined ? withSd : { ...withSd, participationPrior: options.participationRate };
}

export interface ParticipationTarget {
  playerId: number;
  season: string;
  gameDate: string;
  played: boolean;
  features: MinutesV1Features;
}

/**
 * One target per team game inside each same-season player-team stint (first to
 * last appearance), excluding the stint's first game. Games after the final
 * appearance are not observable as absences and are excluded (a known bias:
 * season-ending absences are undercounted).
 */
export function buildParticipationTargets(playerGames: readonly NbaPlayerGame[], teamGames: readonly NbaTeamGame[], period: EvaluationPeriod): ParticipationTarget[] {
  const teamDates = buildTeamGameDates(teamGames);
  const targets: ParticipationTarget[] = [];
  for (const [, history] of groupBy(playerGames, (row) => row.playerId)) {
    const stints = groupBy(history.filter((row) => inPeriod(row, period)), (row) => `${row.season}|${row.teamId}`);
    for (const rows of stints.values()) {
      const dates = rows.map((row) => row.gameDate).sort();
      const played = new Set(dates);
      const { season, teamId, playerId } = rows[0];
      for (const date of (teamDates.get(teamId) ?? []).filter((d) => d > dates[0] && d <= dates[dates.length - 1])) {
        const target = { gameId: `participation|${teamId}|${date}`, cutoffDate: date, season, teamId };
        targets.push({ playerId, season, gameDate: date, played: played.has(date), features: computeMinutesV1Features(history, target, teamDates) });
      }
    }
  }
  return targets;
}

export interface ParticipationEvaluation {
  n: number;
  observedRate: number;
  brier: { v1: number; constant: number };
}

export function evaluateParticipation(targets: readonly ParticipationTarget[], params: MinutesV1Params): ParticipationEvaluation {
  if (targets.length === 0) return { n: 0, observedRate: 0, brier: { v1: 0, constant: 0 } };
  const brier = (p: (t: ParticipationTarget) => number) =>
    targets.reduce((sum, t) => sum + (p(t) - (t.played ? 1 : 0)) ** 2, 0) / targets.length;
  return {
    n: targets.length,
    observedRate: targets.filter((t) => t.played).length / targets.length,
    brier: { v1: brier((t) => projectParticipation(t.features, params)), constant: brier(() => params.participationPrior) },
  };
}

export interface ScoredTarget {
  playerId: number;
  gameDate: string;
  actual: Record<ProjectedStat, number>;
  v0: Record<ProjectedStat, number>;
  v1: Record<ProjectedStat, number>;
  interval: { p10: number; p90: number };
  segments: { returning: boolean; roleShift: boolean; teamChangedRecently: boolean; v0RoleChange: boolean; v0Returning: boolean };
}

export function scoreTargets(targets: readonly MinutesTarget[], v0Params: BaselineParams, v0Priors: BaselinePriors, v1Params: MinutesV1Params): ScoredTarget[] {
  return targets.map(({ row, v0, v1 }) => {
    const base = projectBaseline(v0, v0Priors, v0Params);
    const candidate = projectMinutesV1(v1, v1Params);
    const rate = (stat: (typeof RATE_STATS)[number]) => candidate.minutes * projectRate(v0, stat, v0Priors, v0Params);
    return {
      playerId: row.playerId,
      gameDate: row.gameDate,
      actual: { minutes: row.minutes, pts: row.pts, reb: row.reb, ast: row.ast },
      v0: { minutes: base.minutes!, pts: base.pts!, reb: base.reb!, ast: base.ast! },
      v1: { minutes: candidate.minutes, pts: rate("pts"), reb: rate("reb"), ast: rate("ast") },
      interval: { p10: candidate.p10, p90: candidate.p90 },
      segments: {
        returning: candidate.components.inReturnRamp,
        roleShift: candidate.components.roleShift,
        teamChangedRecently: v1.teamChangedRecently,
        v0RoleChange: v0.roleChange,
        v0Returning: v0.returningFromAbsence,
      },
    };
  });
}

export interface StatComparison {
  n: number;
  maeV0: number;
  maeV1: number;
  byPlayer: PairedDifference;
  byTimeBlock: PairedDifference;
}

export function compareStat(scored: readonly ScoredTarget[], stat: ProjectedStat): StatComparison {
  const loss = (s: ScoredTarget) => ({ candidate: Math.abs(s.v1[stat] - s.actual[stat]), benchmark: Math.abs(s.v0[stat] - s.actual[stat]) });
  const n = scored.length;
  return {
    n,
    maeV0: scored.reduce((sum, s) => sum + loss(s).benchmark, 0) / Math.max(n, 1),
    maeV1: scored.reduce((sum, s) => sum + loss(s).candidate, 0) / Math.max(n, 1),
    byPlayer: pairedDifference(scored.map((s) => ({ ...loss(s), cluster: s.playerId }))),
    byTimeBlock: pairedDifference(scored.map((s) => ({ ...loss(s), cluster: timeBlock(s.gameDate, TIME_BLOCK_DAYS) }))),
  };
}

export interface MinutesV1Evaluation {
  overall: Record<ProjectedStat, StatComparison>;
  segments: Record<string, { n: number; minutes: StatComparison }>;
  interval: { nominal: 0.8; coverage: number; meanWidth: number; bySegment: Record<string, { n: number; coverage: number }> };
}

export function evaluateMinutesV1(scored: readonly ScoredTarget[]): MinutesV1Evaluation {
  const segmentNames = ["returning", "roleShift", "teamChangedRecently", "v0RoleChange", "v0Returning"] as const;
  const covered = (s: ScoredTarget) => s.actual.minutes >= s.interval.p10 && s.actual.minutes <= s.interval.p90;
  const coverage = (group: readonly ScoredTarget[]) => group.filter(covered).length / Math.max(group.length, 1);
  return {
    overall: Object.fromEntries(PROJECTED_STATS.map((stat) => [stat, compareStat(scored, stat)])) as Record<ProjectedStat, StatComparison>,
    segments: Object.fromEntries(segmentNames.map((name) => {
      const group = scored.filter((s) => s.segments[name]);
      return [name, { n: group.length, minutes: compareStat(group, "minutes") }];
    })),
    interval: {
      nominal: 0.8,
      coverage: coverage(scored),
      meanWidth: scored.reduce((sum, s) => sum + s.interval.p90 - s.interval.p10, 0) / Math.max(scored.length, 1),
      bySegment: Object.fromEntries(segmentNames.map((name) => {
        const group = scored.filter((s) => s.segments[name]);
        return [name, { n: group.length, coverage: coverage(group) }];
      })),
    },
  };
}
