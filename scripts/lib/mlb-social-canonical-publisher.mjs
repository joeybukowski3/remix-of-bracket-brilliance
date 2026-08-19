/**
 * mlb-social-canonical-publisher.mjs
 *
 * Phase 5 canonical publisher. Consumes ONE frozen `SocialPostPlan` (see
 * mlb-social-post-plan.mjs) and uses that same plan as the sole authority for
 * selected rows, row ordering, graphic, caption, rowFingerprint, and
 * publication identity. Nothing in this module reranks, reselects, rebuilds,
 * or independently chooses rows -- selection and composition happen entirely
 * upstream (mlb-social-composition.mjs), before a plan is ever handed to this
 * publisher.
 *
 * Publication identity is `plan.receiptKey` (`${product}:${slateDate}`, no
 * morning/confirmed axis -- see buildSocialPostPlan). A receipt already
 * recorded for that key blocks a later attempt for the same product/date
 * outright, REGARDLESS of rowFingerprint: a data change after the first
 * canonical post must never become an "update" tweet. rowFingerprint governs
 * only image content identity (whether an existing image bundle may be
 * reused), never whether a NEW primary post is allowed.
 *
 * Every external dependency is injected so the whole sequence is testable
 * without X, a browser, git, or a network -- mirroring runEditionPost's shape
 * (mlb-x-edition-poster.mjs) but with no morning/confirmed window
 * revalidation, since the canonical product has no such concept.
 */
import { hasPrimaryPost, isReplyComplete, PublicationStep, ReplyStatus } from "./mlb-x-edition-publication.mjs";
import { assertRowSubsetConsistency, planRowIdentity } from "./mlb-social-plan-consistency.mjs";

export const CanonicalPostOutcome = Object.freeze({
  POSTED: "POSTED",
  REPLY_RECOVERED: "REPLY_RECOVERED",
  ALREADY_POSTED: "ALREADY_POSTED",
  DRY_RUN: "DRY_RUN",
  NO_PLAN: "NO_PLAN",
  LEASE_UNAVAILABLE: "LEASE_UNAVAILABLE",
  IMAGE_FAILED: "IMAGE_FAILED",
  CONSISTENCY_FAILED: "CONSISTENCY_FAILED",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  X_API_FAILED: "X_API_FAILED",
});

const result = (outcome, extra = {}) => ({ outcome, calledX: false, primaryPostId: null, replyPostId: null, ...extra });

const SOCIAL_PRODUCTS = Object.freeze(["mlb-k-props", "mlb-hr-props"]);

/**
 * Structural validation of a frozen plan. Never re-derives or corrects
 * anything -- a plan that fails this is a CONFIGURATION_ERROR, not a
 * candidate for repair or fallback selection.
 */
export function validateFrozenSocialPlan(plan) {
  if (!plan || typeof plan !== "object") return { valid: false, reason: "PLAN_MISSING" };
  if (!SOCIAL_PRODUCTS.includes(plan.product)) return { valid: false, reason: "PLAN_UNKNOWN_PRODUCT" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.slateDate ?? ""))) return { valid: false, reason: "PLAN_INVALID_SLATE_DATE" };
  if (!Array.isArray(plan.rows) || plan.rows.length < 1 || plan.rows.length > 5) return { valid: false, reason: "PLAN_INVALID_ROW_COUNT" };
  if (typeof plan.rowFingerprint !== "string" || !plan.rowFingerprint) return { valid: false, reason: "PLAN_MISSING_ROW_FINGERPRINT" };
  if (plan.receiptKey !== `${plan.product}:${plan.slateDate}`) return { valid: false, reason: "PLAN_RECEIPT_KEY_MISMATCH" };
  return { valid: true, reason: null };
}

