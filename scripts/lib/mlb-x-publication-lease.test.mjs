/**
 * mlb-x-publication-lease.test.mjs
 * Run via: node --test scripts/lib/mlb-x-publication-lease.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  acquirePublicationLease,
  DEFAULT_LEASE_TTL_MS,
  getLeasePath,
  PublicationOutcome,
  publishOnceUnderLease,
} from "./mlb-x-publication-lease.mjs";
import { isPostedReceipt, ReceiptOutcome } from "./mlb-x-edition-receipts.mjs";

const K_MORNING = "mlb-k-2026-07-21-morning";
const K_CONFIRMED = "mlb-k-2026-07-21-confirmed";
const HR_MORNING = "mlb-hr-2026-07-21-morning";

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-lease-"));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  let result;
  try {
    result = fn(dir);
  } catch (error) {
    cleanup();
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.then((v) => { cleanup(); return v; }, (e) => { cleanup(); throw e; });
  }
  cleanup();
  return result;
}

/** In-memory receipt store shared by concurrent attempts, like a real dir. */
function receiptStore() {
  const map = new Map();
  return {
    map,
    readReceipt: async (key) => map.get(key) ?? null,
    saveReceipt: async ({ receiptKey, postId }) => {
      map.set(receiptKey, { outcome: ReceiptOutcome.POSTED, postId });
    },
  };
}

function publisher(dir, store, overrides = {}) {
  return publishOnceUnderLease({
    receiptKey: K_MORNING,
    leaseDir: dir,
    readReceipt: store.readReceipt,
    isPosted: isPostedReceipt,
    saveReceipt: store.saveReceipt,
    callX: async () => ({ postId: "111" }),
    ...overrides,
  });
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
});

describe("publication sequence", () => {
  it("posts once and records the returned post id", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      let calls = 0;
      const result = await publisher(dir, store, { callX: async () => { calls += 1; return { postId: "999" }; } });
      assert.equal(result.outcome, PublicationOutcome.POSTED);
      assert.equal(result.postId, "999");
      assert.equal(calls, 1);
      assert.equal(isPostedReceipt(store.map.get(K_MORNING)), true);
    });
  });

  it("rechecks the receipt after acquiring the lease and makes zero X calls when already posted", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      store.map.set(K_MORNING, { outcome: ReceiptOutcome.POSTED, postId: "already" });
      let calls = 0;
      const result = await publisher(dir, store, { callX: async () => { calls += 1; return { postId: "new" }; } });
      assert.equal(result.outcome, PublicationOutcome.ALREADY_POSTED);
      assert.equal(result.postId, "already");
      assert.equal(calls, 0);
      assert.equal(result.calledX, false);
    });
  });

  it("reads the receipt only while holding the lease", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      let heldWhenRead = false;
      await publisher(dir, store, {
        readReceipt: async (key) => { heldWhenRead = existsSync(getLeasePath(key, dir)); return null; },
      });
      assert.equal(heldWhenRead, true);
    });
  });

  it("marks a fallback publication distinctly", async () => {
    await withTempDir(async (dir) => {
      const result = await publisher(dir, receiptStore(), { fallback: true });
      assert.equal(result.outcome, PublicationOutcome.FALLBACK_POSTED);
    });
  });
});

describe("failure handling", () => {
  it("a failed X call writes no receipt and releases the lease for a retry", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      const failed = await publisher(dir, store, { callX: async () => { throw new Error("429 rate limited"); } });
      assert.equal(failed.outcome, PublicationOutcome.X_API_FAILED);
      assert.equal(failed.postId, null);
      assert.match(failed.error, /429/);
      assert.equal(store.map.has(K_MORNING), false, "no receipt from a failed call");
      assert.equal(existsSync(getLeasePath(K_MORNING, dir)), false, "lease released");

      // The retry succeeds and consumes the edition.
      const retry = await publisher(dir, store, { callX: async () => ({ postId: "222" }) });
      assert.equal(retry.outcome, PublicationOutcome.POSTED);
      assert.equal(retry.postId, "222");
    });
  });

  it("treats an X response with no post id as a failure", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      const result = await publisher(dir, store, { callX: async () => ({ postId: "  " }) });
      assert.equal(result.outcome, PublicationOutcome.X_API_FAILED);
      assert.equal(store.map.has(K_MORNING), false);
    });
  });

  it("failed revalidation makes no X call and writes no receipt", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      let calls = 0;
      const result = await publisher(dir, store, {
        revalidate: async () => ({ ok: false, status: "MISSED_WINDOW" }),
        callX: async () => { calls += 1; return { postId: "x" }; },
      });
      assert.equal(result.outcome, PublicationOutcome.REVALIDATION_FAILED);
      assert.equal(result.status, "MISSED_WINDOW");
      assert.equal(calls, 0);
      assert.equal(store.map.has(K_MORNING), false);
      assert.equal(existsSync(getLeasePath(K_MORNING, dir)), false);
    });
  });

  it("releases the lease even when saving the receipt throws", async () => {
    await withTempDir(async (dir) => {
      await assert.rejects(
        publisher(dir, receiptStore(), { saveReceipt: async () => { throw new Error("disk full"); } }),
        /disk full/,
      );
      assert.equal(existsSync(getLeasePath(K_MORNING, dir)), false, "finally cleanup still ran");
    });
  });
});

