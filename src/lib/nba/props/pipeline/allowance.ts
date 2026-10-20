/**
 * The NBA odds allowance (Phase 5C): the one place its figures come from.
 *
 * NBA gets a fixed slice of the shared 500-credit Odds API month, sized for the case where MLB and NCAAB are
 * paused and every credit that no workflow in this repository explains is still treated as spent. The figure
 * only moves by a reviewed change to this file. Measured data can PROPOSE a larger one (see proposeMonthly),
 * but nothing here ever raises the allowance on its own, and nothing assumes a credit is free without the
 * provider's own counter (maxEvidenceAgeMs, enforced by the planner and the request gate in budget.ts).
 */
import type { NbaAllowance } from "./budget";
import {
  DEFAULT_PEER_MARGIN,
  freeHeadroom,
  peerReserveCredits,
  PEER_COMPONENTS,
  scenarioPeerMonthly,
  SEASON_SCENARIOS,
  summarizeBurn,
  type QuotaObservation,
  type Scenario,
} from "./zeroCostBudget";

/** Free plan: the counter reports used + remaining = 500. */
export const ODDS_PLAN_LIMIT = 500;
/** The NFL daily job refuses to run under this many remaining credits (DEFAULT_QUOTA_REMAINING_FLOOR). */
export const NFL_GUARD_FLOOR = 50;

const planningScenario = (): Scenario => {
  const found = SEASON_SCENARIOS.find((s) => s.id === "mlb-off-planning");
  if (!found) throw new Error("planning scenario missing");
  return found;
};

/** Other sports' spend per day in the planning case: NFL lines, MLB-adjacent, NFL yardage cross-check, unattributed. */
export const PLANNING_PEER_PER_DAY: number = PEER_COMPONENTS.filter((c) => planningScenario().active.includes(c.id)).reduce((sum, c) => sum + c.perDay, 0);

/** Hard monthly cap on NBA credits. Equals freeHeadroom() for the planning case; a test keeps the two in step. */
export const NBA_MONTHLY_CREDITS = 206;
/** A 15-game slate on points only; the monthly cap, not this, bounds the month. */
export const NBA_DAILY_CREDITS = 15;
/** Max age of the provider's counter reading before NBA spends anything. Peers spend about 7.5 a day. */
export const NBA_MAX_EVIDENCE_AGE_MS = 24 * 3_600_000;
/** Highest figure a proposal may reach: only the logged NFL call remains (the "stretch" case). */
export const NBA_PROPOSAL_CEILING = freeHeadroom({ planLimit: ODDS_PLAN_LIMIT, guardFloor: NFL_GUARD_FLOOR, peerMonthly: scenarioPeerMonthly(SEASON_SCENARIOS.find((s) => s.id === "nfl-only") as Scenario) });

/** Whole days left in the provider's month, counting today (the month resets on the 1st, UTC). */
export function daysLeftInMonth(now: Date): number {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((end - now.getTime()) / 86_400_000));
}

/**
 * The allowance to run with at `now`: hard daily and monthly caps, a reserve that keeps the NFL floor and
 * the other sports' projected spend to month end, and the evidence age limit.
 */
export function nbaAllowance(now: Date, overrides: Partial<Pick<NbaAllowance, "perDayCredits" | "perMonthCredits" | "maxEvidenceAgeMs">> = {}): NbaAllowance {
  return {
    perDayCredits: overrides.perDayCredits ?? NBA_DAILY_CREDITS,
    perMonthCredits: overrides.perMonthCredits ?? NBA_MONTHLY_CREDITS,
    peerReserveCredits: peerReserveCredits({ peerPerDay: PLANNING_PEER_PER_DAY, daysLeft: daysLeftInMonth(now), floor: NFL_GUARD_FLOOR }),
    maxEvidenceAgeMs: overrides.maxEvidenceAgeMs ?? NBA_MAX_EVIDENCE_AGE_MS,
  };
}

export interface MonthlyProposal {
  /** "initial" = no usable measurement yet, the planning figure stands. */
  status: "initial" | "proposal";
  monthlyCredits: number;
  /** A proposal is advice. The figure above changes only through a reviewed edit and the owner's approval. */
  requiresApproval: true;
  basis: string;
}

export interface ProposalInput {
  /** Provider counter readings taken AFTER the MLB and NCAAB pause took effect. */
  observations: readonly QuotaObservation[];
  now: Date;
  /** Days of readings required before any figure above the initial one is proposed. */
  minObservedDays?: number;
  /** The newest reading must be this recent. */
  maxReadingAgeDays?: number;
}

/**
 * A figure the measured counter supports, never an automatic change. It stays at the initial 206 until at
 * least `minObservedDays` of provider readings after the pause exist and the newest is recent. A measured
 * figure BELOW the initial one is proposed as-is: bad news is never rounded up.
 */
export function proposeMonthly(input: ProposalInput): MonthlyProposal {
  const minDays = input.minObservedDays ?? 14;
  const maxAgeDays = input.maxReadingAgeDays ?? 3;
  const burn = summarizeBurn(input.observations);
  const newest = [...input.observations].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const initial = (basis: string): MonthlyProposal => ({ status: "initial", monthlyCredits: NBA_MONTHLY_CREDITS, requiresApproval: true, basis });
  if (burn.projectedMonthly === null) return initial("no usable provider readings after the pause");
  if (burn.elapsedDays < minDays) return initial(`${burn.elapsedDays.toFixed(1)} days of readings after the pause; ${minDays} needed`);
  if (!newest || (input.now.getTime() - Date.parse(newest.at)) / 86_400_000 > maxAgeDays) return initial(`the newest provider reading is older than ${maxAgeDays} days`);
  const measured = freeHeadroom({ planLimit: ODDS_PLAN_LIMIT, guardFloor: NFL_GUARD_FLOOR, peerMonthly: burn.projectedMonthly, margin: DEFAULT_PEER_MARGIN });
  return {
    status: "proposal",
    monthlyCredits: Math.min(measured, NBA_PROPOSAL_CEILING),
    requiresApproval: true,
    basis: `${burn.elapsedDays.toFixed(1)} days measured at ${burn.meanPerDay?.toFixed(2)} credits/day = ${Math.round(burn.projectedMonthly)}/month for the other sports`,
  };
}
