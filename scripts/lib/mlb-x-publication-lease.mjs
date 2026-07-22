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
