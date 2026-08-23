import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { deriveImpliedTeamTotals } from "@/lib/fantasy/weekly/impliedTeamTotals";
import { fpaForOpponent } from "../build";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";

/**
 * PRODUCTION matchup-context policy layer, applied ON TOP OF the frozen V1
 * model (`frozenSpec.ts`, never modified here) and its validated
 * usage/team-context residual (`shadow/inference.ts`, also never modified
 * here). This module adds two independently-versioned, deliberately small,
 * bounded, DETERMINISTIC product-policy adjustments:
 *
 *   1. `scoringEnvironmentAdjustment` -- from the player's team's market
 *      implied team total, relative to the league-average implied team total
 *      for the week.
 *   2. `opponentFpaAdjustment` -- from the opponent's fantasy points allowed
 *      to the player's position, blended between the prior season (full
 *      authority early in a new season) and the current season (rising
 *      weight as games accumulate), relative to the league average.
 *
 * Every coefficient/cap below is a TRACKED PRODUCT POLICY WEIGHT, not a
 * learned/validated model coefficient -- they are intentionally conservative
 * and are never fit from data. This module never imports
 * `projections-v2/*` (the rejected V2 research: learned implied-total
 * coefficients, learned opponent-defense adjustment, QB calibration) --
 * only the pure market-math helper (`deriveImpliedTeamTotals`) and the
 * existing leakage-safe FPA helper (`fpaForOpponent`, from `../build`) are
 * reused.
 */
export const WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION =
  "weekly-fantasy-production-context-v1" as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// 1. Team scoring environment (implied team total)
// ---------------------------------------------------------------------------

/**
 * Product-policy coefficients/caps for `scoringEnvironmentAdjustment`.
 * `impliedTotalDelta` (a team's implied total minus the league-average
 * implied team total for the week) typically ranges roughly +/-7 points at
 * the extremes of an NFL week; these coefficients keep the resulting
 * adjustment in the tenths-to-low-single-digits range the product spec
 * requires, never anywhere close to overwhelming baseline/usage authority.
 * Chosen intentionally conservative; not fit from data.
 */
export const SCORING_ENVIRONMENT_POLICY: Readonly<Record<FantasyPosition, { coefficient: number; capPoints: number }>> = {
  QB: { coefficient: 0.30, capPoints: 2.0 },
  RB: { coefficient: 0.22, capPoints: 1.5 },
  WR: { coefficient: 0.26, capPoints: 1.75 },
  TE: { coefficient: 0.18, capPoints: 1.0 },
};

export type ScoringEnvironmentContext = {
  marketContextAvailable: boolean;
  teamImpliedTotal: number | null;
  leagueAverageImpliedTeamTotal: number | null;
  impliedTotalDelta: number | null;
  scoringEnvironmentAdjustment: number;
};

const NEUTRAL_PROVENANCE = { source: "matchup-market", generatedAt: "", perRowTimestampAvailable: false };

/** League-average implied team total across every priced REG game for `season`/`week`. */
export function leagueAverageImpliedTeamTotal(
  currentMarket: Readonly<Record<string, MarketCurrentGame>>,
  season: number,
  week: number,
): number | null {
  const totals: number[] = [];
  for (const game of Object.values(currentMarket)) {
    if (game.season !== season || game.week !== week || game.seasonType !== "REG") continue;
    const implied = deriveImpliedTeamTotals(game, NEUTRAL_PROVENANCE);
    if (!implied) continue;
    totals.push(implied.home, implied.away);
  }
  return totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null;
}

/** One team's implied total for its `season`/`week` game, or null if unpriced/not found. */
export function resolveTeamImpliedTotal(
  currentMarket: Readonly<Record<string, MarketCurrentGame>>,
  season: number,
  week: number,
  team: string,
): number | null {
  const game = Object.values(currentMarket).find(
    (candidate) =>
      candidate.season === season &&
      candidate.week === week &&
      candidate.seasonType === "REG" &&
      (candidate.homeAbbr === team || candidate.awayAbbr === team),
  );
  if (!game) return null;
  const implied = deriveImpliedTeamTotals(game, NEUTRAL_PROVENANCE);
  if (!implied) return null;
  return game.homeAbbr === team ? implied.home : implied.away;
}

