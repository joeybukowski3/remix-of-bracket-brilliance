/**
 * mlb-hr-selection.mjs
 *
 * Deterministic selection logic for HR best-bets picks. This is the
 * authoritative selection mechanism — the LLM (Grok) is only ever used to
 * write wording/explanations for ALREADY-selected players, never to choose
 * who is selected.
 *
 * Selection rules (no sportsbook value/edge calculation involved):
 *  - bestBets: top N by HR Quality Score among confirmed-starter rows
 *  - valueBets: next-tier rows by HR Quality Score, restricted to rows
 *    with HR odds available
 *  - longshots: rows ranked 8-25 with the longest market odds among
 *    qualifying rows (still selected by rule, not by a fabricated edge)
 */

export const SELECTION_LIMITS = {
  bestBets: 5,
  valueBets: 3,
  longshots: 2,
};

export const SELECTION_MIN_QUALITY_SCORE = 40;

function americanOddsToNumeric(odds) {
  if (!odds) return null;
  const n = parseFloat(String(odds).replace("+", ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Array} rows  Already rank-sorted (descending HR Quality Score) validated batter rows
 * @returns {{ bestBets: Array, valueBets: Array, longshots: Array }}
 */
export function selectDeterministicHrPicks(rows) {
  const eligible = rows.filter((r) =>
    r.hrScore != null &&
    r.hrScore >= SELECTION_MIN_QUALITY_SCORE &&
    String(r.opposingPitcher ?? "").toUpperCase() !== "TBD"
  );

  const bestBets = eligible.slice(0, SELECTION_LIMITS.bestBets);

  const usedKeys = new Set(bestBets.map((r) => `${r.player}|${r.team}`));
  const valueBetsPool = eligible.filter((r) => !usedKeys.has(`${r.player}|${r.team}`) && r.hrOddsYes != null);
  const valueBets = valueBetsPool.slice(0, SELECTION_LIMITS.valueBets);
  valueBets.forEach((r) => usedKeys.add(`${r.player}|${r.team}`));

  // Longshots: from ranks 8-25, prefer the longest (highest positive American) odds among qualifiers
  const longshotPool = eligible
    .slice(7, 25)
    .filter((r) => !usedKeys.has(`${r.player}|${r.team}`) && r.hrOddsYes != null)
    .map((r) => ({ row: r, numericOdds: americanOddsToNumeric(r.hrOddsYes) }))
    .filter((x) => x.numericOdds != null && x.numericOdds > 0)
    .sort((a, b) => b.numericOdds - a.numericOdds);
  const longshots = longshotPool.slice(0, SELECTION_LIMITS.longshots).map((x) => x.row);

  return { bestBets, valueBets, longshots };
}
