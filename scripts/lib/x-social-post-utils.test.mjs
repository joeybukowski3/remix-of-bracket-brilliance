import test from "node:test";
import assert from "node:assert/strict";
import { isGenerationReady, pollUntilReady } from "./x-social-post-utils.mjs";

test("generation readiness requires matching slate and equal or newer timestamp", () => {
  const expected = { date: "2026-06-28", generatedAt: "2026-06-28T10:00:00Z" };
  assert.equal(isGenerationReady({ date: "2026-06-28", generatedAt: "2026-06-28T10:00:00Z" }, expected), true);
  assert.equal(isGenerationReady({ date: "2026-06-28", generatedAt: "2026-06-28T09:59:59Z" }, expected), false);
  assert.equal(isGenerationReady({ date: "2026-06-27", generatedAt: "2026-06-28T11:00:00Z" }, expected), false);
});

test("polling waits through stale data and returns when current", async () => {
  let attempts = 0;
  const result = await pollUntilReady({
    label: "test",
    expected: { date: "2026-06-28", generatedAt: "2026-06-28T10:00:00Z" },
    intervalMs: 1,
    timeoutMs: 100,
    loadObserved: async () => {
      attempts += 1;
      return attempts < 2 ? { date: "2026-06-28", generatedAt: "2026-06-28T09:00:00Z", odds: false } : { date: "2026-06-28", generatedAt: "2026-06-28T10:00:00Z", odds: true };
    },
    validate: (value) => ({ ready: value.odds }),
  });
  assert.equal(result.ready, true);
  assert.equal(result.attempts, 2);
});

test("polling times out safely", async () => {
  const result = await pollUntilReady({
    label: "test",
    expected: { date: "2026-06-28", generatedAt: "2026-06-28T10:00:00Z" },
    intervalMs: 1,
    timeoutMs: 3,
    loadObserved: async () => ({ date: "2026-06-27", generatedAt: "2026-06-27T10:00:00Z" }),
  });
  assert.equal(result.ready, false);
});
