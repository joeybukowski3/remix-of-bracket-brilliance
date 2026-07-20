/**
 * mlb-numerology-x-selection-core.mjs
 *
 * Confirmation-aware selection for the Numerology email + X delivery
 * artifact. The live board keeps showing projected/probable/unknown-status
 * plays (that's the website's normal behavior, unchanged by this module) --
 * but a delivered email or X post must contain ONLY players confirmed in
 * today's official starting lineup, whose game has not started.
 *
 * `plays` is expected to already be sorted by the numerology model's own
 * ranking (see mlb-numerology-tracking.mjs's buildDailyNumerologyCard,
 * whose `card.plays` array is sorted by compareLivePlays). This module never
 * re-sorts or re-scores -- it only filters, so numerology scoring/ranking is
 * never touched by delivery selection. `isGameStarted` / `liveConfirm` are
 * injected by the caller (resolved from a live confirmation snapshot via
 * resolveNumerologyFacts), so this core is fully unit-testable and never
 * touches network.
 */

const DEFAULT_MAX_TABLE_SIZE = 5;
export const NUMEROLOGY_QUALIFYING_SCORE_THRESHOLD = 50;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Filter already-ranked numerology plays down to the confirmed-lineup,
 * qualifying-score subset, capped to `maxTableSize`. Order is preserved
 * exactly as given.
 *
 * @param {object} params
 * @param {Array<object>} params.plays          already-ranked numerology plays (card.plays)
 * @param {(play:object)=>boolean} [params.isGameStarted]  live game-started lookup (default: never started)
 * @param {(play:object)=>boolean|null} [params.liveConfirm]  live official-lineup confirmation; only an explicit
 *                                                              `true` counts as confirmed (fail-closed -- null/false/
 *                                                              undefined all exclude the play, matching "projected/
 *                                                              probable/pending/unknown/bench/scratched are never eligible")
 * @param {number} [params.threshold]           minimum numerologyScore to qualify (default 50, matching the
 *                                                existing "qualified" threshold used elsewhere in this codebase)
 * @param {number} [params.maxTableSize]        upper bound on rows (default 5)
 * @returns {{ selected: Array<object>, confirmedCount: number, belowThresholdExcludedCount: number,
 *             unconfirmedExcludedCount: number, startedExcludedCount: number }}
 */
export function selectConfirmedNumerologyPlays({
  plays = [],
  isGameStarted = () => false,
  liveConfirm = () => null,
  threshold = NUMEROLOGY_QUALIFYING_SCORE_THRESHOLD,
  maxTableSize = DEFAULT_MAX_TABLE_SIZE,
} = {}) {
  let belowThresholdExcludedCount = 0;
  let unconfirmedExcludedCount = 0;
  let startedExcludedCount = 0;

  const confirmed = [];
  for (const play of plays) {
    const score = toFiniteNumber(play?.numerologyScore);
    if (score == null || score <= threshold) {
      belowThresholdExcludedCount += 1;
      continue;
    }
    if (isGameStarted(play)) {
      startedExcludedCount += 1;
      continue;
    }
    // Fail-closed: only an explicit true is a live-confirmed starter. null
    // (no signal yet), false (explicitly not found in the confirmed order),
    // and anything else are all treated as not-yet-eligible.
    if (liveConfirm(play) !== true) {
      unconfirmedExcludedCount += 1;
      continue;
    }
    confirmed.push(play);
  }

  return {
    selected: confirmed.slice(0, maxTableSize),
    confirmedCount: confirmed.length,
    belowThresholdExcludedCount,
    unconfirmedExcludedCount,
    startedExcludedCount,
  };
}
