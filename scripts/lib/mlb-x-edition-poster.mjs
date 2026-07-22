/**
 * Shared parameterized posting path for all four MLB X editions.
 *
 * One implementation, invoked by four independently visible jobs as
 * {market, edition}. The poster consumes the frozen plan and never reselects:
 * re-running selection here is precisely how the planner and poster diverged on
 * 2026-07-21, when the plan said READY and the poster then applied its own
 * stricter lineup rule and published nothing.
 *
 * Every external dependency is injected so the whole sequence is testable
 * without X, a browser, or a network.
 */
import {
  assertRowConsistency,
  loadPlanForTarget,
  PublicationStep,
  ReplyStatus,
} from "./mlb-x-edition-publication.mjs";
import { resolveEditionReadiness } from "./mlb-x-edition-readiness.mjs";
import { toReadinessImageInput } from "./mlb-x-image-bundle.mjs";

export const PostOutcome = Object.freeze({
  POSTED: "POSTED",
  FALLBACK_POSTED: "FALLBACK_POSTED",
  REPLY_RECOVERED: "REPLY_RECOVERED",
  ALREADY_POSTED: "ALREADY_POSTED",
  NOT_DUE: "NOT_DUE",
  MISSED_WINDOW: "MISSED_WINDOW",
  SKIPPED: "SKIPPED",
  LEASE_UNAVAILABLE: "LEASE_UNAVAILABLE",
  IMAGE_FAILED: "IMAGE_FAILED",
  ROW_MISMATCH: "ROW_MISMATCH",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  X_API_FAILED: "X_API_FAILED",
  DRY_RUN: "DRY_RUN",
});

const result = (outcome, extra = {}) => ({ outcome, calledX: false, primaryPostId: null, replyPostId: null, ...extra });

/**
 * @param {object} deps injected collaborators
 * @param {object} deps.target {market, edition, slateDate}
 * @param {string} deps.planDirectory directory holding the four frozen plans
 * @param {object} deps.stateStore git-backed authoritative receipts
 * @param {Function} deps.acquireLease per-edition in-process publication lease
 * @param {Function} deps.ensureImage returns a validated image bundle
 * @param {Function} deps.buildCaption (rows, languageMode) -> {caption, captionRows}
 * @param {Function} deps.postPrimary  ({caption, imagePath}) -> {postId}
 * @param {Function} deps.postReply    ({inReplyTo, rows}) -> {postId} | null
 * @param {boolean}  deps.dryRun
 */
