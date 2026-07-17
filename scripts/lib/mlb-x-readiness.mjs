/**
 * mlb-x-readiness.mjs
 *
 * Shared posting-readiness decision for every MLB X content type. Combines
 * the slate-timing phase (mlb-x-slate-timing.mjs) with confirmed-selection
 * counts (mlb-x-confirmation.mjs) into ONE machine-readable result and ONE
 * vocabulary of final statuses, so HR / K / Numerology all log and branch
 * identically.
 *
 * Pure and side-effect-free: it decides *whether* to post and *why*; the
 * caller performs the actual post, screenshot, and lock write. Fails closed
 * -- a confirmation-source failure, no games, all games started, or being
 * past the cutoff all resolve to a non-ready status, never a post.
 */

export const ReadinessStatus = {
  READY_CONFIRMED_SELECTIONS: "READY_CONFIRMED_SELECTIONS",
  WAITING_FOR_POLLING_WINDOW: "WAITING_FOR_POLLING_WINDOW",
  WAITING_FOR_LINEUPS: "WAITING_FOR_LINEUPS",
  WAITING_FOR_OPPOSING_LINEUP: "WAITING_FOR_OPPOSING_LINEUP",
  WAITING_FOR_VALID_MARKETS: "WAITING_FOR_VALID_MARKETS",
  SKIPPED_NO_CONFIRMED_SELECTIONS: "SKIPPED_NO_CONFIRMED_SELECTIONS",
  SKIPPED_NO_GAMES: "SKIPPED_NO_GAMES",
  SKIPPED_ALL_GAMES_STARTED: "SKIPPED_ALL_GAMES_STARTED",
  SKIPPED_AFTER_CUTOFF: "SKIPPED_AFTER_CUTOFF",
  SKIPPED_ALREADY_POSTED_TODAY: "SKIPPED_ALREADY_POSTED_TODAY",
  FAILED_CONFIRMATION_SOURCE: "FAILED_CONFIRMATION_SOURCE",
  POSTED: "POSTED",
};

/** Reason hint used while still waiting inside the posting window but short of the preferred table size. */
export const WaitingReason = {
  LINEUPS: "LINEUPS",
  OPPOSING_LINEUP: "OPPOSING_LINEUP",
  VALID_MARKETS: "VALID_MARKETS",
};

function waitingStatusFor(reason) {
  if (reason === WaitingReason.OPPOSING_LINEUP) return ReadinessStatus.WAITING_FOR_OPPOSING_LINEUP;
  if (reason === WaitingReason.VALID_MARKETS) return ReadinessStatus.WAITING_FOR_VALID_MARKETS;
  return ReadinessStatus.WAITING_FOR_LINEUPS;
}

/**
 * @param {object} params
 * @param {object} params.timing            result from computeSlateTiming / fetchSlateTiming
 * @param {number} params.confirmedCount    X-eligible confirmed selections currently available
 * @param {number} [params.targetCount]     preferred table size to publish "early" (default 3)
 * @param {number} [params.maxTableSize]    upper bound on rows to post (default targetCount)
 * @param {number} [params.projectedExcludedCount] count of projected/unconfirmed rows filtered out (reporting only)
 * @param {boolean} [params.alreadyPosted]  today's slate already has a post receipt
 * @param {boolean} [params.confirmationSourceFailed] the confirmation data source could not be verified
 * @param {string} [params.waitingReason]   WaitingReason.* to use when short of target before cutoff
 * @param {number} [params.confirmedGameCount] distinct games represented in the confirmed pool (default
 *                                              Infinity -- a no-op for callers with no game-diversity concept,
 *                                              e.g. K/Numerology's single-signal readiness checks)
 * @param {number} [params.minConfirmedGames]  minimum distinct games required before a full-count table is
 *                                              treated as "ready early" (default 1 -- no additional
 *                                              requirement). Prevents an early-confirmed single game from
 *                                              alone satisfying readiness and monopolizing the table with
 *                                              one matchup's hitters; still overridden by the final cutoff
 *                                              below, which posts whatever is confirmed rather than miss the
 *                                              window entirely.
 */
export function resolvePostingReadiness({
  timing,
  confirmedCount = 0,
  targetCount = 3,
  maxTableSize,
  projectedExcludedCount = 0,
  alreadyPosted = false,
  confirmationSourceFailed = false,
  waitingReason = WaitingReason.LINEUPS,
  confirmedGameCount = Infinity,
  minConfirmedGames = 1,
} = {}) {
  const cap = Number.isFinite(maxTableSize) ? maxTableSize : targetCount;
  const minutesUntilFirstPitch = timing?.minutesUntilFirstPitch ?? null;
  const phase = timing?.phase ?? "NO_GAMES";

  const result = (finalStatus, ready, selectedCount = 0) => ({
    ready,
    finalStatus,
    phase,
    eligibleCount: confirmedCount,
    confirmedCount,
    selectedCount,
    projectedExcludedCount,
    minutesUntilFirstPitch,
  });

  // Fail-closed guards first -- order matters.
  if (alreadyPosted) return result(ReadinessStatus.SKIPPED_ALREADY_POSTED_TODAY, false);
  if (confirmationSourceFailed) return result(ReadinessStatus.FAILED_CONFIRMATION_SOURCE, false);
  if (!timing?.hasGames) return result(ReadinessStatus.SKIPPED_NO_GAMES, false);
  if (timing.allGamesStarted) return result(ReadinessStatus.SKIPPED_ALL_GAMES_STARTED, false);
  if (phase === "PRE_POLLING") return result(ReadinessStatus.WAITING_FOR_POLLING_WINDOW, false);
  if (timing.isExpired) return result(ReadinessStatus.SKIPPED_AFTER_CUTOFF, false);

  // In a posting window (POLLING / PREFERRED / FINAL_CUTOFF).
  const atCutoff = Boolean(timing.isFinalCutoff);

  if (confirmedCount <= 0) {
    // Nothing confirmed yet. Keep waiting until the cutoff, then skip cleanly.
    if (atCutoff) return result(ReadinessStatus.SKIPPED_NO_CONFIRMED_SELECTIONS, false);
    return result(waitingStatusFor(waitingReason), false);
  }

  // We have confirmed selections. Publish immediately once we have a full
  // table AND enough game diversity, or at the final cutoff post whatever
  // confirmed rows we have regardless of diversity (smaller table allowed --
  // never padded with projected players, and never silently skip the
  // window just because only one game posted first).
  const hasFullTable = confirmedCount >= targetCount && confirmedGameCount >= minConfirmedGames;
  if (hasFullTable || atCutoff) {
    return result(ReadinessStatus.READY_CONFIRMED_SELECTIONS, true, Math.min(confirmedCount, cap));
  }

  // Some confirmed rows, but short of the preferred table size and not yet at
  // the cutoff -- keep waiting for more confirmations / opposing lineup / markets.
  return result(waitingStatusFor(waitingReason), false);
}