/**
 * Proves the caption and (when freshly rendered) the graphic for THIS run
 * describe the same frozen plan, in the same order. Unlike the graphic, a
 * REUSED image bundle has no captured rendered rows to check -- its content
 * safety was already proven by the rowFingerprint match at the image-bundle
 * layer before the bundle was ever reported reused (see
 * mlb-social-canonical-image.mjs / mlb-x-image-bundle.mjs), so passing plan
 * rows in place of the unknown rendered content would only compare the plan
 * to itself and could never catch a stale image -- this deliberately does not
 * do that. Throws on any mismatch; the caller turns that into
 * CONSISTENCY_FAILED.
 */
export function assertCanonicalConsistency({ plan, captionRows, renderedRows }) {
  assertRowSubsetConsistency(plan, (captionRows ?? []).map(planRowIdentity), { requireComplete: false, label: "caption" });
  if (renderedRows != null) {
    assertRowSubsetConsistency(plan, renderedRows.map((row) => `${row?.gameId ?? "null"}:${row?.playerId ?? "null"}`), { requireComplete: true, label: "graphic" });
  }
}

/** Publication step from an authoritative canonical receipt. Same semantics as the edition poster's decideStep. */
function decideStep(existing) {
  if (!hasPrimaryPost(existing)) return PublicationStep.FULL_PUBLICATION;
  return isReplyComplete(existing) ? PublicationStep.ALREADY_COMPLETE : PublicationStep.REPLY_RECOVERY_ONLY;
}

/**
 * @param {object} deps
 * @param {import("./mlb-social-post-plan.mjs").SocialPostPlan|null} deps.plan  the FROZEN plan; never mutated or re-derived
 * @param {boolean} [deps.liveMode]        resolved upstream from the real event/dispatch mode -- never computed here
 * @param {boolean} [deps.allowLivePost]   resolved X_ALLOW_LIVE_POST kill switch
 * @param {boolean} [deps.credentialsPresent]
 * @param {object} deps.stateStore  {sync, readCanonicalReceipt, writeCanonicalReceipt}
 * @param {Function} deps.acquireLease   (receiptKey) -> lease
 * @param {Function} deps.ensureImage    (plan) -> validated image bundle (rowFingerprint is plan.rowFingerprint, passed by the caller's wiring -- see mlb-social-canonical-image.mjs)
 * @param {Function} deps.buildCaption   (plan) -> {skipped, reason, caption, captionRows, omittedRows}
 * @param {Function} deps.postPrimary    ({caption, imagePath}) -> {postId}
 * @param {Function} [deps.postReply]    ({inReplyTo, plan}) -> {postId} | null
 *        Injected closure decides for itself (from `plan`) whether anything
 *        was omitted and needs a reply -- returns null when nothing was
 *        omitted, exactly like the edition poster's replyBuilderForMarket in
 *        post-mlb-x-edition.mjs. Recomputing from `plan` (pure, cheap) rather
 *        than threading omittedRows through this interface is what lets the
 *        same closure serve both the normal post-then-reply path and
 *        reply-only recovery, where only `plan` exists.
 * @param {Function} [deps.verifyAccount]
 * @param {Function} [deps.now]
 * @param {boolean} [deps.dryRun]
 * @param {Function} [deps.log]
 */
