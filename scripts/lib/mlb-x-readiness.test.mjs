/**
 * mlb-x-readiness.test.mjs
 * Run via: node --test scripts/lib/mlb-x-readiness.test.mjs
 *
 * Previously no dedicated test file existed for this module at all.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReadinessStatus, WaitingReason, formatGameCoverageLogLine, resolvePostingReadiness } from "./mlb-x-readiness.mjs";
import { isAtOrAfterEtClockTime, K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE } from "./mlb-x-slate-timing.mjs";

function timing(overrides = {}) {
  return {
    hasGames: true,
    allGamesStarted: false,
    phase: "POLLING",
    isExpired: false,
    isFinalCutoff: false,
    minutesUntilFirstPitch: 90,
    ...overrides,
  };
}

describe("resolvePostingReadiness -- fail-closed guards", () => {
  it("already posted today short-circuits before anything else", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 10, alreadyPosted: true });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.SKIPPED_ALREADY_POSTED_TODAY);
  });

  it("a failed confirmation source is never ready, even with plenty confirmed", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 10, confirmationSourceFailed: true });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.FAILED_CONFIRMATION_SOURCE);
  });

  it("no games on the slate", () => {
    const result = resolvePostingReadiness({ timing: timing({ hasGames: false }) });
    assert.equal(result.finalStatus, ReadinessStatus.SKIPPED_NO_GAMES);
  });

  it("all games already started", () => {
    const result = resolvePostingReadiness({ timing: timing({ allGamesStarted: true }), confirmedCount: 10 });
    assert.equal(result.finalStatus, ReadinessStatus.SKIPPED_ALL_GAMES_STARTED);
  });

  it("before the polling window opens", () => {
    const result = resolvePostingReadiness({ timing: timing({ phase: "PRE_POLLING" }), confirmedCount: 10 });
    assert.equal(result.finalStatus, ReadinessStatus.WAITING_FOR_POLLING_WINDOW);
  });

  it("past the cutoff with nothing to fall back on", () => {
    const result = resolvePostingReadiness({ timing: timing({ isExpired: true }), confirmedCount: 10 });
    assert.equal(result.finalStatus, ReadinessStatus.SKIPPED_AFTER_CUTOFF);
  });
});

describe("resolvePostingReadiness -- confirmed-count behavior (no game-diversity requirement, default)", () => {
  it("nothing confirmed yet keeps waiting mid-window", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 0 });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.WAITING_FOR_LINEUPS);
  });

  it("nothing confirmed at the final cutoff skips cleanly (not a failure)", () => {
    const result = resolvePostingReadiness({ timing: timing({ isFinalCutoff: true }), confirmedCount: 0 });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.SKIPPED_NO_CONFIRMED_SELECTIONS);
  });

  it("ready as soon as confirmedCount reaches targetCount", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 5 });
    assert.equal(result.ready, true);
    assert.equal(result.finalStatus, ReadinessStatus.READY_CONFIRMED_SELECTIONS);
  });

  it("some confirmed but short of target keeps waiting before the cutoff", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 2, targetCount: 5 });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.WAITING_FOR_LINEUPS);
  });

  it("at the final cutoff, posts whatever is confirmed even short of target (never padded, never silently skipped)", () => {
    const result = resolvePostingReadiness({ timing: timing({ isFinalCutoff: true }), confirmedCount: 2, targetCount: 5, maxTableSize: 5 });
    assert.equal(result.ready, true);
    assert.equal(result.finalStatus, ReadinessStatus.READY_CONFIRMED_SELECTIONS);
    assert.equal(result.selectedCount, 2);
  });

  it("selectedCount is capped at maxTableSize even when confirmedCount is larger", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 20, targetCount: 5, maxTableSize: 5 });
    assert.equal(result.selectedCount, 5);
  });

  it("uses the given waitingReason to select the specific WAITING_FOR_* status", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 0, waitingReason: WaitingReason.OPPOSING_LINEUP });
    assert.equal(result.finalStatus, ReadinessStatus.WAITING_FOR_OPPOSING_LINEUP);
  });

  it("omitting confirmedGameCount/minConfirmedGames preserves the exact prior (count-only) behavior for K/Numerology callers", () => {
    // No game-diversity concept at all -- readiness must depend purely on confirmedCount, unaffected by the new params.
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 5 });
    assert.equal(result.ready, true);
  });
});

describe("resolvePostingReadiness -- confirmedGameCount / minConfirmedGames (fixes the all-one-game HR selection bug)", () => {
  it("a full table from a single confirmed game is NOT ready early when minConfirmedGames requires more diversity", () => {
    const result = resolvePostingReadiness({
      timing: timing(),
      confirmedCount: 9,
      targetCount: 5,
      confirmedGameCount: 1,
      minConfirmedGames: 2,
    });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.WAITING_FOR_LINEUPS);
  });

  it("becomes ready once both the count AND the game-diversity requirement are met", () => {
    const result = resolvePostingReadiness({
      timing: timing(),
      confirmedCount: 9,
      targetCount: 5,
      confirmedGameCount: 2,
      minConfirmedGames: 2,
    });
    assert.equal(result.ready, true);
    assert.equal(result.finalStatus, ReadinessStatus.READY_CONFIRMED_SELECTIONS);
  });

  it("at the final cutoff, still posts from a single confirmed game rather than miss the window entirely", () => {
    const result = resolvePostingReadiness({
      timing: timing({ isFinalCutoff: true }),
      confirmedCount: 9,
      targetCount: 5,
      maxTableSize: 5,
      confirmedGameCount: 1,
      minConfirmedGames: 2,
    });
    assert.equal(result.ready, true);
    assert.equal(result.finalStatus, ReadinessStatus.READY_CONFIRMED_SELECTIONS);
    assert.equal(result.selectedCount, 5);
  });

  it("defaults minConfirmedGames to 1 (no-op) when not passed, even with confirmedGameCount supplied", () => {
    const result = resolvePostingReadiness({
      timing: timing(),
      confirmedCount: 5,
      targetCount: 5,
      confirmedGameCount: 1,
    });
    assert.equal(result.ready, true);
  });
});

describe("resolvePostingReadiness -- coverage reporting fields (confirmedRowsWithoutGameIdentity, scheduledGameCount, confirmedGameCoverage)", () => {
  it("echoes confirmedRowsWithoutGameIdentity onto the result, defaulting to 0", () => {
    const withDefault = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 5 });
    assert.equal(withDefault.confirmedRowsWithoutGameIdentity, 0);

    const withValue = resolvePostingReadiness({
      timing: timing(),
      confirmedCount: 5,
      targetCount: 5,
      confirmedRowsWithoutGameIdentity: 3,
    });
    assert.equal(withValue.confirmedRowsWithoutGameIdentity, 3);
  });

  it("computes scheduledGameCount from timing.gameCount and confirmedGameCoverage as a ratio of it", () => {
    const result = resolvePostingReadiness({
      timing: timing({ gameCount: 15 }),
      confirmedCount: 5,
      targetCount: 5,
      confirmedGameCount: 2,
      minConfirmedGames: 2,
    });
    assert.equal(result.scheduledGameCount, 15);
    assert.equal(result.confirmedGameCount, 2);
    assert.ok(Math.abs(result.confirmedGameCoverage - 2 / 15) < 1e-9);
  });

  it("reports confirmedGameCount/scheduledGameCount/confirmedGameCoverage as null when not applicable (K/Numerology, no timing.gameCount)", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 5 });
    assert.equal(result.confirmedGameCount, null);
    assert.equal(result.scheduledGameCount, null);
    assert.equal(result.confirmedGameCoverage, null);
  });

  it("never claims full coverage from a raw headcount alone -- coverage is confirmedGameCount / scheduledGameCount, not confirmedCount-derived", () => {
    const result = resolvePostingReadiness({
      timing: timing({ isFinalCutoff: true, gameCount: 15 }),
      confirmedCount: 9,
      targetCount: 5,
      maxTableSize: 5,
      confirmedGameCount: 1,
      minConfirmedGames: 2,
    });
    // Posts at the cutoff despite only 1 of 15 games confirmed -- but the
    // coverage field must still honestly report that, not imply "full slate".
    assert.equal(result.ready, true);
    assert.equal(result.confirmedGameCount, 1);
    assert.equal(result.scheduledGameCount, 15);
    assert.ok(Math.abs(result.confirmedGameCoverage - 1 / 15) < 1e-9);
  });
});

describe("formatGameCoverageLogLine", () => {
  it("formats confirmedGames/scheduledGames/coverage/rowsWithoutGameIdentity from a readiness result", () => {
    const readiness = resolvePostingReadiness({
      timing: timing({ gameCount: 15 }),
      confirmedCount: 5,
      targetCount: 5,
      confirmedGameCount: 2,
      minConfirmedGames: 2,
      confirmedRowsWithoutGameIdentity: 1,
    });
    assert.equal(formatGameCoverageLogLine(readiness), "confirmedGames=2 scheduledGames=15 coverage=13% rowsWithoutGameIdentity=1");
  });

  it("renders n/a for fields that don't apply, e.g. a readiness result with no game-diversity concept", () => {
    const readiness = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 5 });
    assert.equal(formatGameCoverageLogLine(readiness), "confirmedGames=n/a scheduledGames=n/a coverage=n/a rowsWithoutGameIdentity=0");
  });

  it("handles a null/undefined readiness gracefully rather than throwing", () => {
    assert.equal(formatGameCoverageLogLine(null), "confirmedGames=n/a scheduledGames=n/a coverage=n/a rowsWithoutGameIdentity=0");
    assert.equal(formatGameCoverageLogLine(undefined), "confirmedGames=n/a scheduledGames=n/a coverage=n/a rowsWithoutGameIdentity=0");
  });
});

describe("resolvePostingReadiness -- earliestPostGuardPassed (K's fixed 11:00 AM ET floor)", () => {
  it("10:59 AM ET (guard not yet passed) blocks readiness even with a fully qualified board", () => {
    const guardPassed = isAtOrAfterEtClockTime(new Date("2026-07-17T14:59:00.000Z"), K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE); // EDT
    const result = resolvePostingReadiness({
      timing: timing(),
      confirmedCount: 5,
      targetCount: 3,
      earliestPostGuardPassed: guardPassed,
    });
    assert.equal(guardPassed, false);
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.WAITING_FOR_EARLIEST_POST_TIME);
  });

  it("11:00 AM ET (guard exactly passed) is eligible", () => {
    const guardPassed = isAtOrAfterEtClockTime(new Date("2026-07-17T15:00:00.000Z"), K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE); // EDT
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: guardPassed });
    assert.equal(guardPassed, true);
    assert.equal(result.ready, true);
    assert.equal(result.finalStatus, ReadinessStatus.READY_CONFIRMED_SELECTIONS);
  });

  it("11:01 AM ET (guard passed) is eligible", () => {
    const guardPassed = isAtOrAfterEtClockTime(new Date("2026-07-17T15:01:00.000Z"), K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE); // EDT
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: guardPassed });
    assert.equal(guardPassed, true);
    assert.equal(result.ready, true);
  });

  it("EST (winter) date: 10:59 AM ET blocked, 11:00 AM ET eligible", () => {
    const before = isAtOrAfterEtClockTime(new Date("2026-01-15T15:59:00.000Z"), K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE);
    const at = isAtOrAfterEtClockTime(new Date("2026-01-15T16:00:00.000Z"), K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE);
    assert.equal(before, false);
    assert.equal(at, true);
    assert.equal(resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: before }).ready, false);
    assert.equal(resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: at }).ready, true);
  });

  it("EDT (summer) date: 10:59 AM ET blocked, 11:00 AM ET eligible", () => {
    const before = isAtOrAfterEtClockTime(new Date("2026-07-17T14:59:00.000Z"), K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE);
    const at = isAtOrAfterEtClockTime(new Date("2026-07-17T15:00:00.000Z"), K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE);
    assert.equal(before, false);
    assert.equal(at, true);
    assert.equal(resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: before }).ready, false);
    assert.equal(resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: at }).ready, true);
  });

  it("a board that would already be ready before 11:00 does NOT post -- the guard blocks it outright", () => {
    // Fully qualified (confirmedCount >= targetCount) -- would be READY without the guard.
    const withoutGuard = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3 });
    assert.equal(withoutGuard.ready, true);
    const withGuard = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: false });
    assert.equal(withGuard.ready, false);
    assert.equal(withGuard.finalStatus, ReadinessStatus.WAITING_FOR_EARLIEST_POST_TIME);
  });

  it("an unready board at/after 11:00 continues polling (WAITING_FOR_LINEUPS), not blocked by the guard", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 1, targetCount: 3, earliestPostGuardPassed: true });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.WAITING_FOR_LINEUPS);
  });

  it("a board that becomes ready later (after the guard passes) posts normally", () => {
    const stillWaiting = resolvePostingReadiness({ timing: timing(), confirmedCount: 1, targetCount: 3, earliestPostGuardPassed: true });
    assert.equal(stillWaiting.ready, false);
    const nowReady = resolvePostingReadiness({ timing: timing(), confirmedCount: 3, targetCount: 3, earliestPostGuardPassed: true });
    assert.equal(nowReady.ready, true);
  });

  it("the existing final cutoff still stops posting even when checked before 11:00 -- SKIPPED_AFTER_CUTOFF, not WAITING_FOR_EARLIEST_POST_TIME", () => {
    // isExpired is checked before the earliestPostGuardPassed guard, so an
    // early slate whose window has already fully closed reports the more
    // informative SKIPPED_AFTER_CUTOFF rather than implying a post might
    // still happen once 11:00 arrives.
    const result = resolvePostingReadiness({ timing: timing({ isExpired: true }), confirmedCount: 5, targetCount: 3, earliestPostGuardPassed: false });
    assert.equal(result.ready, false);
    assert.equal(result.finalStatus, ReadinessStatus.SKIPPED_AFTER_CUTOFF);
  });

  it("the final cutoff's post-what-you-have fallback still applies once the guard has passed", () => {
    const result = resolvePostingReadiness({
      timing: timing({ isFinalCutoff: true }),
      confirmedCount: 1,
      targetCount: 3,
      maxTableSize: 3,
      earliestPostGuardPassed: true,
    });
    assert.equal(result.ready, true);
    assert.equal(result.finalStatus, ReadinessStatus.READY_CONFIRMED_SELECTIONS);
  });

  it("defaults to true (no-op) when omitted -- HR/Numerology callers are entirely unaffected", () => {
    const result = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, targetCount: 3 });
    assert.equal(result.ready, true);
  });
});
