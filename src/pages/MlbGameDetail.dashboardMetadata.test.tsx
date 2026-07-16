/**
 * Focused tests for the two previously-dead MlbGameDetail UI branches that
 * the dashboard-metadata plumbing bug silently suppressed: the "Next
 * refresh" freshness item and the excluded-games (pendingGames) banner.
 *
 * Tests the two small, exported, narrowly-scoped components extracted
 * from HomeSchedule for testability (MlbAnalyticsHubFreshnessHeader,
 * MlbPendingGamesBanner) rather than mounting the full MlbGameDetail page,
 * whose dependency tree (schedule fetch, slate analyzer, Polymarket panel,
 * social tables) is far heavier than these two branches need. Both render
 * byte-identical markup to what HomeSchedule previously inlined.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MlbAnalyticsHubFreshnessHeader, MlbPendingGamesBanner } from "./MlbGameDetail";
import type { HrDashboardPendingGame } from "./MlbHrProps";

function pendingGame(overrides: Partial<HrDashboardPendingGame> = {}): HrDashboardPendingGame {
  return { matchup: "SEA @ TEX", missingPitcherSide: ["SEA"], ...overrides };
}

describe("MlbAnalyticsHubFreshnessHeader — Next refresh", () => {
  it("1. renders 'Next refresh' when a valid nextRunAt is present", () => {
    render(
      <MlbAnalyticsHubFreshnessHeader
        propDate="2026-07-16"
        gamesCount={5}
        generatedAt="2026-07-16T09:32:34.452Z"
        nextRunAt={{ time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" }}
      />,
    );
    expect(screen.getByText("Next refresh:")).toBeTruthy();
    expect(screen.getByText(/1:00\s?PM EDT/)).toBeTruthy();
  });

  it("2. does not render 'Next refresh' when nextRunAt is null", () => {
    render(
      <MlbAnalyticsHubFreshnessHeader
        propDate="2026-07-16"
        gamesCount={5}
        generatedAt="2026-07-16T09:32:34.452Z"
        nextRunAt={null}
      />,
    );
    expect(screen.queryByText("Next refresh:")).toBeNull();
  });

  it("still renders the other freshness items (Slate, Today's games, Last model update) regardless of nextRunAt", () => {
    render(
      <MlbAnalyticsHubFreshnessHeader
        propDate="2026-07-16"
        gamesCount={5}
        generatedAt="2026-07-16T09:32:34.452Z"
        nextRunAt={null}
      />,
    );
    expect(screen.getByText("Slate:")).toBeTruthy();
    expect(screen.getByText("Today's games:")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Last model update:")).toBeTruthy();
  });

  it("preserves the existing 'MLB Analytics Hub' heading and intro copy", () => {
    render(
      <MlbAnalyticsHubFreshnessHeader propDate="2026-07-16" gamesCount={0} generatedAt={null} nextRunAt={null} />,
    );
    expect(screen.getByRole("heading", { name: "MLB Analytics Hub" })).toBeTruthy();
  });
});

describe("MlbPendingGamesBanner — excluded-games banner", () => {
  it("3. renders with the correct count and matchup text when pendingGames is nonempty", () => {
    render(
      <MlbPendingGamesBanner
        pendingGames={[pendingGame({ matchup: "SEA @ TEX" }), pendingGame({ matchup: "BAL @ CHC" })]}
        nextRunAt={{ time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" }}
      />,
    );
    expect(screen.getByText(/2 games excluded/)).toBeTruthy();
    expect(screen.getByText("SEA @ TEX, BAL @ CHC")).toBeTruthy();
  });

  it("uses singular 'game' (not 'games') when exactly one game is pending", () => {
    render(<MlbPendingGamesBanner pendingGames={[pendingGame()]} nextRunAt={null} />);
    expect(screen.getByText(/1 game excluded/)).toBeTruthy();
    expect(screen.queryByText(/1 games excluded/)).toBeNull();
  });

  it("4. does not render when pendingGames is empty", () => {
    const { container } = render(<MlbPendingGamesBanner pendingGames={[]} nextRunAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("5. renders matchup text for every pending game", () => {
    render(
      <MlbPendingGamesBanner
        pendingGames={[pendingGame({ matchup: "SEA @ TEX" }), pendingGame({ matchup: "BAL @ CHC" }), pendingGame({ matchup: "NYY @ BOS" })]}
        nextRunAt={null}
      />,
    );
    expect(screen.getByText("SEA @ TEX, BAL @ CHC, NYY @ BOS")).toBeTruthy();
  });

  it("shows the nextRunAt label in the banner when a valid next run exists", () => {
    render(
      <MlbPendingGamesBanner
        pendingGames={[pendingGame()]}
        nextRunAt={{ time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" }}
      />,
    );
    expect(screen.getByText(/Check back after 1:00 PM ET when the model refreshes\./)).toBeTruthy();
  });

  it("falls back to generic wording when pendingGames exist but nextRunAt is null (no scheduled run left today)", () => {
    render(<MlbPendingGamesBanner pendingGames={[pendingGame()]} nextRunAt={null} />);
    expect(screen.getByText(/These matchups may be added in a future model update\./)).toBeTruthy();
    expect(screen.queryByText(/Check back after/)).toBeNull();
  });
});
