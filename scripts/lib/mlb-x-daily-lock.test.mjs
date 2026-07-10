import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkDailyPostingLock,
  getDuplicateStatePath,
  getForceRepostOverride,
  savePostReceipt,
  slugifyKey,
} from "./mlb-x-daily-lock.mjs";

function withTempStateDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-daily-lock-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("slugifyKey turns a colon-separated key into a filesystem-safe name", () => {
  assert.equal(slugifyKey("mlb-hr-props:2026-07-10"), "mlb-hr-props-2026-07-10");
});

test("HR: a changed content fingerprint on the same slate date still skips after one successful post", () => {
  withTempStateDir((dir) => {
    const dailyKey = "mlb-hr-props:2026-07-10";

    const first = checkDailyPostingLock(dailyKey, dir);
    assert.equal(first.blocked, false);
    savePostReceipt(first.statePath, { dailyPostingKey: dailyKey, contentFingerprint: "fingerprint-a", tweetId: "111" });

    // A later run computes a *different* content fingerprint (odds
    // refreshed, lineup confirmed, ranking shifted) for the exact same
    // slate date -- the daily key is unchanged, so this must still block.
    const second = checkDailyPostingLock(dailyKey, dir);
    assert.equal(second.blocked, true);
  });
});

test("HR: a different slate date is eligible even when today's slate already posted", () => {
  withTempStateDir((dir) => {
    const todayKey = "mlb-hr-props:2026-07-10";
    const tomorrowKey = "mlb-hr-props:2026-07-11";

    const today = checkDailyPostingLock(todayKey, dir);
    savePostReceipt(today.statePath, { dailyPostingKey: todayKey, tweetId: "111" });

    const tomorrow = checkDailyPostingLock(tomorrowKey, dir);
    assert.equal(tomorrow.blocked, false);
  });
});

test("a rerun after success skips as duplicate (overlapping/rerun execution cannot produce two posts)", () => {
  withTempStateDir((dir) => {
    const dailyKey = "mlb-k-props:2026-07-10";
    const firstRun = checkDailyPostingLock(dailyKey, dir);
    assert.equal(firstRun.blocked, false);
    savePostReceipt(firstRun.statePath, { dailyPostingKey: dailyKey, tweetId: "222" });

    // Simulates a workflow rerun (or an overlapping run that lands after
    // the first one's save) recomputing the exact same daily key.
    const rerun = checkDailyPostingLock(dailyKey, dir);
    assert.equal(rerun.blocked, true);
  });
});

test("manual preview never consumes the daily posting key (checkDailyPostingLock is simply never called for dry-run)", () => {
  // dry-run mode in every poster script returns before ever calling
  // checkDailyPostingLock -- this test documents that contract at the
  // lock level: a lock check that never happens cannot write a receipt.
  withTempStateDir((dir) => {
    const dailyKey = "mlb-numerology:2026-07-10";
    // No checkDailyPostingLock/savePostReceipt call here, simulating a
    // dry-run that only builds and prints a caption.
    const check = checkDailyPostingLock(dailyKey, dir);
    assert.equal(check.blocked, false, "a real post was never made, so the key must still be open");
  });
});

test("explicit force-repost override bypasses an existing daily lock and reports the override", () => {
  withTempStateDir((dir) => {
    const dailyKey = "mlb-hr-props:2026-07-10";
    const first = checkDailyPostingLock(dailyKey, dir);
    savePostReceipt(first.statePath, { dailyPostingKey: dailyKey, tweetId: "111" });

    const withoutOverride = checkDailyPostingLock(dailyKey, dir);
    assert.equal(withoutOverride.blocked, true);

    const withOverride = checkDailyPostingLock(dailyKey, dir, { allowOverride: true });
    assert.equal(withOverride.blocked, false);
    assert.equal(withOverride.overrodeExistingLock, true);
  });
});

test("getForceRepostOverride: only true for workflow_dispatch with the flag explicitly \"true\"", () => {
  assert.equal(getForceRepostOverride("workflow_dispatch", "true"), true);
  assert.equal(getForceRepostOverride("workflow_dispatch", "false"), false);
  assert.equal(getForceRepostOverride("workflow_dispatch", undefined), false);
});

test("getForceRepostOverride: never true for schedule or workflow_run, even if the flag is somehow \"true\"", () => {
  assert.equal(getForceRepostOverride("schedule", "true"), false);
  assert.equal(getForceRepostOverride("workflow_run", "true"), false);
});

test("getDuplicateStatePath is stable and deterministic for the same key/dir", () => {
  const a = getDuplicateStatePath("mlb-hr-props:2026-07-10", "/tmp/state");
  const b = getDuplicateStatePath("mlb-hr-props:2026-07-10", "/tmp/state");
  assert.equal(a, b);
});
