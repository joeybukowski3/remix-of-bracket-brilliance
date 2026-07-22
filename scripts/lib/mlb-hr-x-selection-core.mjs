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

/**
 * Canonical per-game identity for the confirmed-pool game-diversity check
 * (see confirmedGameCount below). Uses ONLY `gameId` -- verified against
 * production hr-props-raw.json (2026-07-17 slate, 252 batters): `gameId`
 * is present, numeric, and finite on 100% of rows, so no fallback identity
 * is invented for merely-theoretical completeness. StatsAPI assigns a
 * distinct gamePk to each leg of a doubleheader, so `gameId` alone also
 * keeps doubleheader legs correctly distinct without extra gameNumber
 * handling.
 *
 * Deliberately does NOT use team, opponent, pitcher, or player identity --
 * any one of those alone is NOT a valid game proxy (both teams in one
 * matchup would resolve to two different identities and wrongly count as
 * two games, exactly the bug this replaces). Returns null (never a
 * fabricated identity) when `gameId` is missing or not a finite number;
 * such a row is counted in `confirmedRowsWithoutGameIdentity` instead of
 * silently inflating `confirmedGameCount`.
 */
export function getConfirmedGameIdentity(row) {
  const gameId = toFiniteNumber(row?.gameId);
  return gameId == null ? null : `game:${gameId}`;
}

/** The single ranking both selection functions below use: highest HR score first, hrScoreRank as tiebreak. */
export function compareByHrScore(left, right) {
  const scoreDelta = (toFiniteNumber(right.hrScore) ?? -Infinity) - (toFiniteNumber(left.hrScore) ?? -Infinity);
  if (scoreDelta !== 0) return scoreDelta;
  return (toFiniteNumber(left.hrScoreRank) ?? Infinity) - (toFiniteNumber(right.hrScoreRank) ?? Infinity);
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
 *             confirmedRowsWithoutGameIdentity: number, projectedExcludedCount: number,
 *             unconfirmedExcludedCount: number, startedExcludedCount: number }}
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
  let promotedFromLiveCount = 0;

  const confirmed = [];
  for (const row of batters) {
    let status = classifyHitterConfirmation(row);
    const live = liveConfirm(row);

    // Live boxscore promotion.
    //
    // The generated artifact stamps lineupStatus once, when it is built, and
    // never re-stamps it as orders post. On 2026-07-21 it was generated at
    // 12:59 ET and every one of its 270 batter rows read "projected" -- while
    // the live poll snapshot taken at 15:48 ET (171 minutes before first
    // pitch) already carried a confirmed 9-deep batting order for 6 of the 15
    // games. Because a PROJECTED row exited at the first branch below, live
    // data could only ever veto a row, never confirm one, so
    // confirmedGameCount was structurally pinned at 0 for the entire slate and
    // HR could not post no matter how many lineups were actually posted.
    //
    // The live boxscore is both more current and more authoritative than the
    // stamp, so an explicit live `true` promotes. Anything short of an
    // explicit `true` leaves the generated status alone, keeping the gate
    // fail-closed: absent or unknown live data still confirms nothing.
    if (status === ConfirmationStatus.PROJECTED && live === true) {
      status = ConfirmationStatus.CONFIRMED_LINEUP;
      promotedFromLiveCount += 1;
    }

    if (status === ConfirmationStatus.PROJECTED) {
      projectedExcludedCount += 1;
      continue;
    }
    if (status !== ConfirmationStatus.CONFIRMED_LINEUP) {
      // OUT / UNCONFIRMED -- a scratched hitter is rejected here, before the
      // promotion above can ever apply to them.
      unconfirmedExcludedCount += 1;
      continue;
    }
    if (isGameStarted(row)) {
      startedExcludedCount += 1;
      continue;
    }
    // Fail-closed live re-confirmation: an explicit `false` vetoes a row that
    // the generated data called confirmed but live boxscore data does not.
    if (live === false) {
      unconfirmedExcludedCount += 1;
      continue;
    }
    confirmed.push(row);
  }

  confirmed.sort(compareByHrScore);

  // Distinct games represented in the FULL confirmed pool (before slicing to
  // maxTableSize) -- lets the caller's readiness gate require the confirmed
  // pool to span more than one game before treating a raw headcount as "the
  // slate is ready," so a single early-confirmed game can never alone
  // satisfy readiness and monopolize the table. Only rows with a reliable
  // getConfirmedGameIdentity() contribute; a row with no reliable identity
  // is counted separately (confirmedRowsWithoutGameIdentity) rather than
  // silently treated as its own distinct game.
  const gameIdentities = new Set();
  let confirmedRowsWithoutGameIdentity = 0;
  for (const row of confirmed) {
    const identity = getConfirmedGameIdentity(row);
    if (identity == null) confirmedRowsWithoutGameIdentity += 1;
    else gameIdentities.add(identity);
  }

  return {
    selected: confirmed.slice(0, maxTableSize),
    confirmedCount: confirmed.length,
    confirmedGameCount: gameIdentities.size,
    confirmedRowsWithoutGameIdentity,
    projectedExcludedCount,
    // Rows the live boxscore confirmed that the generated stamp still called
    // projected. Surfaced so a slate where this is high is visibly relying on
    // live promotion rather than a fresh artifact.
    promotedFromLiveCount,
    unconfirmedExcludedCount,
    startedExcludedCount,
  };
}

/**
 * Selects HR rows for the morning edition, which explicitly does not require
 * lineup confirmation. Reuses the exact ranking selectConfirmedHrProps uses
 * (compareByHrScore) and the exact per-game identity accounting, so the only
 * difference from selectConfirmedHrProps is that lineupStatus/confirmation is
 * never consulted -- no ranking or threshold changes.
 *
 * A row is excluded only when it cannot be shown truthfully: no player name,
 * no usable price (a caption can never post a fabricated price), or a game
 * already under way.
 *
 * @param {object} params
 * @param {Array<object>} params.batters normalized HR rows
 * @param {(row:object)=>boolean} [params.isGameStarted]
 * @param {number} [params.maxTableSize]
 * @returns {{ selected: Array<object>, eligibleCount: number, eligibleGameCount: number,
 *             rowsWithoutGameIdentity: number, invalidExcludedCount: number, startedExcludedCount: number }}
 */
export function selectHrPropsAnyLineupStatus({ batters = [], isGameStarted = () => false, maxTableSize = DEFAULT_MAX_TABLE_SIZE } = {}) {
  let invalidExcludedCount = 0;
  let startedExcludedCount = 0;

  const eligible = [];
  for (const row of batters) {
    const hasPlayer = Boolean(String(row?.player ?? "").trim());
    const hasUsablePrice = /^[+-]\d+$/.test(String(row?.hrOddsYes ?? "").trim());
    if (!hasPlayer || !hasUsablePrice) {
      invalidExcludedCount += 1;
      continue;
    }
    if (isGameStarted(row)) {
      startedExcludedCount += 1;
      continue;
    }
    eligible.push(row);
  }

  eligible.sort(compareByHrScore);

  const gameIdentities = new Set();
  let rowsWithoutGameIdentity = 0;
  for (const row of eligible) {
    const identity = getConfirmedGameIdentity(row);
    if (identity == null) rowsWithoutGameIdentity += 1;
    else gameIdentities.add(identity);
  }

  return {
    selected: eligible.slice(0, maxTableSize),
    eligibleCount: eligible.length,
    eligibleGameCount: gameIdentities.size,
    rowsWithoutGameIdentity,
    invalidExcludedCount,
    startedExcludedCount,
  };
}
