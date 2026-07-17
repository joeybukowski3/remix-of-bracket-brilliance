/**
 * mlb-hr-x-selection-core.mjs
 *
 * Confirmation-aware selection of the HR Props X table. The website table
 * keeps showing projected-lineup hitters, but a live X post must contain
 * ONLY hitters confirmed in today's official batting order (1-9) whose game
 * has not started.
 *
 * Critically, this does NOT just filter the pre-selected top 3 and stop --
 * that would leave a one-row table when two of the top three are projected.
 * It rebuilds the ranking from every confirmed-eligible hitter and backfills
 * with the next-highest qualifying confirmed hitters, posting a smaller table
 * when fewer confirmed candidates exist and never padding with projected
 * players.
 *
 *   Top three by score: A(proj) B(conf) C(proj) D(conf) E(conf)
 *   → X table becomes:  B, D, E   (not just B)
 *
 * Pure/side-effect-free: `isRowConfirmed` / `isGameStarted` are injected by
 * the caller (resolved from generated lineupStatus + a live confirmation
 * snapshot), so this core is fully unit-testable and never touches network.
 */

import { classifyHitterConfirmation, ConfirmationStatus } from "./mlb-x-confirmation.mjs";

const DEFAULT_MAX_TABLE_SIZE = 3;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTeamKey(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Rebuild the HR X table from confirmed-eligible hitters, highest HR score
 * first, backfilling down the confirmed pool.
 *
 * @param {object} params
 * @param {Array<object>} params.batters       normalized HR rows (need hrScore, hrScoreRank, lineupStatus, battingOrder)
 * @param {(row:object)=>boolean} [params.isGameStarted]  live game-started lookup (default: never started)
 * @param {(row:object)=>boolean|null} [params.liveConfirm]  optional live re-confirmation; return false to veto a
 *                                                            generated-confirmed row, null/true to defer to generated status
 * @param {number} [params.maxTableSize]        upper bound on rows (default 3)
 * @returns {{ selected: Array<object>, confirmedCount: number, confirmedGameCount: number,
 *             projectedExcludedCount: number, unconfirmedExcludedCount: number, startedExcludedCount: number }}
 */
export function selectConfirmedHrProps({
  batters = [],
  isGameStarted = () => false,
  liveConfirm = () => null,
  maxTableSize = DEFAULT_MAX_TABLE_SIZE,
} = {}) {
  let projectedExcludedCount = 0;
  let unconfirmedExcludedCount = 0;
  let startedExcludedCount = 0;

  const confirmed = [];
  for (const row of batters) {
    const status = classifyHitterConfirmation(row);

    if (status === ConfirmationStatus.PROJECTED) {
      projectedExcludedCount += 1;
      continue;
    }
    if (status !== ConfirmationStatus.CONFIRMED_LINEUP) {
      // OUT / UNCONFIRMED
      unconfirmedExcludedCount += 1;
      continue;
    }
    if (isGameStarted(row)) {
      startedExcludedCount += 1;
      continue;
    }
    // Fail-closed live re-confirmation: an explicit `false` vetoes a row that
    // the generated data called confirmed but live boxscore data does not.
    if (liveConfirm(row) === false) {
      unconfirmedExcludedCount += 1;
      continue;
    }
    confirmed.push(row);
  }

  confirmed.sort((left, right) => {
    const scoreDelta = (toFiniteNumber(right.hrScore) ?? -Infinity) - (toFiniteNumber(left.hrScore) ?? -Infinity);
    if (scoreDelta !== 0) return scoreDelta;
    return (toFiniteNumber(left.hrScoreRank) ?? Infinity) - (toFiniteNumber(right.hrScoreRank) ?? Infinity);
  });

  // Distinct games represented in the FULL confirmed pool (before slicing to
  // maxTableSize) -- lets the caller's readiness gate require the confirmed
  // pool to span more than one game before treating a raw headcount as "the
  // slate is ready," so a single early-confirmed game can never alone
  // satisfy readiness and monopolize the table. Falls back to `team` when
  // `gameId` is missing (each confirmed lineup is one team's batting order
  // within exactly one game, so team is an equally valid game proxy).
  const confirmedGameCount = new Set(
    confirmed.map((row) => (row.gameId != null ? `game:${row.gameId}` : `team:${normalizeTeamKey(row.team)}`)),
  ).size;

  return {
    selected: confirmed.slice(0, maxTableSize),
    confirmedCount: confirmed.length,
    confirmedGameCount,
    projectedExcludedCount,
    unconfirmedExcludedCount,
    startedExcludedCount,
  };
}