describe("concurrency", () => {
  it("two concurrent same-edition attempts produce exactly one X call", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      let calls = 0;
      const slowPost = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 25));
        return { postId: "one" };
      };
      const [a, b] = await Promise.all([
        publisher(dir, store, { callX: slowPost, owner: "A" }),
        publisher(dir, store, { callX: slowPost, owner: "B" }),
      ]);
      assert.equal(calls, 1, "exactly one attempt may call X");
      const outcomes = [a.outcome, b.outcome].sort();
      assert.deepEqual(outcomes, [PublicationOutcome.LEASE_UNAVAILABLE, PublicationOutcome.POSTED].sort());
      assert.equal(isPostedReceipt(store.map.get(K_MORNING)), true);
    });
  });

  it("a serialized second attempt sees the receipt and does not call X again", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      let calls = 0;
      const call = async () => { calls += 1; return { postId: "seq" }; };
      const first = await publisher(dir, store, { callX: call });
      const second = await publisher(dir, store, { callX: call });
      assert.equal(first.outcome, PublicationOutcome.POSTED);
      assert.equal(second.outcome, PublicationOutcome.ALREADY_POSTED);
      assert.equal(calls, 1);
    });
  });

  it("concurrent HR and K attempts may both proceed", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      const [k, hr] = await Promise.all([
        publisher(dir, store, { receiptKey: K_MORNING, callX: async () => ({ postId: "k1" }) }),
        publisher(dir, store, { receiptKey: HR_MORNING, callX: async () => ({ postId: "hr1" }) }),
      ]);
      assert.equal(k.outcome, PublicationOutcome.POSTED);
      assert.equal(hr.outcome, PublicationOutcome.POSTED);
      assert.equal(store.map.get(K_MORNING).postId, "k1");
      assert.equal(store.map.get(HR_MORNING).postId, "hr1");
    });
  });

  it("concurrent morning and confirmed attempts may both proceed", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      const [morning, confirmedRun] = await Promise.all([
        publisher(dir, store, { receiptKey: K_MORNING, callX: async () => ({ postId: "m" }) }),
        publisher(dir, store, { receiptKey: K_CONFIRMED, callX: async () => ({ postId: "c" }), fallback: true }),
      ]);
      assert.equal(morning.outcome, PublicationOutcome.POSTED);
      assert.equal(confirmedRun.outcome, PublicationOutcome.FALLBACK_POSTED);
      assert.notEqual(store.map.get(K_MORNING).postId, store.map.get(K_CONFIRMED).postId);
    });
  });

  it("a diagnostic attempt record is not a publication lock", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      // An earlier run left an ATTEMPTED breadcrumb; it must not block posting.
      store.map.set(K_MORNING, { outcome: ReceiptOutcome.ATTEMPTED, postId: null });
      const result = await publisher(dir, store, { callX: async () => ({ postId: "333" }) });
      assert.equal(result.outcome, PublicationOutcome.POSTED);
      assert.equal(result.postId, "333");
    });
  });

  it("an expired lease lets a later run recover and publish", async () => {
    await withTempDir(async (dir) => {
      const store = receiptStore();
      // Crashed owner: lease on disk, no receipt, never released.
      acquirePublicationLease({ receiptKey: K_MORNING, leaseDir: dir, now: 0, ttlMs: 60_000 });
      const blocked = await publisher(dir, store, { now: 30_000 });
      assert.equal(blocked.outcome, PublicationOutcome.LEASE_UNAVAILABLE);
      const recovered = await publisher(dir, store, { now: 120_000, callX: async () => ({ postId: "444" }) });
      assert.equal(recovered.outcome, PublicationOutcome.POSTED);
      assert.equal(recovered.postId, "444");
    });
  });

  it("uses a default TTL long enough for a slow render and upload", () => {
    assert.ok(DEFAULT_LEASE_TTL_MS >= 10 * 60_000);
  });
});
