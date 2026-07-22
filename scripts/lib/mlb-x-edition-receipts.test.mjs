import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildEditionReceiptKey,
  checkEditionPostingLock,
  Edition,
  findUnpublishedEditions,
  getEditionReceiptPath,
  isPostedReceipt,
  listEditionTargets,
  Market,
  parseEditionReceiptKey,
  ReceiptOutcome,
  readEditionReceipt,
  saveEditionAttemptRecord,
  saveEditionPostReceipt,
} from "./mlb-x-edition-receipts.mjs";

const SLATE = "2026-07-21";

function withTempStateDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-edition-receipts-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const keyFor = (market, edition, slateDate = SLATE) => buildEditionReceiptKey({ market, slateDate, edition });
const pathFor = (dir, market, edition, slateDate = SLATE) => getEditionReceiptPath(keyFor(market, edition, slateDate), dir);
const post = (dir, market, edition, extra = {}) =>
  saveEditionPostReceipt(pathFor(dir, market, edition), { postId: "1234567890", slateDate: SLATE, market, edition, ...extra });
const lock = (dir, market, edition, opts) =>
  checkEditionPostingLock({ market, slateDate: SLATE, edition, stateDir: dir }, opts);

// ─── Keys ────────────────────────────────────────────────────────────────────

test("edition receipt keys include slate date, market and edition", () => {
  assert.equal(keyFor(Market.STRIKEOUT, Edition.MORNING), "mlb-k-2026-07-21-morning");
  assert.equal(keyFor(Market.HOME_RUN, Edition.MORNING), "mlb-hr-2026-07-21-morning");
  assert.equal(keyFor(Market.STRIKEOUT, Edition.CONFIRMED), "mlb-k-2026-07-21-confirmed");
  assert.equal(keyFor(Market.HOME_RUN, Edition.CONFIRMED), "mlb-hr-2026-07-21-confirmed");
});

test("a slate has exactly four distinct publication targets", () => {
  const keys = listEditionTargets(SLATE).map((t) => t.key);
  assert.equal(keys.length, 4);
  assert.equal(new Set(keys).size, 4);
});

test("keys round-trip through the parser, and legacy day-scoped keys are rejected", () => {
  assert.deepEqual(parseEditionReceiptKey(keyFor(Market.HOME_RUN, Edition.CONFIRMED)), {
    market: "hr", slateDate: SLATE, edition: "confirmed",
  });
  assert.equal(parseEditionReceiptKey("mlb-k-props-2026-07-21"), null);
  assert.equal(parseEditionReceiptKey(""), null);
});

test("an unknown market, edition, or malformed slate date fails loudly", () => {
  assert.throws(() => buildEditionReceiptKey({ market: "nfl", slateDate: SLATE, edition: Edition.MORNING }), /market/i);
  assert.throws(() => buildEditionReceiptKey({ market: Market.STRIKEOUT, slateDate: SLATE, edition: "evening" }), /edition/i);
  assert.throws(() => buildEditionReceiptKey({ market: Market.STRIKEOUT, slateDate: "7/21/26", edition: Edition.MORNING }), /slate date/i);
});

// ─── Edition independence ────────────────────────────────────────────────────

test("a morning receipt never suppresses the confirmed edition", () => {
  withTempStateDir((dir) => {
    post(dir, Market.STRIKEOUT, Edition.MORNING);
    assert.equal(lock(dir, Market.STRIKEOUT, Edition.MORNING).blocked, true);
    assert.equal(lock(dir, Market.STRIKEOUT, Edition.CONFIRMED).blocked, false);
  });
});

test("a confirmed receipt never suppresses the morning edition", () => {
  withTempStateDir((dir) => {
    post(dir, Market.HOME_RUN, Edition.CONFIRMED);
    assert.equal(lock(dir, Market.HOME_RUN, Edition.CONFIRMED).blocked, true);
    assert.equal(lock(dir, Market.HOME_RUN, Edition.MORNING).blocked, false);
  });
});

test("markets do not suppress one another", () => {
  withTempStateDir((dir) => {
    post(dir, Market.STRIKEOUT, Edition.MORNING);
    assert.equal(lock(dir, Market.HOME_RUN, Edition.MORNING).blocked, false);
  });
});

test("a receipt from a previous slate date does not suppress today", () => {
  withTempStateDir((dir) => {
    saveEditionPostReceipt(pathFor(dir, Market.STRIKEOUT, Edition.MORNING, "2026-07-20"), { postId: "999" });
    assert.equal(lock(dir, Market.STRIKEOUT, Edition.MORNING).blocked, false);
  });
});

test("all four targets can publish on a single slate", () => {
  withTempStateDir((dir) => {
    for (const { market, edition } of listEditionTargets(SLATE)) post(dir, market, edition);
    assert.deepEqual(findUnpublishedEditions(SLATE, dir), []);
  });
});

// ─── Only a confirmed publication consumes the receipt ───────────────────────

test("isPostedReceipt requires both a POSTED outcome and a non-empty post id", () => {
  assert.equal(isPostedReceipt({ outcome: ReceiptOutcome.POSTED, postId: "1" }), true);
  assert.equal(isPostedReceipt({ outcome: ReceiptOutcome.POSTED, postId: "" }), false);
  assert.equal(isPostedReceipt({ outcome: ReceiptOutcome.POSTED, postId: "   " }), false);
  assert.equal(isPostedReceipt({ outcome: ReceiptOutcome.POSTED }), false);
  assert.equal(isPostedReceipt({ postId: "1" }), false);
  assert.equal(isPostedReceipt(null), false);
});

