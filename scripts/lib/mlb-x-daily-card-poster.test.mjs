/**
 * mlb-x-daily-card-poster.test.mjs
 * Run via: node --test scripts/lib/mlb-x-daily-card-poster.test.mjs
 *
 * Drives runDailyCardPost with mocked X, lease and state collaborators --
 * mirrors mlb-x-edition-poster.test.mjs's harness shape for the simpler
 * composite-card publication sequence.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DailyCardPostOutcome, runDailyCardPost } from "./mlb-x-daily-card-poster.mjs";

const SLATE = "2026-07-21";
const TARGET = "daily-card-morning";
const RECEIPT_KEY = `mlb-${TARGET}-${SLATE}`;
const IMAGE_PATH = "/tmp/mlb-daily-morning.png";
const CAPTION = "⚾ MLB Daily Model Card — July 21, 2026";

function fakeStore(initial = null) {
  let stored = initial;
  return {
    syncs: 0,
    writes: [],
    sync() { this.syncs += 1; },
    readReceipt() { return stored; },
    writeReceipt({ receipt }) {
      stored = receipt;
      this.writes.push(receipt);
      return { pushed: true };
    },
  };
}

const okLease = () => ({ acquired: true, released: false, release() { this.released = true; } });

function harness(overrides = {}) {
  const store = overrides.stateStore ?? fakeStore(overrides.existingReceipt ?? null);
  const calls = { primary: 0, verifyAccount: 0 };
  const primaryError = overrides.primaryError ?? null;
  const primaryPostId = overrides.primaryPostId === undefined ? "999" : overrides.primaryPostId;
  const lease = overrides.lease ?? okLease();
  const deps = {
    receiptKey: RECEIPT_KEY,
    slateDate: SLATE,
    target: TARGET,
    imagePath: IMAGE_PATH,
    buildCaption: () => CAPTION,
    stateStore: store,
    acquireLease: () => lease,
    postPrimary: async (args) => {
      calls.primary += 1;
      calls.lastPostArgs = args;
      if (primaryError) throw primaryError;
      return primaryPostId === null ? {} : { postId: primaryPostId };
    },
    verifyAccount: overrides.verifyAccount ?? (async () => { calls.verifyAccount += 1; return true; }),
    now: () => "2026-07-21T15:00:00.000Z",
    dryRun: overrides.dryRun ?? false,
    log: () => {},
  };
  return { deps, store, calls, lease };
}

describe("runDailyCardPost: happy path", () => {
  it("posts once, uploads the given image path and the fixed caption, and writes exactly one receipt", async () => {
    const { deps, store, calls } = harness();
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.POSTED);
    assert.equal(result.calledX, true);
    assert.equal(result.primaryPostId, "999");
    assert.equal(calls.primary, 1);
    assert.equal(calls.lastPostArgs.caption, CAPTION);
    assert.equal(calls.lastPostArgs.imagePath, IMAGE_PATH);
    assert.equal(store.writes.length, 1);
    assert.equal(store.writes[0].primaryPostId, "999");
    assert.equal(store.writes[0].outcome, "POSTED");
    assert.equal(store.syncs, 1);
  });

  it("releases the lease even on success", async () => {
    const { deps, lease } = harness();
    await runDailyCardPost(deps);
    assert.equal(lease.released, true);
  });
});

describe("runDailyCardPost: already posted", () => {
  it("skips safely without calling X again when a receipt already exists", async () => {
    const { deps, calls } = harness({ existingReceipt: { outcome: "POSTED", postId: "111", primaryPostId: "111" } });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.ALREADY_POSTED);
    assert.equal(result.primaryPostId, "111");
    assert.equal(calls.primary, 0);
  });

  it("re-reads the receipt AFTER the lease is acquired, not before", async () => {
    const reads = [];
    const store = {
      sync() {},
      readReceipt() { reads.push("read"); return { outcome: "POSTED", postId: "222", primaryPostId: "222" }; },
      writeReceipt() { throw new Error("must not write when already posted"); },
    };
    const { deps } = harness({ stateStore: store });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.ALREADY_POSTED);
    assert.equal(reads.length, 1, "receipt must be read exactly once, under the lease");
  });

  it("does not treat a non-posted (attempted/failed) receipt as already posted", async () => {
    const { deps, calls } = harness({ existingReceipt: { outcome: "FAILED", postId: null } });
    const result = await runDailyCardPost(deps);
    assert.notEqual(result.outcome, DailyCardPostOutcome.ALREADY_POSTED);
    assert.equal(calls.primary, 1);
  });
});

describe("runDailyCardPost: lease unavailable", () => {
  it("never calls X or the state store's receipt read when the lease is held elsewhere", async () => {
    const store = {
      sync() {},
      readReceipt() { throw new Error("must not read receipt without the lease"); },
      writeReceipt() { throw new Error("must not write without the lease"); },
    };
    const { deps, calls } = harness({ stateStore: store, lease: { acquired: false, heldBy: "pid-1", release() {} } });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.LEASE_UNAVAILABLE);
    assert.equal(result.heldBy, "pid-1");
    assert.equal(calls.primary, 0);
  });
});

describe("runDailyCardPost: dry run", () => {
  it("never calls X and never writes a receipt", async () => {
    const { deps, store, calls } = harness({ dryRun: true });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.DRY_RUN);
    assert.equal(calls.primary, 0);
    assert.equal(store.writes.length, 0);
  });

  it("still syncs state and re-reads the receipt so a dry run reports ALREADY_POSTED honestly", async () => {
    const { deps } = harness({ dryRun: true, existingReceipt: { outcome: "POSTED", postId: "333", primaryPostId: "333" } });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.ALREADY_POSTED);
  });
});

describe("runDailyCardPost: account verification", () => {
  it("never calls X when the account cannot be verified", async () => {
    const { deps, calls } = harness({ verifyAccount: async () => false });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.CONFIGURATION_ERROR);
    assert.equal(result.status, "ACCOUNT_MISMATCH");
    assert.equal(calls.primary, 0);
  });
});

describe("runDailyCardPost: X failures never produce a false receipt", () => {
  it("a thrown error from postPrimary writes no receipt", async () => {
    const { deps, store } = harness({ primaryError: new Error("network error") });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.X_API_FAILED);
    assert.equal(result.calledX, true);
    assert.equal(store.writes.length, 0);
  });

  it("a response with no post id writes no receipt", async () => {
    const { deps, store } = harness({ primaryPostId: null });
    const result = await runDailyCardPost(deps);
    assert.equal(result.outcome, DailyCardPostOutcome.X_API_FAILED);
    assert.equal(store.writes.length, 0);
  });
});
