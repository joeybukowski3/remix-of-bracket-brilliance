import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PgaPlayerHistoryRefreshNotice from "./PgaPlayerHistoryRefreshNotice";
import type { PgaHistoryLastRefresh } from "@/lib/pga/historyModel";

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

describe("PgaPlayerHistoryRefreshNotice", () => {
  it("renders nothing after a complete refresh", () => {
    const { container } = render(<PgaPlayerHistoryRefreshNotice lastRefresh={lastRefresh({ failureCount: 0, failedPlayers: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when lastRefresh is absent", () => {
    const { container } = render(<PgaPlayerHistoryRefreshNotice lastRefresh={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a one-player notice naming the player", () => {
    render(<PgaPlayerHistoryRefreshNotice lastRefresh={lastRefresh({ failedPlayers: [failure("Keita Nakajima")] })} />);
    expect(screen.getByText(/excludes the latest update for Keita Nakajima/)).toBeInTheDocument();
    expect(screen.getByText(/All other available player histories were refreshed/)).toBeInTheDocument();
  });

  it("shows a multi-player notice with grammatical joining", () => {
    render(<PgaPlayerHistoryRefreshNotice lastRefresh={lastRefresh({ failureCount: 2, failedPlayers: [failure("Keita Nakajima"), failure("Player Two")] })} />);
    expect(screen.getByText(/Keita Nakajima and Player Two/)).toBeInTheDocument();
  });

  it("collapses a large failure list behind an accessible disclosure", () => {
    const names = ["A", "B", "C", "D", "E"];
    render(<PgaPlayerHistoryRefreshNotice lastRefresh={lastRefresh({ failureCount: names.length, failedPlayers: names.map(failure) })} />);

    expect(screen.getByText("Recent history data excludes the latest update for 5 players.")).toBeInTheDocument();
    const disclosure = screen.getByText("View affected players");
    expect(disclosure.tagName.toLowerCase()).toBe("summary");
    expect(disclosure.closest("details")).not.toHaveAttribute("open");
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("does not render internal error codes or raw messages", () => {
    render(<PgaPlayerHistoryRefreshNotice lastRefresh={lastRefresh({ failedPlayers: [failure("Keita Nakajima")] })} />);
    expect(screen.queryByText(/PGA_HISTORY_FETCH_FAILED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/history-fetch/)).not.toBeInTheDocument();
  });

  it("includes a formatted refresh timestamp", () => {
    render(<PgaPlayerHistoryRefreshNotice lastRefresh={lastRefresh({ failedPlayers: [failure("Keita Nakajima")] })} />);
    expect(screen.getByText(/^History refreshed .+ with 1 player unavailable$/)).toBeInTheDocument();
  });

  it("uses warning styling rather than fatal-error styling", () => {
    const { container } = render(<PgaPlayerHistoryRefreshNotice lastRefresh={lastRefresh({ failedPlayers: [failure("Keita Nakajima")] })} />);
    const section = container.querySelector("section");
    expect(section?.className).toContain("amber");
    expect(section).toHaveAttribute("role", "status");
  });
});
