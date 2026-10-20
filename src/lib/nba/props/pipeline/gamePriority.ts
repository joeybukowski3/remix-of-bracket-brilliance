/**
 * Which games get the NBA credits, and with which markets (Phase 5C). Pure: no clock, store or network.
 *
 * Rule, in order:
 *   1. Broad coverage first. Every funded game is captured for POINTS ONLY (one credit).
 *   2. Games are ranked by whether we can use the lines: players with usable projections first, then lines
 *      expected to be reliable, then earliest tipoff. Ranking decides who is funded when credits run short;
 *      it never excludes a game (with no projection model yet, every game ties on that tier and the line
 *      archive still grows).
 *   3. Rebounds and assists are added to the top-ranked games only from VERIFIED spare credits: fresh
 *      provider evidence, and after the points-only cost of every remaining game night this month is set
 *      aside. No evidence, no expansion.
 *   4. The market set is decided once, before the first call for a game, and a retry never widens it, so a
 *      game's markets are each captured once and stored immutably.
 */
import { MARKETS, type Market, type NbaPregameSnapshot } from "./contracts";
import type { ProjectionValue } from "./pregameJob";
import { AVERAGE_GAMES_PER_NIGHT } from "./zeroCostBudget";

export const BASELINE_MARKETS: readonly Market[] = Object.freeze(["pts"] as Market[]);
export const EXPANSION_MARKETS: readonly Market[] = Object.freeze(["reb", "ast"] as Market[]);

/** A projection is usable only with a real minutes estimate at or above this, and inputs no later than the capture. */
export const MIN_USABLE_PROJECTION_MINUTES = 12;
/** Players with usable projections for a game to count as well covered. */
export const STRONG_PROJECTION_PLAYERS = 8;
/** Share of recent API lines that were fresh at capture for a line source to count as reliable. */
export const RELIABLE_LINE_SHARE = 0.8;
export const ACCEPTABLE_LINE_SHARE = 0.5;

export function isUsableProjection(projection: ProjectionValue | null, capturedAtUtc: string): boolean {
  if (!projection || !Number.isFinite(projection.value) || projection.value < 0) return false;
  if (projection.minutes === null || !(projection.minutes >= MIN_USABLE_PROJECTION_MINUTES)) return false;
  return Date.parse(projection.inputCutoffUtc) <= Date.parse(capturedAtUtc);
}

export interface PriorityCandidate {
  gameKey: string;
  tipoffUtc: string;
  /** Players on the game with a usable projection (see isUsableProjection). */
  usableProjections: number;
  /** Share of recent lines that were fresh, 0 to 1; null = not enough history, which is never invented. */
  lineReliability: number | null;
  /** True only before the first provider call for this game. A retry is never widened. */
  expandable: boolean;
}

export const projectionTier = (usable: number): 0 | 1 | 2 => (usable >= STRONG_PROJECTION_PLAYERS ? 2 : usable >= 1 ? 1 : 0);
/** Unknown history is neutral: below a known-reliable source, above a known-unreliable one. */
export const reliabilityTier = (share: number | null): 0 | 1 | 2 => (share === null ? 1 : share >= RELIABLE_LINE_SHARE ? 2 : share >= ACCEPTABLE_LINE_SHARE ? 1 : 0);

/** Best first. Total order, so the same inputs always give the same funding. */
export function rankCandidates(candidates: readonly PriorityCandidate[]): PriorityCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      projectionTier(b.usableProjections) - projectionTier(a.usableProjections) ||
      reliabilityTier(b.lineReliability) - reliabilityTier(a.lineReliability) ||
      a.tipoffUtc.localeCompare(b.tipoffUtc) ||
      a.gameKey.localeCompare(b.gameKey),
  );
}

export interface ReliabilityOptions {
  windowDays?: number;
  /** Fewer lines than this is not a history. */
  minSamples?: number;
}

/**
 * Share of a game's teams' recent API lines that were fresh when captured. Manual and synthetic lines do
 * not count: they say nothing about the provider. Null when the history is too thin to say.
 */
export function lineReliabilityFromHistory(snapshots: readonly NbaPregameSnapshot[], teams: ReadonlyArray<string | null>, now: Date, options: ReliabilityOptions = {}): number | null {
  const since = now.getTime() - (options.windowDays ?? 14) * 86_400_000;
  const wanted = new Set(teams.filter((t): t is string => t !== null));
  const recent = snapshots.filter(
    (s) => s.source.method === "api" && Date.parse(s.timing.capturedAtUtc) >= since && Date.parse(s.timing.capturedAtUtc) <= now.getTime() && (wanted.has(s.game.awayTeam ?? "") || wanted.has(s.game.homeTeam ?? "")),
  );
  if (recent.length < (options.minSamples ?? 10)) return null;
  return recent.filter((s) => s.freshness.status === "fresh").length / recent.length;
}

