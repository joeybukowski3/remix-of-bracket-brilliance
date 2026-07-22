/**
 * Edition-aware durable receipts for the MLB X posting system.
 *
 * The previous lock was keyed on market + slate date only (receipt file
 * `mlb-k-props-2026-07-21.json`, cache key
 * `mlb-strikeout-props-x-posted-2026-07-21-...-k`). That is correct for a
 * one-post-per-day design, but it cannot express the four independent
 * publication targets a slate now has: a morning edition and a
 * confirmed-lineup edition for each of K and HR. Under the old key a morning
 * post would consume the day's lock and permanently suppress the confirmed
 * post for the same market.
 *
 * Every key here therefore carries all three dimensions -- slate date, market,
 * edition -- so `mlb-k-2026-07-21-morning` and `mlb-k-2026-07-21-confirmed`
 * are distinct locks that cannot suppress one another.
 *
 * The second rule this module enforces is that a receipt is only "consumed" by
 * a post X actually acknowledged. On 2026-07-21 a posting job ran, exited 0,
 * wrote no receipt, and reported success -- the run was green while nothing
 * published. A receipt that records an attempt rather than a confirmed
 * publication would have been worse: it would have suppressed every later
 * retry in the same window. So an attempted, rendered, planned, skipped, or
 * failed post is explicitly NOT a posted receipt and never blocks a retry;
 * only a receipt carrying a confirmed post id does.
 *
 * Side-effect-free apart from the two functions that touch disk, matching the
 * convention in mlb-x-daily-lock.mjs so this stays importable and testable
 * without triggering a poster script's main().
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Market segment of a receipt key. Stable wire values -- do not rename. */
export const Market = Object.freeze({
  STRIKEOUT: "k",
  HOME_RUN: "hr",
});

/** Edition segment of a receipt key. Stable wire values -- do not rename. */
export const Edition = Object.freeze({
  MORNING: "morning",
  CONFIRMED: "confirmed",
});

export const MARKETS = Object.freeze([Market.STRIKEOUT, Market.HOME_RUN]);
export const EDITIONS = Object.freeze([Edition.MORNING, Edition.CONFIRMED]);

/** All four publication targets for one slate, in a stable order. */
export function listEditionTargets(slateDate) {
  return MARKETS.flatMap((market) =>
    EDITIONS.map((edition) => ({
      market,
      edition,
      key: buildEditionReceiptKey({ market, slateDate, edition }),
    })),
  );
}

const SLATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `mlb-{market}-{slateDate}-{edition}`, e.g. `mlb-k-2026-07-21-morning`.
 *
 * Throws on an unknown market/edition or a malformed slate date rather than
 * silently producing a key that would collide with, or fail to match, a real
 * one -- a wrong key here either suppresses a valid post or permits a
 * duplicate, and both are worse than a loud failure.
 */
export function buildEditionReceiptKey({ market, slateDate, edition }) {
  if (!MARKETS.includes(market)) {
    throw new Error(`Unknown MLB X market "${market}" (expected one of: ${MARKETS.join(", ")}).`);
  }
  if (!EDITIONS.includes(edition)) {
    throw new Error(`Unknown MLB X edition "${edition}" (expected one of: ${EDITIONS.join(", ")}).`);
  }
  if (!SLATE_DATE_PATTERN.test(String(slateDate ?? ""))) {
    throw new Error(`Malformed slate date "${slateDate}" (expected YYYY-MM-DD).`);
  }
  return `mlb-${market}-${slateDate}-${edition}`;
}

/** Parses a key back into its parts, or null when it is not a valid edition key. */
export function parseEditionReceiptKey(key) {
  const match = /^mlb-(k|hr)-(\d{4}-\d{2}-\d{2})-(morning|confirmed)$/.exec(String(key ?? ""));
  if (!match) return null;
  return { market: match[1], slateDate: match[2], edition: match[3] };
}

export function getEditionReceiptPath(key, stateDir) {
  return path.join(stateDir, `${key}.json`);
}

