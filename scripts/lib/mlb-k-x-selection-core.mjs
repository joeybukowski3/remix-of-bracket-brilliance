/**
 * mlb-k-x-selection-core.mjs
 *
 * Value-play selection for the Strikeout Props X post. A pitcher is
 * eligible only when ALL of the following are true:
 *
 *   - status === "VALID"                      (resolveKPropStatus classification --
 *                                              real market line + workload-confident
 *                                              projection + plausible odds/book)
 *   - kLine is a finite number, >= MIN_K_LINE (market K line exists; excludes
 *                                              reliever/opener/nonstandard-role lines --
 *                                              already implied by VALID, checked again here
 *                                              defensively rather than trusted)
 *   - projectedKs is a finite number          (model K projection exists)
 *   - projectedIP is a finite number > MIN_PROJECTED_IP (3.0) -- exactly 3.0 is
 *                                              excluded, missing is excluded. Uses ONLY
 *                                              the row's own canonical projectedIP field;
 *                                              never inferred from starter status, betting
 *                                              line, past usage, or any other proxy.
 *   - the projection edge (projectedKs - kLine) is non-zero -- exactly zero is excluded,
 *                                              never defaulted to a side
 *   - the recommended side is derived STRICTLY from the edge's sign, computed fresh here
 *                                              -- never trusted from a scraped
 *                                              data-k-side/direction attribute or any
 *                                              other proxy: edge>0 -> OVER, edge<0 -> UNDER
 *   - valid American odds exist for THAT derived side specifically -- odds posted only
 *                                              for the opposite side does not qualify
 *   - it is today's currently listed starter  (isCurrentStarter -- excludes
 *                                              replaced/scratched/opener-changed/stale
 *                                              probables)
 *   - the game has not started
 *
 * "Slate/date is current" is enforced by the caller (a single value shared
 * across every row, not a per-row field) -- see post-mlb-strikeout-props-to-x.mjs's
 * dataFresh check, which passes an empty rows array here entirely when stale.
 *
 * Ranking: all qualified plays sorted by absolute projection edge descending
 * -- Overs and Unders compete equally on the same board, never a side
 * preference.
 *
 * Opposing-lineup handling (pre-existing, unchanged by the value-play rewrite):
 *   - During the polling/preferred window we PREFER rows whose opposing
 *     batting order is confirmed; rows whose opponent lineup has not posted
 *     yet are held back (surfaced as heldForOpposingCount -> the readiness
 *     layer reports WAITING_FOR_OPPOSING_LINEUP).
 *   - At the final cutoff (atCutoff=true) we relax that and allow any
 *     otherwise-eligible current starter, because a confirmed starter with a
 *     valid K market is still a legitimate play even if the opponent's card
 *     hasn't dropped. The starter identity itself is never relaxed -- a
 *     stale/replaced pitcher matchup can never post.
 *
 * Pure/side-effect-free: `isCurrentStarter`, `gameStarted`, and
 * `opposingLineupConfirmed` are resolved by the caller from a live
 * confirmation snapshot and passed in per row.
 */

export const MIN_K_LINE = 3.5;
export const MIN_PROJECTED_IP = 3.0;

export const K_VALUE_EXCLUSION_REASON = Object.freeze({
  /** status/line/projection/IP/edge/odds -- anything not tied to starter identity or timing. */
  INVALID_MARKET: "INVALID_MARKET",
  /** Game already started, or this pitcher is no longer today's currently listed starter. */
  STALE_STARTER: "STALE_STARTER",
});

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

/**
 * Canonical projection-edge info for one row, derived ONLY from the row's
 * own projectedKs/kLine -- never trusted from a scraped direction/side
 * attribute or any other proxy. `side` is null (never a fabricated default)
 * when either input is missing or the edge is exactly zero.
 */
export function getKValueEdgeInfo(row) {
  const projectedKs = toFiniteNumber(row?.projectedKs);
  const kLine = toFiniteNumber(row?.kLine);
  if (projectedKs == null || kLine == null) {
    return { projectedKs, kLine, edge: null, absoluteEdge: null, side: null };
  }
  const edge = Number((projectedKs - kLine).toFixed(2));
  const side = edge > 0 ? "OVER" : edge < 0 ? "UNDER" : null;
  return { projectedKs, kLine, edge, absoluteEdge: Math.abs(edge), side };
}

/** Valid American odds exist for the given derived side specifically (never the opposite side). */
function hasOddsForSide(row, side) {
  if (side === "OVER") return isAmericanOdds(row?.oddsOver);
  if (side === "UNDER") return isAmericanOdds(row?.oddsUnder);
  return false;
}

/**
 * Full value-play eligibility for one row -- see module doc above for the
 * complete guard list. Returns `side`/`edgeInfo` alongside the boolean so
 * callers never have to recompute the derived side separately, and `reason`
 * (one of K_VALUE_EXCLUSION_REASON, or null when eligible) so callers can
 * bucket exclusions without re-deriving why a row failed.
 */
export function evaluateKValuePlayEligibility(row) {
  const edgeInfo = getKValueEdgeInfo(row);
  const projectedIP = toFiniteNumber(row?.projectedIP);
  const marketOk =
    normalizeText(row?.status) === "VALID" &&
    edgeInfo.kLine != null &&
    edgeInfo.kLine >= MIN_K_LINE &&
    edgeInfo.projectedKs != null &&
    projectedIP != null &&
    projectedIP > MIN_PROJECTED_IP &&
    edgeInfo.side != null &&
    hasOddsForSide(row, edgeInfo.side);

  if (!marketOk) {
    return { eligible: false, reason: K_VALUE_EXCLUSION_REASON.INVALID_MARKET, side: edgeInfo.side, edgeInfo };
  }
  if (row?.gameStarted || !row?.isCurrentStarter) {
    return { eligible: false, reason: K_VALUE_EXCLUSION_REASON.STALE_STARTER, side: edgeInfo.side, edgeInfo };
  }
  return { eligible: true, reason: null, side: edgeInfo.side, edgeInfo };
}

/**
 * Select the K value-play X rows.
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

  const eligible = [];
  for (const row of rows) {
    const evaluation = evaluateKValuePlayEligibility(row);
    if (!evaluation.eligible) {
      if (evaluation.reason === K_VALUE_EXCLUSION_REASON.STALE_STARTER) excludedStaleStarterCount += 1;
      else excludedInvalidMarketCount += 1;
      continue;
    }
    // direction/projectionEdge are overwritten with the freshly-derived
    // values here -- any scraped data-k-side/data-k-projection-edge on the
    // row is never trusted for eligibility or downstream caption/render use.
    eligible.push({ ...row, direction: evaluation.side, projectionEdge: evaluation.edgeInfo.edge });
  }

  const pool = atCutoff ? eligible : eligible.filter((r) => r.opposingLineupConfirmed);
  const heldForOpposingCount = atCutoff ? 0 : eligible.length - pool.length;

  pool.sort((left, right) => Math.abs(right.projectionEdge) - Math.abs(left.projectionEdge));

  return {
    selected: pool.slice(0, maxTableSize),
    validStarterCount: eligible.length,
    heldForOpposingCount,
    excludedStaleStarterCount,
    excludedInvalidMarketCount,
  };
}
