/**
 * minutes-v1 (Phase 2A candidate; NOT promoted, baseline v0 remains the benchmark).
 *
 * Two separate components:
 *   1. Conditional minutes: E[minutes | player appears], with an uncertainty band.
 *   2. Participation: P(player appears in the team's game).
 * Unconditional expected minutes = participation x conditional minutes.
 *
 * Conditional minutes:
 *   level  = EWMA of the level pool (short half-life after a detected role shift),
 *            or the pre-absence mean while inside a return ramp.
 *   anchor = the player's own role: same-season current-team mean blended with
 *            previous regular-season mean (weight capped in games); new players
 *            fall back to `newPlayerMinutes`.
 *   minutes = ((n * level + K * anchor) / (n + K)) * ramp[gamesSinceReturn]
 *            K = roleShrinkGames, or roleChangeShrinkGames after a role shift.
 *   sd     = sqrt((v * s^2 + K_sd * sdPrior[tier]^2) / (v + K_sd)) * multipliers
 *            where s is recent minutes volatility over v games.
 *
 * Every magnitude (half-lives, shrinkage, ramp factors, sd priors, multipliers,
 * participation prior) is a parameter. Defaults are neutral design values, not
 * evidence: `calibrateMinutesV1` estimates them on a development period.
 */
import type { MinutesV1Features } from "./minutesFeatures";
import { roleTier, type RoleTier } from "./role";

export const MINUTES_V1_MODEL_VERSION = "nba-minutes-v1-candidate";
const MAX_LEVEL_GAMES = 20;
/** Two-sided 80% normal quantile. */
const Z80 = 1.2815515655446004;

export interface MinutesV1Params {
  halfLifeGames: number;
  roleChangeHalfLifeGames: number;
  roleShrinkGames: number;
  roleChangeShrinkGames: number;
  previousSeasonWeightGames: number;
  newPlayerMinutes: number;
  /** Multiplier by appearances since return (index 0 = first game back); 1 = no adjustment. */
  rampFactors: number[];
  sdPrior: Record<RoleTier, number>;
  sdPriorGames: number;
  sdMultipliers: { base: number; returning: number; roleShift: number; teamChangedRecently: number };
  participationPrior: number;
  participationPriorGames: number;
  maxMinutes: number;
}

export const DEFAULT_MINUTES_V1_PARAMS: MinutesV1Params = {
  halfLifeGames: 5,
  roleChangeHalfLifeGames: 2,
  roleShrinkGames: 3,
  roleChangeShrinkGames: 0,
  previousSeasonWeightGames: 10,
  newPlayerMinutes: 10,
  rampFactors: [1, 1, 1],
  sdPrior: { bench: 6, rotation: 6, core: 6 },
  sdPriorGames: 5,
  sdMultipliers: { base: 1, returning: 1, roleShift: 1, teamChangedRecently: 1 },
  participationPrior: 0.9,
  participationPriorGames: 5,
  maxMinutes: 48,
};

export interface MinutesV1Projection {
  modelVersion: typeof MINUTES_V1_MODEL_VERSION;
  /** E[minutes | appears]. */
  minutes: number;
  sd: number;
  p10: number;
  p90: number;
  participation: number;
  unconditionalMinutes: number;
  components: { level: number | null; anchor: number; shrinkGames: number; ramp: number; inReturnRamp: boolean; roleShift: boolean };
}

export function ewma(valuesNewestFirst: readonly number[], halfLifeGames: number): number | null {
  if (valuesNewestFirst.length === 0) return null;
  let weighted = 0;
  let total = 0;
  valuesNewestFirst.forEach((value, index) => {
    const weight = 0.5 ** (index / halfLifeGames);
    weighted += weight * value;
    total += weight;
  });
  return weighted / total;
}

export function roleAnchor(features: MinutesV1Features, params: MinutesV1Params): number {
  const season = features.seasonTeam;
  const previous = features.previousSeason;
  const prevWeight = previous ? Math.min(previous.games, params.previousSeasonWeightGames) : 0;
  const seasonWeight = season?.games ?? 0;
  if (seasonWeight + prevWeight === 0) return params.newPlayerMinutes;
  return (seasonWeight * (season?.mean ?? 0) + prevWeight * (previous?.mean ?? 0)) / (seasonWeight + prevWeight);
}

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

function conditionalMinutes(features: MinutesV1Features, params: MinutesV1Params) {
  const roleShift = features.roleShift?.flagged ?? false;
  const anchor = roleAnchor(features, params);
  const absence = features.absence;
  const inReturnRamp = absence !== null && absence.preAbsence !== null && absence.gamesSinceReturn < params.rampFactors.length;
  const level = inReturnRamp
    ? absence!.preAbsence!.mean
    : ewma(features.levelPool, roleShift ? params.roleChangeHalfLifeGames : params.halfLifeGames);
  const shrinkGames = roleShift ? params.roleChangeShrinkGames : params.roleShrinkGames;
  const ramp = inReturnRamp ? params.rampFactors[absence!.gamesSinceReturn] : 1;
  const n = Math.min(features.levelPool.length, MAX_LEVEL_GAMES);
  const blended = level === null || n + shrinkGames === 0 ? anchor : (n * level + shrinkGames * anchor) / (n + shrinkGames);
  return { minutes: clamp(blended * ramp, params.maxMinutes), level, anchor, shrinkGames, ramp, inReturnRamp, roleShift };
}

export function minutesSd(features: MinutesV1Features, minutes: number, params: MinutesV1Params, flags: { inReturnRamp: boolean; roleShift: boolean }): number {
  const prior = params.sdPrior[roleTier(minutes)];
  const v = features.volatility?.games ?? 0;
  const s = features.volatility?.sd ?? 0;
  const k = params.sdPriorGames;
  const base = v + k === 0 ? prior : Math.sqrt((v * s * s + k * prior * prior) / (v + k));
  const m = params.sdMultipliers;
  return base * m.base * (flags.inReturnRamp ? m.returning : 1) * (flags.roleShift ? m.roleShift : 1) * (features.teamChangedRecently ? m.teamChangedRecently : 1);
}

export function projectParticipation(features: MinutesV1Features, params: MinutesV1Params): number {
  const window = features.participation;
  const k = params.participationPriorGames;
  if (!window || window.teamGames + k === 0) return params.participationPrior;
  return (window.played + k * params.participationPrior) / (window.teamGames + k);
}

export function projectMinutesV1(features: MinutesV1Features, params: MinutesV1Params): MinutesV1Projection {
  const point = conditionalMinutes(features, params);
  const sd = minutesSd(features, point.minutes, params, point);
  const participation = projectParticipation(features, params);
  return {
    modelVersion: MINUTES_V1_MODEL_VERSION,
    minutes: point.minutes,
    sd,
    p10: clamp(point.minutes - Z80 * sd, params.maxMinutes),
    p90: clamp(point.minutes + Z80 * sd, params.maxMinutes),
    participation,
    unconditionalMinutes: participation * point.minutes,
    components: { level: point.level, anchor: point.anchor, shrinkGames: point.shrinkGames, ramp: point.ramp, inReturnRamp: point.inReturnRamp, roleShift: point.roleShift },
  };
}