for (const outcome of [
  ReceiptOutcome.ATTEMPTED,
  ReceiptOutcome.RENDERED,
  ReceiptOutcome.PLANNED,
  ReceiptOutcome.SKIPPED,
  ReceiptOutcome.FAILED,
]) {
  test(`a ${outcome} record does not consume the receipt or block a retry`, () => {
    withTempStateDir((dir) => {
      saveEditionAttemptRecord(pathFor(dir, Market.STRIKEOUT, Edition.MORNING), { outcome, status: "WAITING_FOR_LINEUPS" });
      const result = lock(dir, Market.STRIKEOUT, Edition.MORNING);
      assert.equal(result.blocked, false);
      assert.equal(result.alreadyPosted, false);
      // The breadcrumb survives for diagnostics.
      assert.equal(result.receipt.outcome, outcome);
      assert.equal(result.receipt.status, "WAITING_FOR_LINEUPS");
    });
  });
}

test("saving a posted receipt without a confirmed post id is refused", () => {
  withTempStateDir((dir) => {
    const p = pathFor(dir, Market.STRIKEOUT, Edition.MORNING);
    assert.throws(() => saveEditionPostReceipt(p, { slateDate: SLATE }), /confirmed post id/i);
    assert.throws(() => saveEditionPostReceipt(p, { postId: "  " }), /confirmed post id/i);
    assert.equal(readEditionReceipt(p), null);
  });
});

test("POSTED cannot be recorded through the attempt path", () => {
  withTempStateDir((dir) => {
    const p = pathFor(dir, Market.STRIKEOUT, Edition.MORNING);
    assert.throws(() => saveEditionAttemptRecord(p, { outcome: ReceiptOutcome.POSTED }), /saveEditionPostReceipt/);
    assert.throws(() => saveEditionAttemptRecord(p, { outcome: "MAYBE" }), /Unknown receipt outcome/);
  });
});

test("a saved receipt is normalized to POSTED with a trimmed id", () => {
  withTempStateDir((dir) => {
    const saved = saveEditionPostReceipt(pathFor(dir, Market.HOME_RUN, Edition.CONFIRMED), { postId: " 42 " });
    assert.equal(saved.outcome, ReceiptOutcome.POSTED);
    assert.equal(saved.postId, "42");
    assert.equal(isPostedReceipt(saved), true);
  });
});

test("an attempt record upgraded to a real post becomes blocking", () => {
  withTempStateDir((dir) => {
    const p = pathFor(dir, Market.HOME_RUN, Edition.MORNING);
    saveEditionAttemptRecord(p, { outcome: ReceiptOutcome.ATTEMPTED, status: "RENDER_FAILED" });
    assert.equal(lock(dir, Market.HOME_RUN, Edition.MORNING).blocked, false);
    saveEditionPostReceipt(p, { postId: "77" });
    assert.equal(lock(dir, Market.HOME_RUN, Edition.MORNING).blocked, true);
  });
});

// ─── Resilience and overrides ────────────────────────────────────────────────

test("an unparsable receipt is treated as absent, never a throw", () => {
  withTempStateDir((dir) => {
    const p = pathFor(dir, Market.STRIKEOUT, Edition.MORNING);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, "{ not json");
    assert.equal(readEditionReceipt(p), null);
    assert.equal(lock(dir, Market.STRIKEOUT, Edition.MORNING).blocked, false);
  });
});

test("an explicit override unblocks a genuinely posted edition", () => {
  withTempStateDir((dir) => {
    post(dir, Market.STRIKEOUT, Edition.MORNING);
    const result = lock(dir, Market.STRIKEOUT, Edition.MORNING, { allowOverride: true });
    assert.equal(result.blocked, false);
    assert.equal(result.alreadyPosted, true);
    assert.equal(result.overrodeExistingLock, true);
  });
});

test("each edition writes to its own receipt path", () => {
  withTempStateDir((dir) => {
    post(dir, Market.STRIKEOUT, Edition.MORNING);
    post(dir, Market.STRIKEOUT, Edition.CONFIRMED);
    assert.equal(JSON.parse(readFileSync(pathFor(dir, Market.STRIKEOUT, Edition.MORNING), "utf8")).edition, "morning");
    assert.equal(JSON.parse(readFileSync(pathFor(dir, Market.STRIKEOUT, Edition.CONFIRMED), "utf8")).edition, "confirmed");
  });
});

// ─── End-of-window visibility ────────────────────────────────────────────────

test("a slate that published nothing reports all four targets missing -- the 2026-07-21 case", () => {
  withTempStateDir((dir) => {
    const missing = findUnpublishedEditions(SLATE, dir).map((m) => m.key).sort();
    assert.deepEqual(missing, [
      "mlb-hr-2026-07-21-confirmed",
      "mlb-hr-2026-07-21-morning",
      "mlb-k-2026-07-21-confirmed",
      "mlb-k-2026-07-21-morning",
    ]);
  });
});

test("a partial slate reports only what is still missing", () => {
  withTempStateDir((dir) => {
    post(dir, Market.STRIKEOUT, Edition.MORNING);
    post(dir, Market.HOME_RUN, Edition.MORNING);
    assert.deepEqual(
      findUnpublishedEditions(SLATE, dir).map((m) => m.key).sort(),
      ["mlb-hr-2026-07-21-confirmed", "mlb-k-2026-07-21-confirmed"],
    );
  });
});

test("a non-posted attempt record does not count as published", () => {
  withTempStateDir((dir) => {
    saveEditionAttemptRecord(pathFor(dir, Market.STRIKEOUT, Edition.MORNING), { outcome: ReceiptOutcome.FAILED });
    assert.equal(findUnpublishedEditions(SLATE, dir).length, 4);
  });
});
