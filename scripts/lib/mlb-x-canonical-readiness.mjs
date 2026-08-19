/**
 * mlb-x-canonical-readiness.mjs
 *
 * Phase 6. ONE public readiness vocabulary for the canonical publisher:
 *
 *   NOT_READY / NO_POST_YET   -- keep evaluating on a future run: this slate
 *                                may still resolve (more confirmations may
 *                                land, a currently-unsafe row may drop out
 *                                of a later plan) -- never a give-up signal
 *   READY_TO_PUBLISH          -- publish this exact frozen plan now
 *   ALREADY_PUBLISHED         -- receipt says done (or primary posted, reply
 *                                pending recovery-only); never post again
 *   NO_POST_FOR_SLATE         -- terminal: the slate itself has genuinely
 *                                closed (Phase 2's isExpired/allGamesStarted)
 *                                with no publication; never revisited
 *
 * "morning"/"confirmed"/"update"/"late" never appear here. Internally the
 * legacy edition system (mlb-x-edition-readiness.mjs) still uses those
 * concepts to decide WHEN to acquire data for its own scheduled path -- this
 * module is deliberately independent of it and only consumes:
 *   - a candidate SocialPostPlan (or null), already built+capped by
 *     composeSocialPostPlan (mlb-social-composition.mjs) -- this module never
 *     builds, reranks, or resizes a plan itself.
 *   - the canonical receipt for `${product}:${slateDate}` (Phase 5's
 *     receiptKey -- no edition axis).
 *   - pendingConfirmationCount, the authoritative "how many otherwise-
 *     eligible candidates are still awaiting confirmation" count from the
 *     analytic selection layer (see deriveConfirmationCompleteness) -- NEVER
 *     plan.rows.length. The display cap (DISPLAY_MAX_ROWS = 5) governs what
 *     the card looks like, not whether the underlying data is done
 *     confirming: a 2-row plan with nothing left pending is exactly as ready
 *     as a 5-row one, and a full 5-row table with confirmations still
 *     outstanding is not.
 *   - a slate-timing snapshot from Phase 2's computeSlateTiming
 *     (mlb-x-slate-timing.mjs), consulted ONLY for the terminal
 *     isExpired/allGamesStarted backstop -- never as a "post best available
 *     at cutoff" override for incomplete confirmation.
 *
 * Pure: no clock read, no I/O, no network. `now` is caller-supplied.
 */

import { hasPrimaryPost, isReplyComplete } from "./mlb-x-edition-publication.mjs";
import { FINAL_CUTOFF_MINUTES } from "./mlb-x-slate-timing.mjs";

export const CanonicalReadinessStatus = Object.freeze({
  NO_POST_YET: "NO_POST_YET",
  READY_TO_PUBLISH: "READY_TO_PUBLISH",
  ALREADY_PUBLISHED: "ALREADY_PUBLISHED",
  NO_POST_FOR_SLATE: "NO_POST_FOR_SLATE",
});

export const CanonicalReceiptState = Object.freeze({
  NOT_PUBLISHED: "NOT_PUBLISHED",
  PRIMARY_PUBLISHED_REPLY_PENDING: "PRIMARY_PUBLISHED_REPLY_PENDING",
  FULLY_PUBLISHED: "FULLY_PUBLISHED",
});

/**
 * Cheap, receipt-only classification -- no plan, no acquisition, no
 * rendering. Reuses the exact same primary/reply predicates the edition
 * poster and the canonical publisher already use, so this can never drift
 * from what publishCanonicalSocialPost itself will decide.
 */
export function classifyCanonicalReceipt(existingReceipt) {
  if (!hasPrimaryPost(existingReceipt)) return CanonicalReceiptState.NOT_PUBLISHED;
  return isReplyComplete(existingReceipt)
    ? CanonicalReceiptState.FULLY_PUBLISHED
    : CanonicalReceiptState.PRIMARY_PUBLISHED_REPLY_PENDING;
}

/**
 * Minutes before a row's own scheduled first pitch that publication is no
 * longer safe for that row. Reuses the repo-wide FINAL_CUTOFF_MINUTES (40)
 * hard-stop from mlb-x-slate-timing.mjs -- the same "too close to first pitch"
 * bound HR/K/Numerology already use -- rather than inventing a second cutoff
 * constant with a different value.
 */
export const ROW_SAFE_PREGAME_MINUTES = FINAL_CUTOFF_MINUTES;

/**
 * Per-row pregame safety over an already-frozen plan's rows. Doubleheader-safe
 * and early-game-safe by construction: each row carries its OWN gameStartTime
 * (see PostRow / toPostRow in mlb-social-composition.mjs), so a G1 leg that
 * already started blocks the plan even when G2 or the rest of the slate is
 * still hours out, and a normal early game blocks the plan even when the
 * "rest of the slate" is still in the afternoon.
 *
 * Fails closed: a row with no parseable gameStartTime is treated as unsafe,
 * never as "assume fine."
 */
