/**
 * Phase 11A: leakage-safe research-row builder.
 *
 * Joins one JKB projection + one sportsbook line/prices + (nullable) actual
 * outcome + diagnostic context into a single research row. No recommendation,
 * EV, or probability-of-winning field is produced here -- only descriptive
 * error/edge measures (see README section "Required row fields").
 *
 * Leakage guard: the sportsbook line's `observedAt` must be strictly before
 * the game's `commenceTime`. A line observed at/after kickoff is not a valid
 * pregame market observation for this research (it may already reflect
 * in-game information) and is rejected outright, not merely flagged.
 */
import { noVigProbabilities } from "./nfl-research-odds-math.mjs";

export const PROVENANCE = Object.freeze({
  HISTORICAL: "historicalProviderArchive",
  LIVE_PAPER_TRADING: "livePaperTradingArchive",
});

/** @returns {true|string} true if the line is pregame-safe, else a rejection reason. */
export function checkLeakage({ observedAt, commenceTime }) {
  const observed = new Date(observedAt).getTime();
  const commence = new Date(commenceTime).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(commence)) return "invalid_timestamp";
  if (observed >= commence) return "line_observed_at_or_after_kickoff";
  return true;
}

function determineOutcome(actualYards, line) {
  if (actualYards == null || line == null) return null;
  if (actualYards > line) return "over";
  if (actualYards < line) return "under";
  return "push";
}

/**
 * @param {object} input
 * @returns {{row: object|null, rejected: string|null}}
 */
export function buildResearchRow(input) {
  const {
    provenance,
    market,
    playerId,
    playerName,
    team,
    opponent,
    gameId,
    season,
    week,
    observedAt,
    commenceTime,
    bookmaker,
    projectionYards,
    matchupScore = null,
    estimatedRange = null,
    historyStatus = null,
    hardCaseFlags = null,
    roleSource = null,
    sportsbookLine,
    overPrice = null,
    underPrice = null,
    actualYards = null,
  } = input;

  const leakageCheck = checkLeakage({ observedAt, commenceTime });
  if (leakageCheck !== true) return { row: null, rejected: leakageCheck };

  if (projectionYards == null || sportsbookLine == null) {
    return { row: null, rejected: "missing_projection_or_line" };
  }

  const rawEdgeYards = projectionYards - sportsbookLine;
  const actualVsLine = actualYards == null ? null : actualYards - sportsbookLine;
  const projectionError = actualYards == null ? null : projectionYards - actualYards;
  const lineError = actualYards == null ? null : sportsbookLine - actualYards;
  const outcome = determineOutcome(actualYards, sportsbookLine);
  const { overProb, underProb } = noVigProbabilities(overPrice, underPrice);

  let intervalRelation = null;
  if (estimatedRange && sportsbookLine != null) {
    if (sportsbookLine < estimatedRange.estimatedLow) intervalRelation = "belowInterval";
    else if (sportsbookLine > estimatedRange.estimatedHigh) intervalRelation = "aboveInterval";
    else intervalRelation = "insideInterval";
  }

  const row = {
    provenance,
    market,
    playerId,
    playerName,
    team,
    opponent,
    gameId,
    season,
    week,
    observedAt,
    commenceTime,
    bookmaker,
    projectionYards,
    sportsbookLine,
    rawEdgeYards,
    actualYards,
    actualVsLine,
    projectionError,
    lineError,
    outcome,
    overPrice,
    underPrice,
    noVigOverProb: overProb,
    noVigUnderProb: underProb,
    matchupScore,
    estimatedRange,
    intervalRelation,
    historyStatus,
    hardCaseFlags,
    roleSource,
  };

  return { row, rejected: null };
}
