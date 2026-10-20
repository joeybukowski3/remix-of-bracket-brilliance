/**
 * Conditional-on-playing projection methods under comparison.
 *
 * Every method answers "if this player appears, how many minutes / PTS / REB /
 * AST?". Whether the player appears is a separate question (availability.ts).
 * Callers must pass history without zero-minute rows, so a DNP row is never a
 * production observation.
 */
import type { PregameFeatures } from "../features";
import { projectMinutesV1, type MinutesV1Features, type MinutesV1Params } from "./minutesV1Candidate";
import { projectBaseline, projectNaive, projectRate, RATE_STATS, type BaselineParams, type BaselinePriors, type StatProjection } from "../projection";
import type { NbaPlayerGame } from "../types";
import type { ConditionalMethodId } from "./types";

export interface MethodContext {
  priors: BaselinePriors;
  baselineParams: BaselineParams;
  minutesV1Params: MinutesV1Params;
}

export interface MethodInput {
  /** Usable prior competitive games with minutes > 0, newest first. */
  priorNewestFirst: readonly NbaPlayerGame[];
  features: PregameFeatures;
  v1: MinutesV1Features;
}

const EMPTY: StatProjection = { minutes: null, pts: null, reb: null, ast: null };

function previousGame(prior: readonly NbaPlayerGame[]): StatProjection {
  const last = prior[0];
  return last ? { minutes: last.minutes, pts: last.pts, reb: last.reb, ast: last.ast } : EMPTY;
}

/** v1 minutes x the baseline's per-minute rates, so stat differences come from minutes alone. */
function minutesV1Projection(input: MethodInput, ctx: MethodContext): StatProjection {
  const minutes = projectMinutesV1(input.v1, ctx.minutesV1Params).minutes;
  const stats = Object.fromEntries(RATE_STATS.map((stat) => [stat, minutes * projectRate(input.features, stat, ctx.priors, ctx.baselineParams)]));
  return { minutes, ...stats } as StatProjection;
}

export function projectAllMethods(input: MethodInput, ctx: MethodContext): Record<ConditionalMethodId, StatProjection> {
  const naive = projectNaive(input.features);
  return {
    previous_game: previousGame(input.priorNewestFirst),
    last_5: naive.naive_l5,
    last_10: naive.naive_l10,
    season_to_date: naive.naive_season_to_date,
    jkb_baseline_v0: projectBaseline(input.features, ctx.priors, ctx.baselineParams),
    jkb_minutes_v1: minutesV1Projection(input, ctx),
  };
}
