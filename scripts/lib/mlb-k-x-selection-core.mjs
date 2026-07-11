/**
 * mlb-k-x-selection-core.mjs
 *
 * Confirmation-aware selection of the Strikeout Props X table. Preserves the
 * existing ranking (strongest absolute projection edge, |projectedKs - kLine|,
 * OVER and UNDER both eligible) and layers on current-starter confirmation
 * plus opposing-lineup awareness.
 *
 * A row is a *valid current starter* only when:
 *   - status === "VALID"                      (resolveKPropStatus classification)
 *   - kLine >= 3.5                            (MIN_K_LINE)
 *   - the correct side's odds are present     (oddsOver for OVER, oddsUnder for UNDER)
 *   - it is today's currently listed starter  (isCurrentStarter -- excludes
 *                                              replaced / scratched / opener-changed / stale probables)
 *   - the game has not started
 *
 * Opposing-lineup handling (documented cutoff fallback):
 *   - During the polling/preferred window we PREFER rows whose opposing
 *     batting order is confirmed; rows whose opponent lineup has not posted
 *     yet are held back (surfaced as heldForOpposingCount → the readiness
 *     layer reports WAITING_FOR_OPPOSING_LINEUP).
 *   - At the final cutoff (atCutoff=true) we relax that and allow any
 *     otherwise-valid current starter, because a confirmed starter with a
 *     valid K market is still a legitimate play even if the opponent's card
 *     hasn't dropped. The starter identity itself is never relaxed -- a stale
 *     projected pitcher matchup can never post.
 *
 * Pure/side-effect-free: `isCurrentStarter`, `gameStarted`, and
 * `opposingLineupConfirmed` are resolved by the caller from a live
 * confirmation snapshot and passed in per row.
 */

export const MIN_K_LINE = 3.5;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAmericanOdds(value) {
  return /^[+-]\d+$/.test(normalizeText(value));
}

/** OVER → oddsOver, UNDER → oddsUnder. */
export function hasValidOddsForSide(row) {
  const side = normalizeText(row?.direction).toUpperCase();
  if (side === "OVER") return isAmericanOdds(row?.oddsOver);
  if (side === "UNDER") return isAmericanOdds(row?.oddsUnder);
  return false;
}

/** Absolute projection edge used for ranking. */
export function kProjectionEdge(row) {
  const explicit = toFiniteNumber(row?.projectionEdge);
  if (explicit != null) return Math.abs(explicit);
  const projected = toFiniteNumber(row?.projectedKs);
  const line = toFiniteNumber(row?.kLine);
  if (projected == null || line == null) return 0;
  return Math.abs(projected - line);
}

/** Is this a valid current-starter K row (before any opposing-lineup consideration)? */
export function isValidCurrentStarterRow(row) {
  if (normalizeText(row?.status) !== "VALID") return false;
  const line = toFiniteNumber(row?.kLine);
  if (line == null || line < MIN_K_LINE) return false;
  if (!hasValidOddsForSide(row)) return false;
  if (row?.gameStarted) return false;
  if (!row?.isCurrentStarter) return false;
  return true;
}

/**
 * Select the K X rows.
 *
 * @param {object} params
 * @param {Array<object>} params.rows       scraped K rows annotated with isCurrentStarter,
 *                                           gameStarted, opposingLineupConfirmed
 * @param {boolean} [params.atCutoff]        relax opposing-lineup requirement at the final cutoff
 * @param {number} [params.maxTableSize]     upper bound on rows (default 5)
 * @returns {{ selected: Array<object>, validStarterCount: number, heldForOpposingCount: number,
 *             excludedStaleStarterCount: number, excludedInvalidMarketCount: number }}
 */
export function selectConfirmedKRows({ rows = [], atCutoff = false, maxTableSize = 5 } = {}) {
  let excludedStaleStarterCount = 0;
  let excludedInvalidMarketCount = 0;

  const validStarters = [];
  for (const row of rows) {
    // Distinguish "not the current starter / started" (stale) from "bad market"
    // purely for reporting; both are excluded.
    const marketOk =
      normalizeText(row?.status) === "VALID" &&
      (toFiniteNumber(row?.kLine) ?? 0) >= MIN_K_LINE &&
      hasValidOddsForSide(row);
    if (!marketOk) {
      excludedInvalidMarketCount += 1;
      continue;
    }
    if (row?.gameStarted || !row?.isCurrentStarter) {
      excludedStaleStarterCount += 1;
      continue;
    }
    validStarters.push(row);
  }

  const pool = atCutoff ? validStarters : validStarters.filter((r) => r.opposingLineupConfirmed);
  const heldForOpposingCount = atCutoff ? 0 : validStarters.length - pool.length;

  pool.sort((left, right) => kProjectionEdge(right) - kProjectionEdge(left));

  return {
    selected: pool.slice(0, maxTableSize),
    validStarterCount: validStarters.length,
    heldForOpposingCount,
    excludedStaleStarterCount,
    excludedInvalidMarketCount,
  };
}
