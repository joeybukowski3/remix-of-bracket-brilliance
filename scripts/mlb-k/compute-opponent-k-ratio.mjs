/**
 * Opponent K% vs pitcher handedness -- primary/fallback/neutral hierarchy.
 *
 * Source of truth for vs-hand strikeout counts is batter-hand-splits-cache.json
 * (real per-batter strikeouts/plateAppearances vs left/right). Numerators and
 * denominators are aggregated FIRST across all relevant batters, then divided
 * -- individual batter K% values are never averaged directly, since that
 * would ignore each batter's opportunity weight (plate appearances).
 */

export const OPPONENT_K_RATIO_MODEL_VERSION = "mlb-k-opponent-ratio-v1";

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function handSplitKey(pitcherHand) {
  if (pitcherHand === "L") return "vsLeft";
  if (pitcherHand === "R") return "vsRight";
  return null;
}

/**
 * Sum strikeouts and plateAppearances for a set of batter playerIds against
 * the given pitcher hand, using batter-hand-splits-cache.json's raw counts.
 * Returns null if no batter in the set has usable data.
 */
function aggregateVsHand(playerIds, pitcherHand, handSplitsByPlayerId) {
  const key = handSplitKey(pitcherHand);
  if (!key) return null;
  let strikeouts = 0;
  let plateAppearances = 0;
  let contributingBatters = 0;
  for (const playerId of playerIds) {
    const player = handSplitsByPlayerId.get(playerId);
    const split = player?.splits?.[key];
    const pa = finite(split?.plateAppearances);
    const k = finite(split?.strikeouts);
    if (pa == null || k == null || pa <= 0) continue;
    strikeouts += k;
    plateAppearances += pa;
    contributingBatters += 1;
  }
  if (plateAppearances <= 0) return null;
  return { strikeouts, plateAppearances, rate: strikeouts / plateAppearances, contributingBatters };
}

/**
 * League K% vs a given hand, aggregated the same way (sum K, sum PA, then
 * divide) across every batter in the hand-splits cache. Same stat grain
 * (K / PA) as the numerator -- never mixed with K/AB.
 */
export function computeLeagueKRateVsHand(pitcherHand, handSplitsByPlayerId) {
  const key = handSplitKey(pitcherHand);
  if (!key) return null;
  let strikeouts = 0;
  let plateAppearances = 0;
  for (const player of handSplitsByPlayerId.values()) {
    const split = player?.splits?.[key];
    const pa = finite(split?.plateAppearances);
    const k = finite(split?.strikeouts);
    if (pa == null || k == null || pa <= 0) continue;
    strikeouts += k;
    plateAppearances += pa;
  }
  return plateAppearances > 0 ? strikeouts / plateAppearances : null;
}

/**
 * @param {object} params
 * @param {"L"|"R"|null} params.pitcherHand
 * @param {Array<{playerId:number, lineupStatus:string, starterConfirmed:boolean}>} params.lineupBatters
 *   Confirmed/projected opposing lineup for today's game (already filtered to opponent team).
 * @param {number[]} params.teamRosterPlayerIds
 *   All playerIds on the opposing team's roster this season (for the team-season fallback).
 * @param {Map<number, object>} params.handSplitsByPlayerId
 *   playerId -> batter-hand-splits-cache.json player record.
 * @returns {{ opponentKRateVsHand: number|null, leagueKRateVsHand: number|null, opponentKRatio: number|null, source: "LINEUP"|"TEAM_FALLBACK"|"NEUTRAL" }}
 */
export function computeOpponentKRatio({
  pitcherHand,
  lineupBatters = [],
  teamRosterPlayerIds = [],
  handSplitsByPlayerId,
}) {
  const leagueKRateVsHand = computeLeagueKRateVsHand(pitcherHand, handSplitsByPlayerId);

  const lineupIds = lineupBatters
    .filter((batter) => batter.lineupStatus === "confirmed" || batter.lineupStatus === "projected")
    .map((batter) => batter.playerId);
  const lineupAggregate = aggregateVsHand(lineupIds, pitcherHand, handSplitsByPlayerId);
  if (lineupAggregate && leagueKRateVsHand != null && leagueKRateVsHand > 0) {
    return {
      opponentKRateVsHand: lineupAggregate.rate,
      leagueKRateVsHand,
      opponentKRatio: lineupAggregate.rate / leagueKRateVsHand,
      source: "LINEUP",
    };
  }

  const teamAggregate = aggregateVsHand(teamRosterPlayerIds, pitcherHand, handSplitsByPlayerId);
  if (teamAggregate && leagueKRateVsHand != null && leagueKRateVsHand > 0) {
    return {
      opponentKRateVsHand: teamAggregate.rate,
      leagueKRateVsHand,
      opponentKRatio: teamAggregate.rate / leagueKRateVsHand,
      source: "TEAM_FALLBACK",
    };
  }

  return {
    opponentKRateVsHand: null,
    leagueKRateVsHand,
    opponentKRatio: 1,
    source: "NEUTRAL",
  };
}

export default computeOpponentKRatio;