export async function runEditionPost({
  target,
  planDirectory,
  stateStore,
  acquireLease,
  ensureImage,
  buildCaption,
  postPrimary,
  postReply = null,
  verifyAccount = async () => true,
  now = () => new Date().toISOString(),
  dryRun = false,
  liveConfig = {},
  log = () => {},
}) {
  const { market, edition, slateDate } = target;

  // ── 1. Frozen plan. No fallback to internal selection, ever. ─────────────
  const loaded = loadPlanForTarget({ directory: planDirectory, market, edition, slateDate });
  if (!loaded.ok) {
    return result(PostOutcome.CONFIGURATION_ERROR, { status: loaded.error, detail: loaded.detail, planPath: loaded.planPath });
  }
  const plan = loaded.plan;
  const receiptKey = plan.readiness.receiptKey;
  log(`plan loaded receiptKey=${receiptKey} rows=${plan.selectedRows.length} status=${plan.readiness.status}`);

  if (!plan.readiness.shouldRunPoster) {
    const map = { NOT_DUE: PostOutcome.NOT_DUE, MISSED_WINDOW: PostOutcome.MISSED_WINDOW, ALREADY_POSTED: PostOutcome.ALREADY_POSTED };
    return result(map[plan.readiness.status] ?? PostOutcome.SKIPPED, { status: plan.readiness.status, receiptKey });
  }

  // ── 2. Authoritative state, fetched fresh before anything is published ───
  stateStore.sync();

  // ── 3. Publication lease. Held across the whole publish sequence. ────────
  const lease = acquireLease(receiptKey);
  if (!lease.acquired) {
    return result(PostOutcome.LEASE_UNAVAILABLE, { receiptKey, heldBy: lease.heldBy ?? null });
  }

  try {
    // ── 4. Re-read receipt UNDER the lease. ───────────────────────────────
    const existing = stateStore.readReceipt({ slateDate, market, edition });
    const decided = decideStep(existing);

    if (decided === PublicationStep.ALREADY_COMPLETE) {
      return result(PostOutcome.ALREADY_POSTED, { receiptKey, primaryPostId: existing.primaryPostId ?? existing.postId });
    }

    // ── 5. Reply-only recovery: never a second primary post. ──────────────
    if (decided === PublicationStep.REPLY_RECOVERY_ONLY) {
      const primaryPostId = existing.primaryPostId ?? existing.postId;
      if (dryRun || !postReply) {
        return result(PostOutcome.DRY_RUN, { receiptKey, primaryPostId, status: "REPLY_RECOVERY_ONLY" });
      }
      return await attemptReply({ stateStore, target, receiptKey, existing, primaryPostId, plan, postReply, now, log });
    }

    // ── 6. Image bundle: reuse or render synchronously from frozen rows. ──
    const bundle = await ensureImage({ market, slateDate, rows: plan.selectedRows });
    if (!bundle?.valid) {
      return result(PostOutcome.IMAGE_FAILED, { receiptKey, status: bundle?.reason ?? "IMAGE_UNAVAILABLE" });
    }

    // ── 7. Caption from frozen rows + plan languageMode. ──────────────────
    // omittedRows are valid plan rows the caption's 280-char budget could not
    // fit -- see assertRowConsistency for why that is allowed, not a mismatch.
    const { caption, captionRows, omittedRows = [] } = await buildCaption({ rows: plan.selectedRows, languageMode: plan.readiness.languageMode, plan });

    // ── 8. Plan / caption / graphic must describe the same players. ───────
    const consistency = assertRowConsistency({
      planRows: plan.selectedRows,
      captionRows,
      omittedRows,
      renderedRows: bundle.renderedRows ?? plan.selectedRows,
    });
    if (!consistency.consistent) {
      return result(PostOutcome.ROW_MISMATCH, { receiptKey, status: "ROW_MISMATCH", detail: consistency.mismatches });
    }

    // ── 9. Volatile revalidation with the SAME frozen inputs. ─────────────
    // Lineup policy is not re-evaluated: the frozen selectedLineupStatus is
    // reused verbatim so a planner READY can never become a poster WAITING.
    const revalidated = resolveEditionReadiness({
      now: now(),
      slateDate,
      market,
      edition,
      firstGameTime: plan.firstGameTime,
      gamesScheduled: Math.max(1, plan.selectedLineupStatus.selectedGameCount || 1),
      artifactSlateDate: slateDate,
      validPicks: plan.selectedRows.length,
      selectedLineupStatus: edition === "confirmed"
        ? { total: plan.selectedLineupStatus.selectedPickCount, confirmed: plan.selectedLineupStatus.confirmedPickCount }
        : null,
      image: toReadinessImageInput(bundle),
      receipt: { exists: false, outcome: null, postId: null },
      ...liveConfig,
    });

    if (!revalidated.shouldPost) {
      const map = { MISSED_WINDOW: PostOutcome.MISSED_WINDOW, FIRST_GAME_STARTED: PostOutcome.MISSED_WINDOW, IMAGE_FAILED: PostOutcome.IMAGE_FAILED, CONFIGURATION_ERROR: PostOutcome.CONFIGURATION_ERROR };
      return result(map[revalidated.status] ?? PostOutcome.SKIPPED, { receiptKey, status: revalidated.status });
    }

    if (!(await verifyAccount())) {
      return result(PostOutcome.CONFIGURATION_ERROR, { receiptKey, status: "ACCOUNT_MISMATCH" });
    }

    if (dryRun) {
      return result(PostOutcome.DRY_RUN, { receiptKey, status: revalidated.status, caption, rows: plan.selectedRows.length });
    }

    // ── 10. One primary post. ─────────────────────────────────────────────
    let primary;
    try {
      primary = await postPrimary({ caption, imagePath: bundle.metadata.imagePath, plan });
    } catch (error) {
      return result(PostOutcome.X_API_FAILED, { receiptKey, calledX: true, status: "PRIMARY_FAILED", detail: error instanceof Error ? error.message : String(error) });
    }
    const primaryPostId = String(primary?.postId ?? "").trim();
    if (!primaryPostId) {
      return result(PostOutcome.X_API_FAILED, { receiptKey, calledX: true, status: "PRIMARY_NO_POST_ID" });
    }

    // ── 11. Persist BEFORE the reply, so a crash cannot duplicate it. ─────
    const receipt = {
      receiptKey, market, slateDate, edition,
      outcome: "POSTED",
      postId: primaryPostId,
      primaryPostId,
      primaryPostedAt: now(),
      languageMode: revalidated.languageMode,
      confirmationComplete: revalidated.confirmationComplete,
      replyStatus: postReply ? ReplyStatus.PENDING : ReplyStatus.NOT_REQUESTED,
      replyPostId: null,
      replyAttemptedAt: null,
      replyFailureReason: null,
    };
    stateStore.writeReceipt({ slateDate, market, edition, receipt });
    log(`primary posted postId=${primaryPostId} receipt pushed`);

    const posted = revalidated.status === "READY_TO_FALLBACK_POST" ? PostOutcome.FALLBACK_POSTED : PostOutcome.POSTED;
    if (!postReply) {
      return result(posted, { receiptKey, calledX: true, primaryPostId, status: revalidated.status });
    }

    // ── 12. Reply is a separate outcome; failure never undoes the primary. ─
    const replyResult = await attemptReply({ stateStore, target, receiptKey, existing: receipt, primaryPostId, plan, postReply, now, log });
    return result(posted, { receiptKey, calledX: true, primaryPostId, replyPostId: replyResult.replyPostId, replyStatus: replyResult.replyStatus, status: revalidated.status });
  } finally {
    lease.release();
  }
}