export function evaluateRowTimingSafety(rows, now) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  for (const row of rows ?? []) {
    const startMs = row?.gameStartTime ? new Date(row.gameStartTime).getTime() : Number.NaN;
    if (!Number.isFinite(startMs)) {
      return { safe: false, reason: "MISSING_GAME_START_TIME", row };
    }
    const minutesUntilStart = (startMs - nowMs) / 60_000;
    if (minutesUntilStart <= 0) {
      return { safe: false, reason: "GAME_ALREADY_STARTED", row, minutesUntilStart };
    }
    if (minutesUntilStart < ROW_SAFE_PREGAME_MINUTES) {
      return { safe: false, reason: "PAST_SAFE_PREGAME_WINDOW", row, minutesUntilStart };
    }
  }
  return { safe: true, reason: null };
}

/** Earliest gameStartTime among a plan's rows, or null when none is known. */
export function earliestIncludedGameStart(rows) {
  const times = (rows ?? [])
    .map((row) => row?.gameStartTime)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!times.length) return null;
  return new Date(Math.min(...times)).toISOString();
}

/**
 * Whether the underlying DATA is confirmation-complete enough to publish
 * right now -- derived ONLY from the authoritative count of candidates still
 * awaiting confirmation (`pendingConfirmationCount`, sourced from the
 * analytic selection layer: HR's `projectedExcludedCount` / K's
 * `heldForOpposingCount` -- see getHrCandidatePoolWithPendingConfirmation /
 * getKCandidatePoolWithPendingConfirmation in mlb-social-composition.mjs).
 *
 * Deliberately NEVER derived from how many rows happen to be in the
 * display-capped plan and NEVER from a clock time alone: DISPLAY_MAX_ROWS
 * (5) is a rendering cap, not a readiness signal, and "final cutoff" is a
 * terminal-adjacent timing fact, not evidence the data itself is done
 * confirming. A 2-row plan with zero pending confirmations is exactly as
 * "complete" as a 5-row one; a 5-row plan with pending confirmations still
 * outstanding is NOT complete just because the table happens to be full.
 *
 * Complete only when pendingConfirmationCount is authoritatively known to be
 * zero. Unknown (null/undefined -- the caller could not determine it) is
 * treated the same as "still pending": never assumed complete merely because
 * it wasn't reported. There is no clock-based override here; once nothing
 * more can safely be confirmed the terminal slate condition (see
 * isSlateTerminallyExpired) is what stops evaluation, not a "post the best
 * available at cutoff" fallback.
 */
export function deriveConfirmationCompleteness({ pendingConfirmationCount = null } = {}) {
  if (pendingConfirmationCount === 0) return { complete: true, reason: "NO_PENDING_CONFIRMATIONS" };
  if (pendingConfirmationCount == null) return { complete: false, reason: "CONFIRMATION_STATE_UNKNOWN" };
  return { complete: false, reason: "WAITING_FOR_PENDING_CONFIRMATIONS" };
}

/**
 * Terminal "give up on this slate" signal, reused as-is from Phase 2's
 * computeSlateTiming rather than a new midnight/arbitrary rule:
 *   - isExpired: past the slate-wide FINAL_CUTOFF_MINUTES bound for the
 *     earliest scheduled game.
 *   - allGamesStarted: every usable game today is already underway/final.
 * Either one means no future evaluation this slate can still produce a safe
 * public post, so the terminal NO_POST_FOR_SLATE result is never revisited.
 */
export function isSlateTerminallyExpired(slateTiming) {
  return Boolean(slateTiming?.isExpired || slateTiming?.allGamesStarted);
}

const baseResult = ({
  status, product, slateDate, receiptState, reason,
  qualifiedRowCount = 0, earliestIncludedGameStart: earliest = null,
  publicationCutoff = null, shouldBuildPlan = false, shouldCallX = false, plan = null,
}) => ({
  status, product, slateDate, receiptState, reason,
  qualifiedRowCount, earliestIncludedGameStart: earliest, publicationCutoff,
  shouldBuildPlan, shouldCallX, plan,
});

/**
 * The single public entry point. Composes the receipt-first check, the
 * qualification/confirmation check, and the per-row pregame-safety check into
 * one of exactly four public statuses. Never builds, rebuilds, or reranks a
 * plan -- `plan` (already frozen by the caller via composeSocialPostPlan) is
 * either used unchanged or not used at all.
 *
 * @param {object} params
 * @param {"mlb-k-props"|"mlb-hr-props"} params.product
 * @param {string} params.slateDate
 * @param {object|null} [params.existingReceipt]  result of stateStore.readCanonicalReceipt
 * @param {import("./mlb-social-post-plan.mjs").SocialPostPlan|null} [params.plan]
 * @param {number|null} [params.pendingConfirmationCount]  authoritative count of
 *        still-unconfirmed candidates from the analytic selection layer (HR's
 *        projectedExcludedCount / K's heldForOpposingCount) -- see
 *        deriveConfirmationCompleteness. null/undefined means unknown, never
 *        treated as zero.
 * @param {object|null} [params.slateTiming]  result of computeSlateTiming/fetchSlateTiming (mlb-x-slate-timing.mjs)
 * @param {Date|number} [params.now]
 */
