/**
 * mlb-bvp-history-rate-limiter.test.mjs
 * Run via: node --test scripts/lib/mlb-bvp-history-rate-limiter.test.mjs
 *
 * Deterministic timing coverage for the global request-start pacer: no
 * real timers, no real waiting -- a fake clock (now) and a recording
 * sleep function drive every assertion, so these tests are fast and
 * exact rather than tolerance-based.
 *
 * Note on concurrency + fake clocks: a fake sleep() that resolves
 * "instantly" (no real setTimeout) races multiple concurrent chains
 * through the microtask queue faster than any separately-scheduled
 * `.then()` recording callback can observe intermediate values -- by the
 * time a recorder callback runs, every concurrent chain may have already
 * finished. Sequential acquire()s are recorded reliably (each is awaited
 * before the next starts); concurrent scenarios are instead verified
 * against the limiter's final internal schedule state
 * (_peekNextAvailableAt), which is unaffected by that race and proves no
 * two callers were double-booked into the same slot.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, fetchBvpHistoryForPair, fetchVsPlayerSplit, DEFAULT_RATE_PER_SECOND } from "./mlb-bvp-history-fetch.mjs";

/** A fake clock: now() reads a mutable cursor; the returned sleep(ms) advances that cursor by ms instead of actually waiting. */
function makeFakeClock(startAt = 0) {
  let current = startAt;
  const sleepCalls = [];
  return {
    now: () => current,
    sleep: async (ms) => {
      sleepCalls.push(ms);
      current += ms;
    },
    sleepCalls,
    advance: (ms) => { current += ms; },
  };
}

describe("createRateLimiter", () => {
  it("defaults to 5 request starts per second (200ms between starts)", async () => {
    assert.equal(DEFAULT_RATE_PER_SECOND, 5);
    const clock = makeFakeClock();
    const limiter = createRateLimiter(DEFAULT_RATE_PER_SECOND, clock);

    await limiter.acquire();
    const firstAvailable = clock.now();
    await limiter.acquire();
    const secondAvailable = clock.now();

    assert.equal(secondAvailable - firstAvailable, 200);
  });

  it("the first acquire() never waits (clock starts idle)", async () => {
    const clock = makeFakeClock();
    const limiter = createRateLimiter(5, clock);
    await limiter.acquire();
    assert.equal(clock.sleepCalls.length, 0);
  });

  it("spaces N sequential acquires by exactly the configured interval, deterministically", async () => {
    const clock = makeFakeClock();
    const limiter = createRateLimiter(5, clock); // 200ms interval
    const timestamps = [];
    for (let i = 0; i < 6; i += 1) {
      await limiter.acquire();
      timestamps.push(clock.now());
    }
    assert.deepEqual(timestamps, [0, 200, 400, 600, 800, 1000]);
  });

  it("honors a custom rate (e.g. 10/sec -> 100ms interval)", async () => {
    const clock = makeFakeClock();
    const limiter = createRateLimiter(10, clock);
    await limiter.acquire();
    await limiter.acquire();
    assert.equal(clock.now(), 100);
  });

  it("does not over-wait when callers arrive slower than the rate allows", async () => {
    const clock = makeFakeClock();
    const limiter = createRateLimiter(5, clock); // 200ms interval
    await limiter.acquire();
    clock.advance(1000); // caller naturally arrives much later than the interval requires
    await limiter.acquire();
    assert.equal(clock.sleepCalls.length, 0, "no sleep should occur when the caller is already late");
    assert.equal(clock.now(), 1000);
  });

  it("under concurrent acquire() calls (simulating parallel career + last5y requests), no two callers are double-booked into the same slot", async () => {
    const clock = makeFakeClock();
    const limiter = createRateLimiter(5, clock); // 200ms interval
    await Promise.all(Array.from({ length: 4 }, () => limiter.acquire()));
    // 4 distinct 200ms slots must have been consumed (0, 200, 400, 600) -- if two
    // callers had raced into the same slot, the schedule would have advanced by
    // less than 4 * 200ms.
    assert.equal(limiter._peekNextAvailableAt(), 800);
  });
});

describe("fetchVsPlayerSplit and fetchBvpHistoryForPair share one limiter across career, last5y, and retries", () => {
  it("a single pair's career + last5y requests each consume their own paced slot, not fired simultaneously", async () => {
    const clock = makeFakeClock();
    const rateLimiter = createRateLimiter(5, clock);
    const fetchImpl = async () => ({ ok: true, json: async () => ({ stats: [] }) });

    await fetchBvpHistoryForPair(1, 2, { fetchImpl, rateLimiter, retries: 0, sleep: clock.sleep });

    // 2 requests (career + last5y) -> 2 slots -> next slot starts at 2 * 200ms.
    assert.equal(rateLimiter._peekNextAvailableAt(), 400);
  });

  it("retries on the same request also consume a rate-limit slot, not bypassing the pacer", async () => {
    const clock = makeFakeClock();
    const rateLimiter = createRateLimiter(5, clock);
    const starts = [];
    let attempt = 0;
    const fetchImpl = async () => {
      starts.push(clock.now());
      attempt += 1;
      if (attempt === 1) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ stats: [] }) };
    };

    await fetchVsPlayerSplit(1, 2, "vsPlayerTotal", { fetchImpl, rateLimiter, retries: 1, sleep: clock.sleep });

    assert.equal(starts.length, 2, "both the failed first attempt and the retry must each start");
    // The failed attempt schedules a slot at t=0 (nextAvailableAt -> 200). The retry backoff
    // (boundedBackoffMs(0) = 250ms) then advances the clock to t=250 -- past the 200ms slot --
    // before the retry's own acquire() runs, so *that* acquire schedules its slot at t=250
    // (nextAvailableAt -> 450) rather than waiting an additional 200ms on top. This is correct:
    // the backoff and the rate limiter are independent delays, and whichever is larger at the
    // moment of the next acquire() call determines the actual wait -- the limiter never lets a
    // request start *earlier* than its slot, but it also never adds redundant extra delay on
    // top of a wait that already satisfies the interval. The retry still unambiguously consumed
    // its own real acquire() call against the shared limiter (proven by starts.length above and
    // by nextAvailableAt advancing again here), which is the behavior under test.
    assert.equal(rateLimiter._peekNextAvailableAt(), 450);
  });

  it("multiple pairs processed back-to-back all draw from the same shared limiter instance when explicitly passed", async () => {
    const clock = makeFakeClock();
    const rateLimiter = createRateLimiter(5, clock);
    const fetchImpl = async () => ({ ok: true, json: async () => ({ stats: [] }) });

    await fetchBvpHistoryForPair(1, 2, { fetchImpl, rateLimiter, retries: 0, sleep: clock.sleep });
    await fetchBvpHistoryForPair(3, 4, { fetchImpl, rateLimiter, retries: 0, sleep: clock.sleep });

    // 4 total request starts (2 pairs x 2 endpoints) -> 4 slots -> next slot at 4 * 200ms.
    // Proves the second pair's requests did not bypass the limiter state left behind by the first pair.
    assert.equal(rateLimiter._peekNextAvailableAt(), 800);
  });

  it("omitting rateLimiter still works (falls back to the shared module-level default, not a required parameter)", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ stats: [] }) });
    const result = await fetchVsPlayerSplit(999999901, 999999902, "vsPlayerTotal", { fetchImpl, retries: 0 });
    assert.equal(result.error, null);
    assert.deepEqual(result.json, { stats: [] });
  });
});
