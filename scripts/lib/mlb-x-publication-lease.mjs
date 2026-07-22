/**
 * Atomic per-edition publication lease.
 *
 * The durable receipt records that an edition WAS published; it cannot prevent
 * two attempts from publishing simultaneously. Cron and the workflow_run
 * backstop can both reach the posting layer before either has written a
 * receipt, and both would then see "not posted yet" and call X. The receipt is
 * the duplicate *record*; this lease is the duplicate *barrier*.
 *
 * The lease is keyed by the exact edition receipt key, so
 * mlb-k-2026-07-21-morning blocks only itself: HR and K stay independent, and
 * morning and confirmed stay independent.
 *
 * A lease is never evidence of publication. A crashed or failed attempt
 * releases (or expires) its lease and the edition stays eligible for retry --
 * only a receipt carrying a confirmed post id ends an edition.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Long enough to cover a slow render plus upload, short enough to self-heal. */
export const DEFAULT_LEASE_TTL_MS = 12 * 60_000;

export const PublicationOutcome = Object.freeze({
  POSTED: "POSTED",
  FALLBACK_POSTED: "FALLBACK_POSTED",
  ALREADY_POSTED: "ALREADY_POSTED",
  LEASE_UNAVAILABLE: "LEASE_UNAVAILABLE",
  REVALIDATION_FAILED: "REVALIDATION_FAILED",
  X_API_FAILED: "X_API_FAILED",
});

export function getLeasePath(receiptKey, leaseDir) {
  return path.join(leaseDir, `${receiptKey}.lease.json`);
}

function readLease(leasePath) {
  try {
    return JSON.parse(readFileSync(leasePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Exclusive create, so two processes racing the same edition cannot both win.
 *
 * Expiry is carried in the lease body rather than inferred from mtime: a file
 * touched by an unrelated process must not extend a lease, and a lease copied
 * or restored from cache must not appear fresh.
 */
export function acquirePublicationLease({ receiptKey, leaseDir, now = Date.now(), ttlMs = DEFAULT_LEASE_TTL_MS, owner = `pid-${process.pid}` }) {
  const leasePath = getLeasePath(receiptKey, leaseDir);
  mkdirSync(leaseDir, { recursive: true });

  const write = () => {
    const body = { receiptKey, owner, acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString() };
    const fd = openSync(leasePath, "wx");
    try {
      writeFileSync(leasePath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    } finally {
      closeSync(fd);
    }
    return {
      acquired: true, leasePath, owner, expiresAt: body.expiresAt,
      release: () => rmSync(leasePath, { force: true }),
    };
  };

  try {
    return write();
  } catch {
    const held = readLease(leasePath);
    const expiresAt = held?.expiresAt ? Date.parse(held.expiresAt) : Number.NaN;
    const expired = !Number.isFinite(expiresAt) || now >= expiresAt;
    if (expired) {
      // A crashed process must not wedge an edition for the rest of the slate.
      rmSync(leasePath, { force: true });
      try {
        return { ...write(), recoveredExpiredLease: true };
      } catch {
        return { acquired: false, leasePath, heldBy: held?.owner ?? null, release: () => {} };
      }
    }
    return { acquired: false, leasePath, heldBy: held?.owner ?? null, expiresAt: held?.expiresAt ?? null, release: () => {} };
  }
}

/**
 * Runs the required publication sequence for one edition.
 *
 * 1. acquire the lease
 * 2. re-read the receipt WHILE HOLDING it
 * 3. already posted -> return without calling X
 * 4. revalidate volatile inputs
 * 5. call X exactly once
 * 6. persist the receipt with the returned post id before releasing
 * 7. release in finally
 *
 * `callX` is invoked at most once per successful lease acquisition. Any throw
 * from it yields X_API_FAILED with no receipt written, leaving the edition
 * eligible for a later retry.
 */
export async function publishOnceUnderLease({
  receiptKey,
  leaseDir,
  now = Date.now(),
  ttlMs = DEFAULT_LEASE_TTL_MS,
  owner,
  readReceipt,
  isPosted,
  revalidate = async () => ({ ok: true }),
  callX,
  saveReceipt,
  fallback = false,
}) {
  const lease = acquirePublicationLease({ receiptKey, leaseDir, now, ttlMs, owner });
  if (!lease.acquired) {
    // Another attempt owns this exact edition right now. Not an error: the
    // owner is mid-publication and this run must not call X.
    return { outcome: PublicationOutcome.LEASE_UNAVAILABLE, receiptKey, postId: null, heldBy: lease.heldBy ?? null, calledX: false };
  }

  try {
    // Re-read under the lease. The window between "planner said go" and "we
    // hold the lease" is exactly where a competing publisher would have
    // finished, and this is the read that sees their receipt.
    const existing = await readReceipt(receiptKey);
    if (isPosted(existing)) {
      return { outcome: PublicationOutcome.ALREADY_POSTED, receiptKey, postId: existing?.postId ?? null, calledX: false };
    }

    const revalidation = await revalidate();
    if (!revalidation?.ok) {
      return {
        outcome: PublicationOutcome.REVALIDATION_FAILED, receiptKey, postId: null, calledX: false,
        status: revalidation?.status ?? null, detail: revalidation?.detail ?? null,
      };
    }

    let response;
    try {
      response = await callX();
    } catch (error) {
      // No receipt: a failed call must never consume the edition.
      return {
        outcome: PublicationOutcome.X_API_FAILED, receiptKey, postId: null, calledX: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const postId = String(response?.postId ?? "").trim();
    if (!postId) {
      return { outcome: PublicationOutcome.X_API_FAILED, receiptKey, postId: null, calledX: true, error: "X returned no post id" };
    }

    // Persisted before the lease is released, so a competing attempt that
    // acquires immediately afterwards observes a posted receipt.
    await saveReceipt({ receiptKey, postId, response });
    return {
      outcome: fallback ? PublicationOutcome.FALLBACK_POSTED : PublicationOutcome.POSTED,
      receiptKey, postId, calledX: true,
    };
  } finally {
    lease.release();
  }
}
