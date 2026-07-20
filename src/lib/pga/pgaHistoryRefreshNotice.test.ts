import { describe, expect, it } from "vitest";
import { buildRefreshNoticeContent, formatPlayerNameList } from "./pgaHistoryRefreshNotice";
import type { PgaHistoryLastRefresh } from "./historyModel";

function lastRefresh(overrides: Partial<PgaHistoryLastRefresh>): PgaHistoryLastRefresh {
  return {
    attemptedAt: "2026-07-20T12:31:00.000Z",
    asOfDate: "2026-07-20",
    scopeCount: 1,
    successCount: 0,
    failureCount: 1,
    cacheHitCount: 0,
    requestCount: 1,
    status: "partial",
    failedPlayers: [],
    ...overrides,
  };
}

function failure(playerName: string) {
  return { player: playerName, playerId: "1", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "Recent player history could not be refreshed." };
}

describe("formatPlayerNameList", () => {
  it("formats one, two, and three names grammatically", () => {
    expect(formatPlayerNameList(["A"])).toBe("A");
    expect(formatPlayerNameList(["A", "B"])).toBe("A and B");
    expect(formatPlayerNameList(["A", "B", "C"])).toBe("A, B, and C");
  });
});

describe("buildRefreshNoticeContent", () => {
  it("returns null when there is no lastRefresh metadata", () => {
    expect(buildRefreshNoticeContent(null)).toBeNull();
    expect(buildRefreshNoticeContent(undefined)).toBeNull();
  });

  it("returns null when failureCount is zero", () => {
    expect(buildRefreshNoticeContent(lastRefresh({ failureCount: 0, failedPlayers: [] }))).toBeNull();
  });

  it("builds a single-player sentence", () => {
    const content = buildRefreshNoticeContent(lastRefresh({ failedPlayers: [failure("Keita Nakajima")] }));
    expect(content?.summarySentence).toBe("Recent history data excludes the latest update for Keita Nakajima. All other available player histories were refreshed.");
    expect(content?.isCollapsed).toBe(false);
  });

  it("builds a two-player sentence", () => {
    const content = buildRefreshNoticeContent(lastRefresh({ failureCount: 2, failedPlayers: [failure("Keita Nakajima"), failure("Player Two")] }));
    expect(content?.summarySentence).toContain("Keita Nakajima and Player Two");
  });

  it("builds a three-player sentence", () => {
    const content = buildRefreshNoticeContent(lastRefresh({ failureCount: 3, failedPlayers: [failure("A"), failure("B"), failure("C")] }));
    expect(content?.summarySentence).toContain("A, B, and C");
  });

  it("collapses to a count-based sentence for four or more players", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const content = buildRefreshNoticeContent(lastRefresh({ failureCount: names.length, failedPlayers: names.map(failure) }));
    expect(content?.isCollapsed).toBe(true);
    expect(content?.summarySentence).toBe("Recent history data excludes the latest update for 8 players.");
    expect(content?.names).toEqual(names);
  });

  it("includes a formatted Eastern-time refresh timestamp with singular/plural player counts", () => {
    const one = buildRefreshNoticeContent(lastRefresh({ failedPlayers: [failure("Keita Nakajima")] }));
    expect(one?.timestampSentence).toMatch(/^History refreshed .+ with 1 player unavailable$/);

    const two = buildRefreshNoticeContent(lastRefresh({ failureCount: 2, failedPlayers: [failure("A"), failure("B")] }));
    expect(two?.timestampSentence).toMatch(/with 2 players unavailable$/);
  });
});
