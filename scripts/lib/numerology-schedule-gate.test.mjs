/**
 * numerology-schedule-gate.test.mjs
 * Deterministic tests — no real waiting, all timestamps injected.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getEtDateString,
  getEtHourMinute,
  isMorningRunAllowed,
  computeLineupTargetTime,
  isLineupRunAllowed,
  areLineupsConfirmed,
  evaluateGate,
} from "./numerology-schedule-gate.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Date in UTC that corresponds to a given ET wall-clock time (DST-aware via Intl). */
function etWallClock(dateStr, hour, minute = 0) {
  // Use a search to find the UTC ms that corresponds to this ET wall clock
  // Strategy: parse the date, try UTC offsets for EST (-5) and EDT (-4)
  const [y, m, d] = dateStr.split("-").map(Number);
  // Try both offsets
  for (const offsetH of [5, 4]) {
    const utcMs = Date.UTC(y, m - 1, d, hour + offsetH, minute);
    const candidate = new Date(utcMs);
    const { hour: etH, minute: etM } = getEtHourMinute(candidate);
    if (etH === hour && etM === minute) return candidate;
  }
  throw new Error(`Cannot find UTC for ET ${dateStr} ${hour}:${minute}`);
}

function fakeSchedule(gameDates, statuses = []) {
  return {
    dates: [{
      games: gameDates.map((d, i) => ({
        gameDate: d,
        status: { detailedState: statuses[i] ?? "Scheduled" },
      })),
    }],
  };
}

// ── 1. Morning window ─────────────────────────────────────────────────────────

describe("isMorningRunAllowed", () => {
  const TODAY = "2026-06-29";
  const noOutput = null;

  it("1. allows run at 4:44 ET exactly", () => {
    const now = etWallClock(TODAY, 4, 44);
    const result = isMorningRunAllowed(now, noOutput, TODAY);
    assert.equal(result.allowed, true);
  });

  it("2. rejects run at 5:00 ET (outside window)", () => {
    const now = etWallClock(TODAY, 5, 0);
    const result = isMorningRunAllowed(now, noOutput, TODAY);
    assert.equal(result.allowed, false);
  });

  it("3. rejects run when morning already completed today", () => {
    const now = etWallClock(TODAY, 4, 44);
    const output = { date: TODAY, morningGeneratedAt: "2026-06-29T08:44:00.000Z" };
    const result = isMorningRunAllowed(now, output, TODAY);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /already completed/i);
  });

  it("4. DST winter — 4:44 ET = 9:44 UTC (EST = UTC-5)", () => {
    // Feb 1 2026 is EST
    const now = etWallClock("2026-02-01", 4, 44);
    const { hour, minute } = getEtHourMinute(now);
    assert.equal(hour, 4);
    assert.equal(minute, 44);
    // UTC should be 9:44
    assert.equal(now.getUTCHours(), 9);
    assert.equal(now.getUTCMinutes(), 44);
  });

  it("5. DST summer — 4:44 ET = 8:44 UTC (EDT = UTC-4)", () => {
    // Jun 29 2026 is EDT
    const now = etWallClock("2026-06-29", 4, 44);
    const { hour, minute } = getEtHourMinute(now);
    assert.equal(hour, 4);
    assert.equal(minute, 44);
    assert.equal(now.getUTCHours(), 8);
    assert.equal(now.getUTCMinutes(), 44);
  });

  it("allows at tolerance boundary 4:39 ET", () => {
    const now = etWallClock(TODAY, 4, 39);
    assert.equal(isMorningRunAllowed(now, noOutput, TODAY).allowed, true);
  });

  it("allows at tolerance boundary 4:49 ET", () => {
    const now = etWallClock(TODAY, 4, 49);
    assert.equal(isMorningRunAllowed(now, noOutput, TODAY).allowed, true);
  });

  it("rejects at 4:38 ET (just outside tolerance)", () => {
    const now = etWallClock(TODAY, 4, 38);
    assert.equal(isMorningRunAllowed(now, noOutput, TODAY).allowed, false);
  });
});