/**
 * Never fabricates a market signal: with no current market data (or no
 * priced game for this team), returns a fully neutral, zero-adjustment
 * context with `marketContextAvailable: false`.
 */
export function computeScoringEnvironmentContext(
  position: FantasyPosition,
  currentMarket: Readonly<Record<string, MarketCurrentGame>> | null,
  season: number,
  week: number,
  team: string,
): ScoringEnvironmentContext {
  const leagueAverage = currentMarket ? leagueAverageImpliedTeamTotal(currentMarket, season, week) : null;
  const teamTotal = currentMarket ? resolveTeamImpliedTotal(currentMarket, season, week, team) : null;

  if (teamTotal == null || leagueAverage == null) {
    return {
      marketContextAvailable: false,
      teamImpliedTotal: teamTotal,
      leagueAverageImpliedTeamTotal: leagueAverage,
      impliedTotalDelta: null,
      scoringEnvironmentAdjustment: 0,
    };
  }

  const impliedTotalDelta = teamTotal - leagueAverage;
  const policy = SCORING_ENVIRONMENT_POLICY[position];
  const scoringEnvironmentAdjustment = clamp(impliedTotalDelta * policy.coefficient, -policy.capPoints, policy.capPoints);

  return {
    marketContextAvailable: true,
    teamImpliedTotal: teamTotal,
    leagueAverageImpliedTeamTotal: leagueAverage,
    impliedTotalDelta,
    scoringEnvironmentAdjustment,
  };
}

// ---------------------------------------------------------------------------
// 2. Opponent fantasy points allowed vs. position
// ---------------------------------------------------------------------------

/**
 * Games-equivalent weight placed on the prior season inside the FPA blend
 * (`currentWeight = gamesPlayed2026 / (gamesPlayed2026 + PRIOR_STRENGTH)`).
 * Mirrors the precedent set by the frozen model's own deterministic
 * shrinkage baseline (`SHRINKAGE_K_CANDIDATES` in `../model/baselines.ts`,
 * which selects from {2, 4, 6, 8}); 4 is chosen here -- roughly a
 * quarter-season of prior-season weight -- so a defense needs about four
 * current-season games before it is weighted evenly against a full prior
 * season, and eight games before the current season dominates 2-to-1. This
 * is a tracked product-policy constant, not a fit hyperparameter.
 */
export const OPPONENT_FPA_PRIOR_STRENGTH = 4;

/**
 * Product-policy weights/caps for `opponentFpaAdjustment`. The adjustment
 * scales with the player's own baseline (a bigger raw swing for a
 * higher-baseline player) but the cap prevents a extreme matchup from ever
 * being able to invert the ranking of a clearly-better player against a
 * clearly-worse one.
 */
export const OPPONENT_FPA_POLICY: Readonly<Record<FantasyPosition, { weight: number; capPoints: number }>> = {
  QB: { weight: 0.20, capPoints: 2.0 },
  RB: { weight: 0.15, capPoints: 1.5 },
  WR: { weight: 0.18, capPoints: 1.75 },
  TE: { weight: 0.15, capPoints: 1.25 },
};

export type OpponentFpaFallbackReason =
  | "none"
  | "current-season-missing-use-prior"
  | "missing-prior-season-neutral"
  | "missing-both-neutral";

export type OpponentFpaContext = {
  opponentFpaPerGamePriorSeason: number | null;
  opponentFpaPerGameCurrentSeason: number | null;
  opponentFpaLeagueAverage: number | null;
  opponentFpaCurrentSeasonGames: number;
  opponentFpaCurrentSeasonWeight: number;
  opponentFpaPriorSeasonWeight: number;
  opponentFpaBlended: number | null;
  opponentFpaRatio: number | null;
  opponentFpaAdjustment: number;
  fallbackReason: OpponentFpaFallbackReason;
};

function blendWeights(gamesPlayedCurrentSeason: number): { currentWeight: number; priorWeight: number } {
  const games = Math.max(0, gamesPlayedCurrentSeason);
  const currentWeight = games / (games + OPPONENT_FPA_PRIOR_STRENGTH);
  return { currentWeight, priorWeight: 1 - currentWeight };
}

type FpaBlendResult = {
  blended: number | null;
  currentWeight: number;
  priorWeight: number;
  fallbackReason: OpponentFpaFallbackReason;
};

