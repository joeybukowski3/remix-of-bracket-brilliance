/**
 * mlb-x-publication-lease.test.mjs
 * Run via: node --test scripts/lib/mlb-x-publication-lease.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquirePublicationLease, DEFAULT_LEASE_TTL_MS, getLeasePath } from "./mlb-x-publication-lease.mjs";

const K_MORNING = "mlb-k-2026-07-21-morning";
const K_CONFIRMED = "mlb-k-2026-07-21-confirmed";
const HR_MORNING = "mlb-hr-2026-07-21-morning";

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-lease-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("lease acquisition", () => {
  it("is exclusive for the same edition", () => {
    withTempDir((dir) => {
      const first = acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir });
      const second = acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir });
      assert.equal(first.acquired, true);
      assert.equal(second.acquired, false);
      first.release();
      assert.equal(acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir }).acquired, true);
    });
  });

  it("only the exact edition blocks itself -- markets and editions stay independent", () => {
    withTempDir((dir) => {
      const kMorning = acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir });
      assert.equal(kMorning.acquired, true);
      // Different market, same edition.
      assert.equal(acquirePublicationLease({ receiptKey: HR_MORNING, leaseDir: dir }).acquired, true);
      // Same market, different edition.
      assert.equal(acquirePublicationLease({ receiptKey: K_CONFIRMED, leaseDir: dir }).acquired, true);
    });
  });

  it("recovers an expired lease so a crashed process cannot wedge an edition", () => {
    withTempDir((dir) => {
      const stuck = acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 0, ttlMs: 60_000 });
      assert.equal(stuck.acquired, true);
      // Still held before expiry.
      assert.equal(acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 30_000 }).acquired, false);
      // Recovered after it.
      const recovered = acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 61_000 });
      assert.equal(recovered.acquired, true);
      assert.equal(recovered.recoveredExpiredLease, true);
    });
  });

  it("treats an unparsable lease as expired rather than blocking forever", () => {
    withTempDir((dir) => {
      writeFileSync(getLeasePath(K_MORNING, dir), "{ not json");
      assert.equal(acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir }).acquired, true);
    });
  });

  it("does not extend a lease just because the file was touched", () => {
    withTempDir((dir) => {
      acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 0, ttlMs: 60_000 });
      // Rewrite the file (new mtime) but the body still says it expired.
      const held = getLeasePath(K_MORNING, dir);
      writeFileSync(held, JSON.stringify({ receiptKey: K_MORNING, owner: "old", expiresAt: new Date(1_000).toISOString() }));
      assert.equal(acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 50_000 }).acquired, true);
    });
  });

  it("uses a default TTL long enough for a slow render and upload", () => {
    assert.ok(DEFAULT_LEASE_TTL_MS >= 10 * 60_000);
  });

  it("an expired lease on disk lets a later acquisition recover and proceed", () => {
    withTempDir((dir) => {
      // Crashed owner: lease on disk, never released.
      acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 0, ttlMs: 60_000 });
      const blocked = acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 30_000, ttlMs: 60_000 });
      assert.equal(blocked.acquired, false);
      const recovered = acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 120_000, ttlMs: 60_000 });
      assert.equal(recovered.acquired, true);
    });
  });
});