export function evaluateCanonicalPublication({
  product,
  slateDate,
  existingReceipt = null,
  plan = null,
  pendingConfirmationCount = null,
  slateTiming = null,
  now = new Date(),
}) {
  // ── 1. Receipt-first. No plan/timing inspection at all once published -- ──
  // this is what lets a workflow call this repeatedly all day for free once
  // a slate is done, and what guarantees a data change (rowFingerprint drift)
  // after publication can never produce a second primary.
  const receiptState = classifyCanonicalReceipt(existingReceipt);

  if (receiptState === CanonicalReceiptState.FULLY_PUBLISHED) {
    return baseResult({
      status: CanonicalReadinessStatus.ALREADY_PUBLISHED,
      product, slateDate, receiptState,
      reason: "PRIMARY_AND_REPLY_COMPLETE",
    });
  }

  if (receiptState === CanonicalReceiptState.PRIMARY_PUBLISHED_REPLY_PENDING) {
    // Not a new primary opportunity -- only reply recovery is permitted, and
    // the caller does that from the existing receipt, never from `plan`.
    return baseResult({
      status: CanonicalReadinessStatus.ALREADY_PUBLISHED,
      product, slateDate, receiptState,
      reason: "PRIMARY_PUBLISHED_REPLY_PENDING_RECOVERY_ONLY",
      shouldCallX: true,
    });
  }

  const qualifiedRowCount = plan?.rows?.length ?? 0;
  const earliest = plan ? earliestIncludedGameStart(plan.rows) : null;
  const cutoff = slateTiming?.finalCutoffAt ?? null;

  // ── 2. Terminal slate condition, checked before any granular readiness ────
  // signal and unconditionally on top -- once true it wins outright,
  // regardless of plan/confirmation/timing state, so no evaluation can ever
  // sneak a post out after the slate has genuinely closed. Everything below
  // this point is reachable ONLY when the slate is still genuinely live, so
  // every insufficiency below is "not yet" (worth another look later), never
  // "give up" -- that distinction is what stops a temporary data gap (a
  // missing gameStartTime, an unconfirmed lineup) from permanently
  // abandoning a slate that could still resolve on a later run.
  if (isSlateTerminallyExpired(slateTiming)) {
    return baseResult({
      status: CanonicalReadinessStatus.NO_POST_FOR_SLATE,
      product, slateDate, receiptState,
      reason: "SLATE_TERMINALLY_EXPIRED",
      qualifiedRowCount, earliestIncludedGameStart: earliest, publicationCutoff: cutoff,
    });
  }

  // ── 3. Fewer than DISPLAY_MIN_ROWS (2) qualified, distinct opportunities. ──
  // composeSocialPostPlan already enforces this floor and returns null below
  // it; this module never re-derives or second-guesses that decision.
  if (!plan) {
    return baseResult({
      status: CanonicalReadinessStatus.NO_POST_YET,
      product, slateDate, receiptState,
      reason: "NO_QUALIFIED_PLAN",
      qualifiedRowCount: 0, earliestIncludedGameStart: null, publicationCutoff: cutoff,
    });
  }

  // ── 4. Actual required confirmation/data completeness. See
  // deriveConfirmationCompleteness -- never a row-count or clock-time proxy. ─
  const completeness = deriveConfirmationCompleteness({ pendingConfirmationCount });
  if (!completeness.complete) {
    return baseResult({
      status: CanonicalReadinessStatus.NO_POST_YET,
      product, slateDate, receiptState,
      reason: completeness.reason,
      qualifiedRowCount, earliestIncludedGameStart: earliest, publicationCutoff: cutoff,
    });
  }

  // ── 5. Per-row pregame safety. Doubleheader/early-game safe (see above). ──
  // Not terminal by itself: the slate isn't terminally expired (checked in
  // step 2), so a future evaluation built from fresh data -- which the
  // upstream analytic selection layer already excludes started games from --
  // may still safely produce a ready plan without this specific row in it.
  const timingSafety = evaluateRowTimingSafety(plan.rows, now);
  if (!timingSafety.safe) {
    return baseResult({
      status: CanonicalReadinessStatus.NO_POST_YET,
      product, slateDate, receiptState,
      reason: timingSafety.reason,
      qualifiedRowCount, earliestIncludedGameStart: earliest, publicationCutoff: cutoff,
    });
  }

  // ── 6. Ready. The exact plan handed in is the plan to freeze and publish --
  // never rebuilt or reranked here or by the caller after this point. ───────
  return baseResult({
    status: CanonicalReadinessStatus.READY_TO_PUBLISH,
    product, slateDate, receiptState,
    reason: "QUALIFIED_DATA_COMPLETE_AND_SAFE",
    qualifiedRowCount, earliestIncludedGameStart: earliest, publicationCutoff: cutoff,
    shouldBuildPlan: true, shouldCallX: true, plan,
  });
}