/**
 * Continuous, automatic shrinkage blend of prior-season and current-season
 * opponent FPA -- see `OPPONENT_FPA_PRIOR_STRENGTH`. Never hardcodes a
 * week-number rule; the blend is driven entirely by `currentSeasonGames`.
 */
function blendOpponentFpa(
  priorSeasonFpa: number | null,
  currentSeasonFpa: number | null,
  currentSeasonGames: number,
): FpaBlendResult {
  const { currentWeight, priorWeight } = blendWeights(currentSeasonGames);

  if (priorSeasonFpa == null && currentSeasonFpa == null) {
    return { blended: null, currentWeight, priorWeight, fallbackReason: "missing-both-neutral" };
  }
  if (priorSeasonFpa == null) {
    // No prior-season authority to blend against -- do not trust a 1-2 game
    // current-season sample alone; fall back to a fully neutral matchup.
    return { blended: null, currentWeight, priorWeight, fallbackReason: "missing-prior-season-neutral" };
  }
  if (currentSeasonFpa == null || currentSeasonGames <= 0) {
    return { blended: priorSeasonFpa, currentWeight, priorWeight, fallbackReason: "current-season-missing-use-prior" };
  }

  return {
    blended: currentWeight * currentSeasonFpa + priorWeight * priorSeasonFpa,
    currentWeight,
    priorWeight,
    fallbackReason: "none",
  };
}

/**
 * Translates the blended opponent FPA strength (relative to the
 * league-average blended FPA for the position) into a small, bounded,
 * monotonic fantasy-point adjustment. A missing/neutral blend always yields
 * `opponentFpaAdjustment: 0`; it never fabricates a signal.
 */
export function computeOpponentFpaContext(
  position: FantasyPosition,
  baselineFantasyPoints: number,
  input: {
    priorSeasonFpa: number | null;
    currentSeasonFpa: number | null;
    currentSeasonGames: number;
    leagueAverageFpa: number | null;
  },
): OpponentFpaContext {
  const blend = blendOpponentFpa(input.priorSeasonFpa, input.currentSeasonFpa, input.currentSeasonGames);

  const ratio =
    blend.blended != null && input.leagueAverageFpa != null && input.leagueAverageFpa !== 0
      ? blend.blended / input.leagueAverageFpa
      : blend.fallbackReason === "missing-prior-season-neutral"
        ? 1
        : null;

  const fpaDeltaPct = ratio != null ? ratio - 1 : 0;
  const policy = OPPONENT_FPA_POLICY[position];
  const opponentFpaAdjustment =
    ratio != null ? clamp(baselineFantasyPoints * fpaDeltaPct * policy.weight, -policy.capPoints, policy.capPoints) : 0;

  return {
    opponentFpaPerGamePriorSeason: input.priorSeasonFpa,
    opponentFpaPerGameCurrentSeason: input.currentSeasonFpa,
    opponentFpaLeagueAverage: input.leagueAverageFpa,
    opponentFpaCurrentSeasonGames: input.currentSeasonGames,
    opponentFpaCurrentSeasonWeight: blend.currentWeight,
    opponentFpaPriorSeasonWeight: blend.priorWeight,
    opponentFpaBlended: blend.blended,
    opponentFpaRatio: ratio,
    opponentFpaAdjustment,
    fallbackReason: blend.fallbackReason,
  };
}

/**
 * League-average BLENDED opponent FPA for a position/season/week, built
 * entirely from `history` (the same leakage-safe player-week outcomes
 * `fpaForOpponent` already uses elsewhere) -- no second FPA authority. Each
 * opponent team contributes its own blended value (using its own
 * current-season games count), so the league average is on the same footing
 * as any individual team's blended value it's compared against.
 */
export function leagueAverageBlendedOpponentFpa(
  history: readonly HistoricalPlayerWeek[],
  season: number,
  week: number,
  position: FantasyPosition,
): number | null {
  const teams = new Set<string>();
  for (const row of history) {
    if (row.position === position && (row.season === season || row.season === season - 1)) teams.add(row.opponent);
  }

  const values: number[] = [];
  for (const team of teams) {
    const priorSeasonFpa = fpaForOpponent(history, season - 1, position, team, null).value;
    const current = fpaForOpponent(history, season, position, team, week);
    const blend = blendOpponentFpa(priorSeasonFpa, current.value, current.games);
    if (blend.blended != null) values.push(blend.blended);
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
