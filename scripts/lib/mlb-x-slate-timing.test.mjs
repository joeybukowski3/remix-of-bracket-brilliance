/**
 * mlb-x-slate-timing.test.mjs
 * Run via: node --test scripts/lib/mlb-x-slate-timing.test.mjs
 *
 * Focused on the new ET wall-clock helpers (getEtMinutesSinceMidnight,
 * isAtOrAfterEtClockTime) added for K's fixed 11:00 AM ET earliest-post
 * floor -- proves DST-safety (EST vs EDT) without any manual UTC-offset
 * arithmetic in the test itself, by picking known UTC instants for a
 * winter (EST, UTC-5) and summer (EDT, UTC-4) date and asserting the
 * correct ET wall-clock time falls out of each.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getEtMinutesSinceMidnight, isAtOrAfterEtClockTime, K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE } from "./mlb-x-slate-timing.mjs";

describe("getEtMinutesSinceMidnight", () => {
  it("EST (winter, UTC-5): 16:00 UTC is 11:00 AM ET", () => {
    assert.equal(getEtMinutesSinceMidnight(new Date("2026-01-15T16:00:00.000Z")), 11 * 60);
  });

  it("EDT (summer, UTC-4): 15:00 UTC is 11:00 AM ET", () => {
    assert.equal(getEtMinutesSinceMidnight(new Date("2026-07-17T15:00:00.000Z")), 11 * 60);
  });

  it("midnight ET normalizes to 0, not 24*60", () => {
    // 05:00 UTC in July (EDT, UTC-4) is 01:00 AM ET the same day -- pick an
    // instant close to but not exactly midnight to avoid ambiguity, and a
    // separate exact-midnight check via the hour12:false "24" edge case.
    assert.equal(getEtMinutesSinceMidnight(new Date("2026-07-17T04:00:00.000Z")), 0);
  });
});

describe("isAtOrAfterEtClockTime", () => {
  it("EST: 10:59 AM ET is before 11:00 AM ET", () => {
    assert.equal(isAtOrAfterEtClockTime(new Date("2026-01-15T15:59:00.000Z"), 11, 0), false);
  });

  it("EST: exactly 11:00 AM ET is at-or-after 11:00 AM ET", () => {
    assert.equal(isAtOrAfterEtClockTime(new Date("2026-01-15T16:00:00.000Z"), 11, 0), true);
  });

  it("EST: 11:01 AM ET is after 11:00 AM ET", () => {
    assert.equal(isAtOrAfterEtClockTime(new Date("2026-01-15T16:01:00.000Z"), 11, 0), true);
  });

  it("EDT: 10:59 AM ET is before 11:00 AM ET", () => {
    assert.equal(isAtOrAfterEtClockTime(new Date("2026-07-17T14:59:00.000Z"), 11, 0), false);
  });

  it("EDT: exactly 11:00 AM ET is at-or-after 11:00 AM ET", () => {
    assert.equal(isAtOrAfterEtClockTime(new Date("2026-07-17T15:00:00.000Z"), 11, 0), true);
  });

  it("EDT: 11:01 AM ET is after 11:00 AM ET", () => {
    assert.equal(isAtOrAfterEtClockTime(new Date("2026-07-17T15:01:00.000Z"), 11, 0), true);
  });

  it("K_EARLIEST_POST_ET_HOUR/MINUTE are exported as 11:00", () => {
    assert.equal(K_EARLIEST_POST_ET_HOUR, 11);
    assert.equal(K_EARLIEST_POST_ET_MINUTE, 0);
  });
});
