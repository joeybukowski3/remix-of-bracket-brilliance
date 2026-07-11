import { describe, expect, it } from "vitest";
import {
  ReadinessStatus,
  WaitingReason,
  resolvePostingReadiness,
} from "../../../scripts/lib/mlb-x-readiness.mjs";

function timing(overrides: Record<string, unknown> = {}) {
  return {
    hasGames: true,
    allGamesStarted: false,
    isExpired: false,
    isFinalCutoff: false,
    phase: "PREFERRED",
    minutesUntilFirstPitch: 75,
    ...overrides,
  };
}

describe("resolvePostingReadiness fail-closed guards", () => {
  it("already posted → SKIPPED_ALREADY_POSTED_TODAY", () => {
    const r = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, alreadyPosted: true });
    expect(r.finalStatus).toBe(ReadinessStatus.SKIPPED_ALREADY_POSTED_TODAY);
    expect(r.ready).toBe(false);
  });

  it("confirmation source failed → FAILED_CONFIRMATION_SOURCE, never ready", () => {
    const r = resolvePostingReadiness({ timing: timing(), confirmedCount: 5, confirmationSourceFailed: true });
    expect(r.finalStatus).toBe(ReadinessStatus.FAILED_CONFIRMATION_SOURCE);
    expect(r.ready).toBe(false);
  });

  it("no games → SKIPPED_NO_GAMES", () => {
    const r = resolvePostingReadiness({ timing: timing({ hasGames: false, phase: "NO_GAMES" }), confirmedCount: 5 });
    expect(r.finalStatus).toBe(ReadinessStatus.SKIPPED_NO_GAMES);
  });

  it("all games started → SKIPPED_ALL_GAMES_STARTED", () => {
    const r = resolvePostingReadiness({ timing: timing({ allGamesStarted: true }), confirmedCount: 5 });
    expect(r.finalStatus).toBe(ReadinessStatus.SKIPPED_ALL_GAMES_STARTED);
  });

  it("before polling window → WAITING_FOR_POLLING_WINDOW", () => {
    const r = resolvePostingReadiness({ timing: timing({ phase: "PRE_POLLING", minutesUntilFirstPitch: 300 }), confirmedCount: 5 });
    expect(r.finalStatus).toBe(ReadinessStatus.WAITING_FOR_POLLING_WINDOW);
  });

  it("expired (past cutoff) → SKIPPED_AFTER_CUTOFF even with confirmed rows", () => {
    const r = resolvePostingReadiness({ timing: timing({ isExpired: true, phase: "EXPIRED", minutesUntilFirstPitch: 30 }), confirmedCount: 5 });
    expect(r.finalStatus).toBe(ReadinessStatus.SKIPPED_AFTER_CUTOFF);
  });
});

describe("resolvePostingReadiness posting decisions", () => {
  it("full confirmed table in preferred window → READY, publish immediately", () => {
    const r = resolvePostingReadiness({ timing: timing(), confirmedCount: 4, targetCount: 3, maxTableSize: 5 });
    expect(r.finalStatus).toBe(ReadinessStatus.READY_CONFIRMED_SELECTIONS);
    expect(r.ready).toBe(true);
    expect(r.selectedCount).toBe(4);
  });

  it("caps selectedCount at maxTableSize", () => {
    const r = resolvePostingReadiness({ timing: timing(), confirmedCount: 8, targetCount: 3, maxTableSize: 5 });
    expect(r.selectedCount).toBe(5);
  });

  it("some confirmed but short of target before cutoff → keeps waiting for lineups", () => {
    const r = resolvePostingReadiness({ timing: timing(), confirmedCount: 1, targetCount: 3 });
    expect(r.finalStatus).toBe(ReadinessStatus.WAITING_FOR_LINEUPS);
    expect(r.ready).toBe(false);
  });

  it("short of target with opposing-lineup wait reason → WAITING_FOR_OPPOSING_LINEUP", () => {
    const r = resolvePostingReadiness({
      timing: timing(),
      confirmedCount: 1,
      targetCount: 3,
      waitingReason: WaitingReason.OPPOSING_LINEUP,
    });
    expect(r.finalStatus).toBe(ReadinessStatus.WAITING_FOR_OPPOSING_LINEUP);
  });

  it("no confirmed rows before cutoff → WAITING_FOR_VALID_MARKETS when that's the reason", () => {
    const r = resolvePostingReadiness({
      timing: timing(),
      confirmedCount: 0,
      waitingReason: WaitingReason.VALID_MARKETS,
    });
    expect(r.finalStatus).toBe(ReadinessStatus.WAITING_FOR_VALID_MARKETS);
  });

  it("final cutoff with fewer confirmed than target → READY with a smaller table", () => {
    const r = resolvePostingReadiness({
      timing: timing({ isFinalCutoff: true, phase: "FINAL_CUTOFF", minutesUntilFirstPitch: 50 }),
      confirmedCount: 2,
      targetCount: 3,
      maxTableSize: 5,
    });
    expect(r.finalStatus).toBe(ReadinessStatus.READY_CONFIRMED_SELECTIONS);
    expect(r.ready).toBe(true);
    expect(r.selectedCount).toBe(2);
  });

  it("final cutoff with zero confirmed → SKIPPED_NO_CONFIRMED_SELECTIONS", () => {
    const r = resolvePostingReadiness({
      timing: timing({ isFinalCutoff: true, phase: "FINAL_CUTOFF", minutesUntilFirstPitch: 45 }),
      confirmedCount: 0,
      targetCount: 3,
    });
    expect(r.finalStatus).toBe(ReadinessStatus.SKIPPED_NO_CONFIRMED_SELECTIONS);
    expect(r.ready).toBe(false);
  });

  it("reports projectedExcludedCount for the workflow summary", () => {
    const r = resolvePostingReadiness({ timing: timing(), confirmedCount: 3, targetCount: 3, projectedExcludedCount: 7 });
    expect(r.projectedExcludedCount).toBe(7);
    expect(r.minutesUntilFirstPitch).toBe(75);
  });
});
