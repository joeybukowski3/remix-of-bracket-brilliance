/**
 * mlb-bullpen-innings.mjs
 *
 * Pure helpers for parsing and aggregating MLB "innings pitched" values.
 *
 * MLB StatsAPI reports inningsPitched as baseball decimal notation, where
 * the fractional part is thirds of an inning, NOT tenths:
 *   "6.0" = 6 innings exactly = 18 outs
 *   "6.1" = 6 innings + 1 out = 19 outs
 *   "6.2" = 6 innings + 2 outs = 20 outs
 *
 * Naively parsing this as a float (e.g. summing "6.1" + "6.1" as
 * 12.2 innings) silently produces wrong totals -- 12.2 baseball-notation
 * is invalid (fractional part must be 0/1/2) and any rate stat computed
 * from it would be wrong. All aggregation in this module goes through
 * outs (an exact integer) and only converts back to baseball notation
 * or true decimal innings at the boundary.
 */

/**
 * Parses a baseball-notation innings-pitched value into an exact integer
 * number of outs.
 *
 * @param {string|number|null|undefined} innings
 * @returns {number|null} outs, or null if the value is missing/invalid
 */
export function parseInningsToOuts(innings) {
  if (innings === null || innings === undefined || innings === "") return null;
  const str = String(innings).trim();
  const match = /^(-?\d+)(?:\.(\d))?$/.exec(str);
  if (!match) return null;
  const wholeInnings = Number(match[1]);
  const thirds = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(wholeInnings) || thirds > 2) return null;
  const sign = wholeInnings < 0 ? -1 : 1;
  return sign * (Math.abs(wholeInnings) * 3 + thirds);
}

/**
 * Formats an integer number of outs back into baseball decimal notation.
 *
 * @param {number} outs
 * @returns {string} e.g. 124 -> "41.1"
 */
export function outsToBaseballNotation(outs) {
  if (!Number.isFinite(outs)) return "0.0";
  const sign = outs < 0 ? -1 : 1;
  const absOuts = Math.abs(Math.round(outs));
  const wholeInnings = Math.floor(absOuts / 3);
  const thirds = absOuts % 3;
  return `${sign < 0 ? "-" : ""}${wholeInnings}.${thirds}`;
}

/**
 * Converts an integer number of outs into true decimal innings, suitable
 * for rate-stat math (ERA, WHIP, etc). This is NOT baseball notation --
 * it's outs/3 as a real number.
 *
 * @param {number} outs
 * @returns {number}
 */
export function outsToDecimalInnings(outs) {
  if (!Number.isFinite(outs)) return 0;
  return outs / 3;
}

/**
 * Sums a list of baseball-notation innings values into total outs.
 * Invalid/missing entries are skipped (not treated as zero-with-a-warning
 * here; callers that need coverage tracking should check each value with
 * parseInningsToOuts individually).
 *
 * @param {Array<string|number|null|undefined>} inningsList
 * @returns {number} total outs
 */
export function sumInningsToOuts(inningsList) {
  let totalOuts = 0;
  for (const innings of inningsList ?? []) {
    const outs = parseInningsToOuts(innings);
    if (outs !== null) totalOuts += outs;
  }
  return totalOuts;
}