export async function publishCanonicalSocialPost({
  plan,
  liveMode = false,
  allowLivePost = false,
  credentialsPresent = false,
  stateStore,
  acquireLease,
  ensureImage,
  buildCaption,
  postPrimary,
  postReply = null,
  verifyAccount = async () => true,
  now = () => new Date().toISOString(),
  dryRun = false,
  log = () => {},
}) {
  // ── 0. No plan -> nothing to publish. Composition already enforced the
  // 0-1 qualified-row "no canonical post" rule; this is a defensive floor,
  // not a place that re-applies display-count policy. ──────────────────────
  if (!plan) return result(CanonicalPostOutcome.NO_PLAN);

  // ── 1. Frozen-plan validation. No fallback, no repair. ────────────────────
  const validation = validateFrozenSocialPlan(plan);
  if (!validation.valid) return result(CanonicalPostOutcome.CONFIGURATION_ERROR, { status: validation.reason });

  const { product, slateDate, receiptKey } = plan;
  log(`plan loaded receiptKey=${receiptKey} rows=${plan.rows.length} rowFingerprint=${plan.rowFingerprint}`);

  // ── 2. Authoritative state, fetched fresh before anything is published. ──
  stateStore.sync();

  // ── 3. Publication lease, keyed by product:slateDate. ─────────────────────
  const lease = acquireLease(receiptKey);
  if (!lease.acquired) return result(CanonicalPostOutcome.LEASE_UNAVAILABLE, { receiptKey, heldBy: lease.heldBy ?? null });

  try {
    // ── 4. Re-read receipt UNDER the lease. One-post guarantee: keyed by
    // receiptKey alone, never by rowFingerprint -- a later plan for the same
    // product/date is ALREADY_POSTED no matter what changed. ────────────────
    const existing = stateStore.readCanonicalReceipt({ slateDate, product });
    const decided = decideStep(existing);

    if (decided === PublicationStep.ALREADY_COMPLETE) {
      return result(CanonicalPostOutcome.ALREADY_POSTED, { receiptKey, primaryPostId: existing.primaryPostId ?? existing.postId });
    }

    if (decided === PublicationStep.REPLY_RECOVERY_ONLY) {
      const primaryPostId = existing.primaryPostId ?? existing.postId;
      if (dryRun || !postReply) {
        return result(CanonicalPostOutcome.DRY_RUN, { receiptKey, primaryPostId, status: "REPLY_RECOVERY_ONLY" });
      }
      const recovered = await attemptReply({ stateStore, product, slateDate, receiptKey, existing, primaryPostId, plan, postReply, now, log });
      return result(CanonicalPostOutcome.REPLY_RECOVERED, { receiptKey, calledX: true, ...recovered });
    }

    // ── 5. Canonical image bundle: reuse or render, gated on plan.rowFingerprint. ──
    const bundle = await ensureImage(plan);
    if (!bundle?.valid) return result(CanonicalPostOutcome.IMAGE_FAILED, { receiptKey, status: bundle?.reason ?? "IMAGE_UNAVAILABLE" });

    // ── 6. Canonical caption, from the SAME frozen plan. ───────────────────
    const captionResult = await buildCaption(plan);
    if (captionResult.skipped) {
      return result(CanonicalPostOutcome.CONFIGURATION_ERROR, { receiptKey, status: "CAPTION_SKIPPED", detail: captionResult.reason });
    }
    const { caption, captionRows, omittedRows = [] } = captionResult;

    // ── 7. Graphic/caption/plan consistency. Blocks publication on any mismatch. ──
    try {
      assertCanonicalConsistency({ plan, captionRows, renderedRows: bundle.source === "rendered" ? bundle.renderedRows : null });
    } catch (error) {
      return result(CanonicalPostOutcome.CONSISTENCY_FAILED, { receiptKey, status: "CONSISTENCY_FAILED", detail: error instanceof Error ? error.message : String(error) });
    }

    const imagePath = bundle.metadata?.imagePath ?? bundle.paths?.pngPath ?? null;

    if (dryRun) {
      return result(CanonicalPostOutcome.DRY_RUN, {
        receiptKey, status: "DRY_RUN", caption, rows: plan.rows.length,
        rowFingerprint: plan.rowFingerprint, imagePath, imageSource: bundle.source,
      });
    }

    // ── 8. Live gating: defensive, independent of the dryRun flag itself. ──
    if (!liveMode || !allowLivePost || !credentialsPresent) {
      return result(CanonicalPostOutcome.CONFIGURATION_ERROR, {
        receiptKey, status: "LIVE_POSTING_NOT_PERMITTED",
        detail: { liveMode, allowLivePost, credentialsPresent },
      });
    }

    if (!(await verifyAccount())) {
      return result(CanonicalPostOutcome.CONFIGURATION_ERROR, { receiptKey, status: "ACCOUNT_MISMATCH" });
    }

    // ── 9. One primary post. ────────────────────────────────────────────────
    let primary;
    try {
      primary = await postPrimary({ caption, imagePath, plan });
    } catch (error) {
      return result(CanonicalPostOutcome.X_API_FAILED, { receiptKey, calledX: true, status: "PRIMARY_FAILED", detail: error instanceof Error ? error.message : String(error) });
    }
    const primaryPostId = String(primary?.postId ?? "").trim();
    if (!primaryPostId) {
      return result(CanonicalPostOutcome.X_API_FAILED, { receiptKey, calledX: true, status: "PRIMARY_NO_POST_ID" });
    }

    // ── 10. Persist BEFORE the reply, so a crash cannot duplicate the primary. ──
    const receipt = {
      receiptKey, product, slateDate,
      outcome: "POSTED",
      postId: primaryPostId,
      primaryPostId,
      primaryPostedAt: now(),
      rowFingerprint: plan.rowFingerprint,
      replyStatus: postReply ? ReplyStatus.PENDING : ReplyStatus.NOT_REQUESTED,
      replyPostId: null,
      replyAttemptedAt: null,
      replyFailureReason: null,
    };
    stateStore.writeCanonicalReceipt({ slateDate, product, receipt });
    log(`primary posted postId=${primaryPostId} receipt pushed`);

    if (!postReply) return result(CanonicalPostOutcome.POSTED, { receiptKey, calledX: true, primaryPostId });

    // ── 11. Reply is a separate outcome; failure never undoes the primary. ──
    const replyResult = await attemptReply({ stateStore, product, slateDate, receiptKey, existing: receipt, primaryPostId, plan, postReply, now, log });
    return result(CanonicalPostOutcome.POSTED, { receiptKey, calledX: true, primaryPostId, replyPostId: replyResult.replyPostId, replyStatus: replyResult.replyStatus });
  } finally {
    lease.release();
  }
}

