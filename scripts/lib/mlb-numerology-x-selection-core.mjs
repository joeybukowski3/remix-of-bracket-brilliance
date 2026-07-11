/**
 * mlb-numerology-x-selection-core.mjs
 *
 * Confirmation-aware selection of the Numerology X table. Numerology plays
 * are not all hitters -- each play is classified by its recommended market
 * into one of four row types, and each type has its OWN explicit eligibility
 * rule so non-player logic is never silently discarded:
 *
 *   hitter  -> requires official current batting-order confirmation (1-9)
 *   pitcher -> requires current-starter confirmation
 *   team    -> team/game selection (moneyline, run line, team total, etc.):
 *              no lineup needed; eligible while the game has not started
 *   other   -> non-player, non-team numerology (e.g. a day-number/context
 *              play): eligible while the game has not started
 *
 * The published table is rebuilt from the highest-rated ELIGIBLE plays after
 * confirmation filtering (backfilled, smaller table allowed) -- unconfirmed
 * top rows are dropped AND replaced, never just removed. Projected hitters
 * and stale/replaced pitchers are never posted.
 *
 * Pure/side-effect-free: confirmation facts (gameStarted, hitter live
 * confirmation, current-starter) are resolved by the caller and passed in.
 */

import { classifyHitterConfirmation, ConfirmationStatus } from "./mlb-x-confirmation.mjs";

export const NumerologyRowType = {
  HITTER: "hitter",
  PITCHER: "pitcher",
  TEAM: "team",
  OTHER: "other",
};

const PITCHER_MARKET_KEYWORDS = ["strikeout", "outs recorded", "earned run", "pitching", "walks allowed", "hits allowed", "pitcher"];
const BATTER_MARKET_KEYWORDS = ["home run", "hits", "total bases", "rbi", "runs batted", "stolen", "double", "single", "triple", "hitter"];
const TEAM_MARKET_KEYWORDS = ["moneyline", "run line", "total runs", "team total", "first to score", "run in the", "spread", "game total"];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

/** Classify a numerology play into hitter / pitcher / team / other. */
export function classifyNumerologyRowType(play) {
  const market = normalizeText(play?.recommendedMarket).toLowerCase();
  const source = normalizeText(play?.marketModelSource).toLowerCase();
  const hasPlayer = toFiniteNumber(play?.playerId) != null || normalizeText(play?.playerName).length > 0;

  if (source.includes("hr") || source.includes("home_run")) return NumerologyRowType.HITTER;
  if (source.includes("_k") || source.includes("strikeout")) return NumerologyRowType.PITCHER;

  if (market) {
    if (matchesAny(market, PITCHER_MARKET_KEYWORDS)) return NumerologyRowType.PITCHER;
    if (matchesAny(market, TEAM_MARKET_KEYWORDS) && !hasPlayer) return NumerologyRowType.TEAM;
    if (matchesAny(market, BATTER_MARKET_KEYWORDS)) return NumerologyRowType.HITTER;
  }

  if (hasPlayer) return NumerologyRowType.HITTER; // player-based numerology defaults to a hitter selection
  if (matchesAny(market, TEAM_MARKET_KEYWORDS)) return NumerologyRowType.TEAM;
  return NumerologyRowType.OTHER;
}

/**
 * Eligibility for a single numerology play, per its row type.
 *
 * @param {object} play
 * @param {object} facts
 * @param {boolean} [facts.gameStarted]
 * @param {boolean|null} [facts.hitterLiveConfirmed]  false vetoes a generated-confirmed hitter (fail-closed)
 * @param {boolean} [facts.isCurrentStarter]          pitcher is the current listed starter
 */
export function isNumerologyPlayEligible(play, facts = {}) {
  const { gameStarted = false, hitterLiveConfirmed = null, isCurrentStarter = false } = facts;
  if (gameStarted) return false;

  switch (classifyNumerologyRowType(play)) {
    case NumerologyRowType.HITTER: {
      const confirmed = classifyHitterConfirmation(play) === ConfirmationStatus.CONFIRMED_LINEUP;
      return confirmed && hitterLiveConfirmed !== false;
    }
    case NumerologyRowType.PITCHER:
      return Boolean(isCurrentStarter);
    case NumerologyRowType.TEAM:
    case NumerologyRowType.OTHER:
      // Explicit rule: team/game and non-player selections carry no lineup
      // dependency -- eligible as long as the game has not started.
      return true;
    default:
      return false;
  }
}

function playRating(play) {
  return toFiniteNumber(play?.finalScore) ?? toFiniteNumber(play?.numerologyScore) ?? -Infinity;
}

/**
 * Rebuild the numerology X table from the highest-rated eligible plays.
 *
 * @param {object} params
 * @param {Array<object>} params.plays
 * @param {(play:object)=>object} [params.resolveFacts]  returns eligibility facts per play
 * @param {number} [params.maxTableSize]                 default 3 featured + backfill pool
 * @returns {{ selected: Array<object>, eligibleCount: number, byType: object,
 *             projectedExcludedCount: number, ineligibleCount: number }}
 */
export function selectEligibleNumerologyPlays({ plays = [], resolveFacts = () => ({}), maxTableSize = 3 } = {}) {
  const byType = { hitter: 0, pitcher: 0, team: 0, other: 0 };
  let projectedExcludedCount = 0;
  let ineligibleCount = 0;

  const eligible = [];
  for (const play of plays) {
    const type = classifyNumerologyRowType(play);
    byType[type] = (byType[type] ?? 0) + 1;
    const facts = resolveFacts(play) || {};
    if (isNumerologyPlayEligible(play, facts)) {
      eligible.push(play);
    } else {
      if (type === NumerologyRowType.HITTER && classifyHitterConfirmation(play) === ConfirmationStatus.PROJECTED) {
        projectedExcludedCount += 1;
      } else {
        ineligibleCount += 1;
      }
    }
  }

  eligible.sort((a, b) => playRating(b) - playRating(a));

  return {
    selected: eligible.slice(0, maxTableSize),
    eligibleCount: eligible.length,
    byType,
    projectedExcludedCount,
    ineligibleCount,
  };
}
