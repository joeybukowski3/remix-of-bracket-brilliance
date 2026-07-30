/**
 * Publication sequence for the combined MLB Daily Model Card.
 *
 * A deliberately smaller sibling of runEditionPost (mlb-x-edition-poster.mjs):
 * there is no frozen per-market plan to reload, no image bundle to render
 * synchronously (the card was already generated and validated by the
 * caller -- see mlb-x-daily-card-publication.mjs), no reply, and no
 * row-consistency check, because the caption is a fixed template rather than
 * a rendering of the same selected rows. What is reused verbatim is the
 * safety shape every other MLB X publication follows: sync state under a
 * lease, re-read the receipt UNDER that lease immediately before posting,
 * skip safely if already posted, and never write a receipt unless X actually
 * confirmed the post.
 */
import { isPostedReceipt } from "./mlb-x-edition-receipts.mjs";

export const DailyCardPostOutcome = Object.freeze({
  POSTED: "POSTED",
  ALREADY_POSTED: "ALREADY_POSTED",
  LEASE_UNAVAILABLE: "LEASE_UNAVAILABLE",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  X_API_FAILED: "X_API_FAILED",
  DRY_RUN: "DRY_RUN",
});

const result = (outcome, extra = {}) => ({ outcome, calledX: false, primaryPostId: null, ...extra });

/**
 * @param {object} deps injected collaborators
 * @param {string} deps.receiptKey stable per-slate publication key (dailyCardReceiptKeyFor)
 * @param {string} deps.slateDate
 * @param {string} deps.target daily-card publication target, e.g. "daily-card-morning"
 * @param {string} deps.imagePath already-validated PNG path (assertCardPublishable ran first)
 * @param {() => string} deps.buildCaption returns the fixed caption for this slate
 * @param {object} deps.stateStore {sync, readReceipt({slateDate,target}), writeReceipt({slateDate,target,receipt})}
 * @param {(receiptKey: string) => object} deps.acquireLease
 * @param {Function} deps.postPrimary ({caption, imagePath}) -> {postId}
 * @param {() => Promise<boolean>} [deps.verifyAccount]
 * @param {boolean} [deps.dryRun]
 */
export async function runDailyCardPost({
  receiptKey,
  slateDate,
  target,
  imagePath,
  buildCaption,
  stateStore,
  acquireLease,
  postPrimary,
  verifyAccount = async () => true,
  now = () => new Date().toISOString(),
  dryRun = false,
  log = () => {},
}) {
  stateStore.sync();

  const lease = acquireLease(receiptKey);
  if (!lease.acquired) {
    return result(DailyCardPostOutcome.LEASE_UNAVAILABLE, { receiptKey, heldBy: lease.heldBy ?? null });
  }

  try {
    // Re-read UNDER the lease -- a queued duplicate run must see whatever the
    // winner of the race already published, not a stale pre-lease read.
    const existing = stateStore.readReceipt({ slateDate, target });
    if (isPostedReceipt(existing)) {
      return result(DailyCardPostOutcome.ALREADY_POSTED, { receiptKey, primaryPostId: existing.primaryPostId ?? existing.postId });
    }

    if (!(await verifyAccount())) {
      return result(DailyCardPostOutcome.CONFIGURATION_ERROR, { receiptKey, status: "ACCOUNT_MISMATCH" });
    }

    const caption = buildCaption();

    if (dryRun) {
      return result(DailyCardPostOutcome.DRY_RUN, { receiptKey, caption });
    }

    let primary;
    try {
      primary = await postPrimary({ caption, imagePath });
    } catch (error) {
      return result(DailyCardPostOutcome.X_API_FAILED, { receiptKey, calledX: true, status: "PRIMARY_FAILED", detail: error instanceof Error ? error.message : String(error) });
    }
    const primaryPostId = String(primary?.postId ?? "").trim();
    if (!primaryPostId) {
      return result(DailyCardPostOutcome.X_API_FAILED, { receiptKey, calledX: true, status: "PRIMARY_NO_POST_ID" });
    }

    // Persisted only after X confirms the post -- a media-upload success
    // followed by a post failure never reaches this line, so it can never
    // produce a false successful receipt.
    const receipt = {
      receiptKey, target, slateDate,
      outcome: "POSTED",
      postId: primaryPostId,
      primaryPostId,
      primaryPostedAt: now(),
    };
    stateStore.writeReceipt({ slateDate, target, receipt });
    log(`primary posted postId=${primaryPostId} receipt pushed`);

    return result(DailyCardPostOutcome.POSTED, { receiptKey, calledX: true, primaryPostId });
  } finally {
    lease.release();
  }
}