async function attemptReply({ stateStore, product, slateDate, receiptKey, existing, primaryPostId, plan, postReply, now, log }) {
  const base = { ...existing, receiptKey, product, slateDate, primaryPostId, postId: primaryPostId, outcome: "POSTED" };
  try {
    const reply = await postReply({ inReplyTo: primaryPostId, plan });
    if (!reply) {
      // Nothing was omitted -- no reply was ever wanted, not a failure.
      const receipt = { ...base, replyStatus: ReplyStatus.NOT_REQUESTED };
      stateStore.writeCanonicalReceipt({ slateDate, product, receipt });
      return { replyPostId: null, replyStatus: ReplyStatus.NOT_REQUESTED, primaryPostId };
    }
    const replyPostId = String(reply?.postId ?? "").trim();
    const receipt = replyPostId
      ? { ...base, replyStatus: ReplyStatus.POSTED, replyPostId, replyAttemptedAt: now(), replyFailureReason: null }
      : { ...base, replyStatus: ReplyStatus.FAILED_RETRYABLE, replyAttemptedAt: now(), replyFailureReason: "reply returned no post id" };
    stateStore.writeCanonicalReceipt({ slateDate, product, receipt });
    return { replyPostId: replyPostId || null, replyStatus: receipt.replyStatus, primaryPostId };
  } catch (error) {
    const receipt = {
      ...base,
      replyStatus: ReplyStatus.FAILED_RETRYABLE,
      replyAttemptedAt: now(),
      replyFailureReason: error instanceof Error ? error.message : String(error),
    };
    stateStore.writeCanonicalReceipt({ slateDate, product, receipt });
    log(`reply failed, primary ${primaryPostId} preserved`);
    return { replyPostId: null, replyStatus: ReplyStatus.FAILED_RETRYABLE, primaryPostId };
  }
}