/** Publication step from an authoritative receipt (no local state dir). */
function decideStep(existing) {
  const primaryPostId = existing?.primaryPostId ?? existing?.postId;
  if (!primaryPostId || !String(primaryPostId).trim()) return PublicationStep.FULL_PUBLICATION;
  const status = existing.replyStatus ?? ReplyStatus.NOT_REQUESTED;
  const complete = status === ReplyStatus.POSTED || status === ReplyStatus.NOT_REQUESTED || status === ReplyStatus.FAILED_FINAL;
  return complete ? PublicationStep.ALREADY_COMPLETE : PublicationStep.REPLY_RECOVERY_ONLY;
}

async function attemptReply({ stateStore, target, receiptKey, existing, primaryPostId, plan, postReply, now, log }) {
  const { market, edition, slateDate } = target;
  const base = { ...existing, receiptKey, market, slateDate, edition, primaryPostId, postId: primaryPostId, outcome: "POSTED" };
  try {
    const reply = await postReply({ inReplyTo: primaryPostId, plan });
    const replyPostId = String(reply?.postId ?? "").trim();
    const receipt = replyPostId
      ? { ...base, replyStatus: ReplyStatus.POSTED, replyPostId, replyAttemptedAt: now(), replyFailureReason: null }
      : { ...base, replyStatus: ReplyStatus.FAILED_RETRYABLE, replyAttemptedAt: now(), replyFailureReason: "reply returned no post id" };
    stateStore.writeReceipt({ slateDate, market, edition, receipt });
    return { outcome: PostOutcome.REPLY_RECOVERED, replyPostId: replyPostId || null, replyStatus: receipt.replyStatus, primaryPostId };
  } catch (error) {
    // The primary stands. Only reply fields change.
    const receipt = {
      ...base,
      replyStatus: ReplyStatus.FAILED_RETRYABLE,
      replyAttemptedAt: now(),
      replyFailureReason: error instanceof Error ? error.message : String(error),
    };
    stateStore.writeReceipt({ slateDate, market, edition, receipt });
    log(`reply failed, primary ${primaryPostId} preserved`);
    return { outcome: PostOutcome.REPLY_RECOVERED, replyPostId: null, replyStatus: ReplyStatus.FAILED_RETRYABLE, primaryPostId };
  }
}