/**
 * True only for a receipt describing a publication X acknowledged.
 *
 * Requires an explicit posted outcome AND a non-empty post id: either alone is
 * insufficient, because a partially-written receipt (outcome recorded before
 * the API response landed) must not suppress the retry that would finish the
 * job. Anything else -- attempted, rendered, planned, skipped, failed, absent,
 * or unparsable -- is treated as "not posted".
 */
export function isPostedReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return false;
  if (receipt.outcome !== ReceiptOutcome.POSTED) return false;
  const postId = receipt.postId;
  return typeof postId === "string" && postId.trim().length > 0;
}

/** Terminal outcome recorded on a receipt. Only POSTED consumes the lock. */
export const ReceiptOutcome = Object.freeze({
  POSTED: "POSTED",
  ATTEMPTED: "ATTEMPTED",
  RENDERED: "RENDERED",
  PLANNED: "PLANNED",
  SKIPPED: "SKIPPED",
  FAILED: "FAILED",
});

/** Reads a receipt. A missing or unparsable file is "no receipt", never an error. */
export function readEditionReceipt(statePath) {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Whether this specific edition is already published.
 *
 * Deliberately scoped to one edition key: a morning receipt is invisible to
 * the confirmed-edition check and vice versa, which is the property that lets
 * both editions publish on the same slate.
 */
export function checkEditionPostingLock({ market, slateDate, edition, stateDir }, { allowOverride = false } = {}) {
  const key = buildEditionReceiptKey({ market, slateDate, edition });
  const statePath = getEditionReceiptPath(key, stateDir);
  const receipt = readEditionReceipt(statePath);
  const posted = isPostedReceipt(receipt);
  return {
    key,
    statePath,
    receipt,
    // A non-posted receipt (an earlier attempt, render, or failure) is
    // explicitly not blocking -- the run that follows it must be free to retry.
    blocked: posted && !allowOverride,
    alreadyPosted: posted,
    overrodeExistingLock: posted && allowOverride,
  };
}

/**
 * Writes a POSTED receipt. Refuses to write one without a post id, so the
 * "only a confirmed publication consumes the receipt" rule cannot be broken by
 * a caller that forgets to thread the API response through.
 */
export function saveEditionPostReceipt(statePath, receipt) {
  const postId = typeof receipt?.postId === "string" ? receipt.postId.trim() : "";
  if (!postId) {
    throw new Error("Refusing to save a posted receipt without a confirmed post id from the X API.");
  }
  const payload = { ...receipt, postId, outcome: ReceiptOutcome.POSTED };
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

/**
 * Records a non-publishing outcome for diagnostics WITHOUT consuming the lock.
 *
 * This is what yesterday's silent green run lacked: the job exited 0 having
 * published nothing and left no trace of why. These files are audit breadcrumbs
 * only -- isPostedReceipt rejects every outcome except POSTED, so writing one
 * can never suppress a later retry.
 */
export function saveEditionAttemptRecord(statePath, { outcome, status, detail = null, at = new Date().toISOString() }) {
  if (outcome === ReceiptOutcome.POSTED) {
    throw new Error("Use saveEditionPostReceipt for a confirmed publication.");
  }
  if (!Object.values(ReceiptOutcome).includes(outcome)) {
    throw new Error(`Unknown receipt outcome "${outcome}".`);
  }
  const payload = { outcome, status: status ?? null, detail, at, postId: null };
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

/**
 * Which of a slate's four targets are still unpublished.
 *
 * Intended for end-of-window failure visibility: a slate that finishes with a
 * non-empty list here published less than it should have, which on 2026-07-21
 * was every one of the four and produced no signal at all.
 */
export function findUnpublishedEditions(slateDate, stateDir) {
  return listEditionTargets(slateDate).filter(
    ({ key }) => !isPostedReceipt(readEditionReceipt(getEditionReceiptPath(key, stateDir))),
  );
}