// ── 2. First-game and target time ─────────────────────────────────────────────

describe("computeLineupTargetTime", () => {
  const TODAY = "2026-06-29";

  it("6. selects earliest active game", () => {
    const sched = fakeSchedule([
      "2026-06-29T23:05:00Z",  // 7:05 PM ET
      "2026-06-29T18:10:00Z",  // 2:10 PM ET — earliest
    ]);
    const { firstGameStart } = computeLineupTargetTime(sched, TODAY);
    assert.equal(firstGameStart.toISOString(), "2026-06-29T18:10:00.000Z");
  });

  it("7. ignores postponed games", () => {
    const sched = fakeSchedule(
      ["2026-06-29T18:10:00Z", "2026-06-29T23:05:00Z"],
      ["Postponed", "Scheduled"],
    );
    const { firstGameStart } = computeLineupTargetTime(sched, TODAY);
    assert.equal(firstGameStart.toISOString(), "2026-06-29T23:05:00.000Z");
  });

  it("8. target time = first game − 2 hours", () => {
    const sched = fakeSchedule(["2026-06-29T23:05:00Z"]);
    const { firstGameStart, targetTime } = computeLineupTargetTime(sched, TODAY);
    assert.equal(targetTime.toISOString(), "2026-06-29T21:05:00.000Z");
    assert.equal(firstGameStart.toISOString(), "2026-06-29T23:05:00.000Z");
  });

  it("13. no-game date returns null", () => {
    const sched = fakeSchedule([]);
    const { firstGameStart, targetTime } = computeLineupTargetTime(sched, TODAY);
    assert.equal(firstGameStart, null);
    assert.equal(targetTime, null);
  });

  it("handles all-postponed slate", () => {
    const sched = fakeSchedule(
      ["2026-06-29T23:05:00Z"],
      ["Postponed"],
    );
    const { firstGameStart } = computeLineupTargetTime(sched, TODAY);
    assert.equal(firstGameStart, null);
  });

  it("17. partial/malformed schedule fails safely (no games key)", () => {
    const { firstGameStart } = computeLineupTargetTime({}, TODAY);
    assert.equal(firstGameStart, null);
  });
});

// ── 3. Lineup-confirmed gate ──────────────────────────────────────────────────

describe("isLineupRunAllowed", () => {
  const TODAY = "2026-06-29";
  const targetTime = new Date("2026-06-29T21:05:00Z");
  const noOutput = null;

  const confirmed9 = Array.from({ length: 9 }, (_, i) => ({ battingOrder: i + 1 }));

  it("9. rejects before target time", () => {
    const now = new Date("2026-06-29T20:00:00Z"); // 1h before target
    const result = isLineupRunAllowed(now, targetTime, true, noOutput, TODAY);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /target time not reached/i);
  });

  it("10. rejects when lineups unconfirmed", () => {
    const now = new Date("2026-06-29T22:00:00Z"); // past target
    const result = isLineupRunAllowed(now, targetTime, false, noOutput, TODAY);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /not yet confirmed/i);
  });

  it("11. allows at/after target with confirmed lineups", () => {
    const now = new Date("2026-06-29T21:05:00Z"); // exactly at target
    const result = isLineupRunAllowed(now, targetTime, true, noOutput, TODAY);
    assert.equal(result.allowed, true);
  });

  it("12. rejects if lineup-confirmed already ran today", () => {
    const now = new Date("2026-06-29T22:00:00Z");
    const output = { date: TODAY, lineupConfirmedGeneratedAt: "2026-06-29T21:05:00Z" };
    const result = isLineupRunAllowed(now, targetTime, true, output, TODAY);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /already completed/i);
  });

  it("13. no-game slate (null targetTime) skips cleanly", () => {
    const now = new Date("2026-06-29T22:00:00Z");
    const result = isLineupRunAllowed(now, null, false, noOutput, TODAY);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /no active mlb games/i);
  });
});