/** Points-only credits the remaining game nights of the month are expected to need. Set aside before any expansion. */
export function expectedBaselineCredits(nightsAfterToday: number, averageGamesPerNight = AVERAGE_GAMES_PER_NIGHT): number {
  return Math.ceil(Math.max(0, nightsAfterToday) * averageGamesPerNight * BASELINE_MARKETS.length);
}

export interface DayBudget {
  /** perDayCredits minus what NBA already spent today. */
  dayCreditsLeft: number;
  /** perMonthCredits minus what NBA already spent this month. The hard cap. */
  monthCreditsLeft: number;
  /** Provider-reported remaining credits minus the reserve kept for other sports; null without fresh provider evidence. */
  providerCreditsAvailable: number | null;
  /** expectedBaselineCredits() for the nights after today. */
  futureBaselineReserve: number;
}

export interface ExpansionPolicy {
  /** Owner approval to buy rebounds and assists at all. Off until the measured allowance supports it. */
  approved: boolean;
  /** Top-ranked games per night that may get the full set. */
  maxGamesPerNight: number;
}

export const NO_EXPANSION: ExpansionPolicy = Object.freeze({ approved: false, maxGamesPerNight: 0 });

export type UnfundedReason = "no_provider_evidence" | "provider_reserve" | "month_budget" | "day_budget";

export interface FundedGame {
  gameKey: string;
  markets: Market[];
  credits: number;
  /** 1 = best. */
  rank: number;
}

export interface DayPlan {
  funded: FundedGame[];
  unfunded: Array<{ gameKey: string; reason: UnfundedReason }>;
  creditsPlanned: number;
  /** Verified spare after the plan; null when it could not be established. */
  spareCredits: number | null;
  expansion: { granted: number; blocked: string | null };
}

export interface DayPlanInput {
  /** The night's games not yet captured, in any order. */
  candidates: readonly PriorityCandidate[];
  budget: DayBudget;
  expansion?: ExpansionPolicy;
}

export function planDay(input: DayPlanInput): DayPlan {
  const { budget } = input;
  const expansion = input.expansion ?? NO_EXPANSION;
  const day = Math.max(0, budget.dayCreditsLeft);
  const month = Math.max(0, budget.monthCreditsLeft);
  const provider = budget.providerCreditsAvailable === null ? null : Math.max(0, budget.providerCreditsAvailable);
  const baseCost = BASELINE_MARKETS.length;
  // Unknown provider credits means nothing is spent: an unused credit is never assumed.
  const ceiling = provider === null ? 0 : Math.min(day, month, provider);
  const binding: UnfundedReason = provider === null ? "no_provider_evidence" : provider <= Math.min(day, month) ? "provider_reserve" : month <= day ? "month_budget" : "day_budget";

  const ranked = rankCandidates(input.candidates);
  const funded: FundedGame[] = [];
  const unfunded: DayPlan["unfunded"] = [];
  let spent = 0;
  for (const [index, candidate] of ranked.entries()) {
    if (spent + baseCost <= ceiling) {
      funded.push({ gameKey: candidate.gameKey, markets: [...BASELINE_MARKETS], credits: baseCost, rank: index + 1 });
      spent += baseCost;
    } else {
      unfunded.push({ gameKey: candidate.gameKey, reason: binding });
    }
  }

  const extra = EXPANSION_MARKETS.length;
  const outcome: DayPlan["expansion"] = { granted: 0, blocked: null };
  let spare: number | null = null;
  if (!expansion.approved) outcome.blocked = "expansion is not approved";
  else if (provider === null) outcome.blocked = "no fresh provider evidence";
  else if (funded.length === 0) outcome.blocked = "no game is funded";
  else {
    // Spare is what is left of EVERY ceiling after today's points-only captures and the points-only cost of the
    // nights still to come, so an expansion can never starve a later night's broad coverage.
    spare = Math.min(day - spent, month - budget.futureBaselineReserve - spent, provider - budget.futureBaselineReserve - spent);
    if (spare < extra) outcome.blocked = `verified spare is ${spare}, below the ${extra} an expansion needs`;
    else {
      const expandable = new Set(ranked.filter((c) => c.expandable).map((c) => c.gameKey));
      for (const game of funded) {
        if (outcome.granted >= expansion.maxGamesPerNight || spare < extra) break;
        if (!expandable.has(game.gameKey)) continue;
        game.markets = [...BASELINE_MARKETS, ...EXPANSION_MARKETS];
        game.credits = baseCost + extra;
        spare -= extra;
        spent += extra;
        outcome.granted += 1;
      }
      if (outcome.granted === 0) outcome.blocked = "no funded game may be widened";
    }
  }
  for (const game of funded) if (!game.markets.every((m) => MARKETS.includes(m))) throw new Error(`invalid market planned for ${game.gameKey}`);
  return { funded, unfunded, creditsPlanned: spent, spareCredits: spare, expansion: outcome };
}
