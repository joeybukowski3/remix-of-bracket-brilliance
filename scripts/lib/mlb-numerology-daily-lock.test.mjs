import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkDailyPostingLock, savePostReceipt } from "./mlb-x-daily-lock.mjs";

// Numerology-specific coverage of the shared daily-lock module (see
// mlb-x-daily-lock.test.mjs for the generic behavior) using its actual
// key format (mlb-numerology:<date>, built by buildDailyPostingKey in
// post-mlb-numerology-to-x.mjs).
function withTempStateDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-numerology-lock-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("Numerology: same-day duplicate key skips after a successful post", () => {
  withTempStateDir((dir) => {
    const key = "mlb-numerology:2026-07-10";
    const first = checkDailyPostingLock(key, dir);
    assert.equal(first.blocked, false);
    savePostReceipt(first.statePath, { dailyPostingKey: key, tweetId: "999" });

    const second = checkDailyPostingLock(key, dir);
    assert.equal(second.blocked, true);
  });
});

test("Numerology: a new day's key is unaffected by a prior day's receipt", () => {
  withTempStateDir((dir) => {
    const yesterday = "mlb-numerology:2026-07-09";
    const today = "mlb-numerology:2026-07-10";
    const y = checkDailyPostingLock(yesterday, dir);
    savePostReceipt(y.statePath, { dailyPostingKey: yesterday, tweetId: "888" });

    const t = checkDailyPostingLock(today, dir);
    assert.equal(t.blocked, false);
  });
});