// ── 4. areLineupsConfirmed ────────────────────────────────────────────────────

describe("areLineupsConfirmed", () => {
  it("returns false for empty roster", () => {
    assert.equal(areLineupsConfirmed([]), false);
  });

  it("returns false when fewer than 9 confirmed", () => {
    const r = Array.from({ length: 8 }, (_, i) => ({ battingOrder: i + 1 }));
    assert.equal(areLineupsConfirmed(r), false);
  });

  it("returns true when 9+ players have battingOrder", () => {
    const r = Array.from({ length: 9 }, (_, i) => ({ battingOrder: i + 1 }));
    assert.equal(areLineupsConfirmed(r), true);
  });

  it("ignores players with null battingOrder", () => {
    const r = [
      ...Array.from({ length: 8 }, (_, i) => ({ battingOrder: i + 1 })),
      { battingOrder: null },
    ];
    assert.equal(areLineupsConfirmed(r), false);
  });
});

// ── 5. evaluateGate ───────────────────────────────────────────────────────────

describe("evaluateGate", () => {
  const TODAY = "2026-06-29";
  const sched7pm = fakeSchedule(["2026-06-29T23:05:00Z"]); // 7:05 PM ET
  const confirmed9 = Array.from({ length: 9 }, (_, i) => ({ battingOrder: i + 1 }));

  it("14. force-refresh runs immediately regardless of time or state", () => {
    const now = new Date("2026-06-29T03:00:00Z"); // middle of the night
    const result = evaluateGate("force-refresh", now, null, null, []);
    assert.equal(result.run, true);
    assert.equal(result.updatePhase, "force-refresh");
  });

  it("15. force-refresh does not set lineup-confirmed phase", () => {
    const now = new Date("2026-06-29T15:00:00Z");
    const result = evaluateGate("force-refresh", now, null, sched7pm, confirmed9);
    assert.equal(result.updatePhase, "force-refresh");
    // The phase marker should not be lineup-confirmed
    assert.notEqual(result.updatePhase, "lineup-confirmed");
  });

  it("auto: picks morning during 4:44 ET window", () => {
    const now = etWallClock(TODAY, 4, 44);
    const result = evaluateGate("auto", now, null, sched7pm, []);
    assert.equal(result.run, true);
    assert.equal(result.updatePhase, "morning");
  });

  it("auto: picks lineup-confirmed when past target and lineups ready", () => {
    const now = new Date("2026-06-29T22:00:00Z"); // well past 7:05 PM ET target
    const morningDone = { date: TODAY, morningGeneratedAt: "2026-06-29T08:44:00Z" };
    const result = evaluateGate("auto", now, morningDone, sched7pm, confirmed9);
    assert.equal(result.run, true);
    assert.equal(result.updatePhase, "lineup-confirmed");
  });

  it("auto: does not run when nothing is due", () => {
    const now = new Date("2026-06-29T12:00:00Z"); // midday, nothing due
    const result = evaluateGate("auto", now, null, sched7pm, []);
    assert.equal(result.run, false);
  });

  it("16. ET date used around midnight UTC (midnight UTC = 8 PM ET)", () => {
    // Midnight UTC on 2026-06-30 = 8 PM ET on 2026-06-29
    const now = new Date("2026-06-30T00:00:00Z");
    const etDate = getEtDateString(now);
    assert.equal(etDate, "2026-06-29");
  });

  it("lineup-confirmed mode: respects gate even when phase is explicit", () => {
    const now = new Date("2026-06-29T20:00:00Z"); // before target (21:05 UTC)
    const result = evaluateGate("lineup-confirmed", now, null, sched7pm, confirmed9);
    assert.equal(result.run, false);
    assert.match(result.reason, /target time not reached/i);
  });
});
