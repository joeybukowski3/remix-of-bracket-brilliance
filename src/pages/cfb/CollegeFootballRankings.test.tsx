import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  CFB_AP_RANKS_2026,
  CFB_GAMES_2026,
  CFB_STATS_PREVIOUS_SEASON_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM,
  getAllTeams,
} from "@/data/cfb";
import CollegeFootballRankings from "./CollegeFootballRankings";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CollegeFootballRankings />
    </MemoryRouter>,
  );
}

describe("CollegeFootballRankings", () => {
  it("shows all FBS teams by default", () => {
    renderPage();
    const total = getAllTeams().length;
    expect(screen.getByText(new RegExp(`Showing ${total} teams`))).toBeInTheDocument();
  }, 20_000);

  it("shows the AP comparison column from the official poll, never fabricating ranks", () => {
    const { container } = renderPage();
    expect(screen.getByRole("columnheader", { name: "AP" })).toBeInTheDocument();
    // Only officially ranked teams get a number; everyone else renders an em
    // dash. Asserted against the live artifact so this holds both before a poll
    // is published and after each weekly refresh.
    const teams = getAllTeams();
    const ranked = teams.filter((team) => team.ratings.apRank !== null);
    expect(ranked).toHaveLength(Object.keys(CFB_AP_RANKS_2026).length);
    for (const team of ranked) {
      expect(team.ratings.apRank).toBe(CFB_AP_RANKS_2026[team.id]);
    }
    // Unranked teams must still show an em dash, never a fabricated 26+.
    expect(teams.some((team) => team.ratings.apRank === null)).toBe(true);
    expect(container.textContent).toContain("—");
  }, 20_000);

  it("filters by conference", () => {
    renderPage();
    fireEvent.change(screen.getByRole("combobox", { name: "Team field" }), {
      target: { value: "conference" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Conference" }), {
      target: { value: "sec" },
    });
    const secCount = getAllTeams().filter((t) => t.conference === "sec").length;
    expect(screen.getByText(new RegExp(`Showing ${secCount} teams`))).toBeInTheDocument();
  }, 20_000);

  it("switches between advanced-stat values and national ranks", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Offense" }));
    expect(screen.getByRole("columnheader", { name: "PPG" })).toBeInTheDocument();
    expect(screen.getAllByText(/2025 FINAL/i).length).toBeGreaterThan(0);

    const ohioState = getAllTeams().find((team) => team.name === "Ohio State")!;
    const valueCell = container.querySelector(
      `[data-team-id="${ohioState.id}"][data-metric-key="pointsPerGame"]`,
    );
    expect(valueCell).toHaveTextContent(
      CFB_STATS_PREVIOUS_SEASON_BY_TEAM[ohioState.id].pointsPerGame!.toFixed(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "ranks" }));
    const rankCell = container.querySelector(
      `[data-team-id="${ohioState.id}"][data-metric-key="pointsPerGame"]`,
    );
    const expectedRank = CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM[ohioState.id].pointsPerGame;
    expect(rankCell).toHaveTextContent(`#${expectedRank}`);
  }, 20_000);

  it("keeps national ranks invariant under search, Top 25, and conference filters", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Offense" }));
    fireEvent.click(screen.getByRole("button", { name: "ranks" }));
    const selector = '[data-team-id="osu"][data-metric-key="pointsPerGame"]';
    const nationalRank = container.querySelector(selector)?.getAttribute("data-national-rank");
    expect(nationalRank).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search teams…"), {
      target: { value: "Ohio State" },
    });
    expect(container.querySelector(selector)).toHaveAttribute("data-national-rank", nationalRank);

    fireEvent.change(screen.getByRole("combobox", { name: "Team field" }), {
      target: { value: "top25" },
    });
    expect(screen.getByText("Showing 1 team", { exact: false })).toBeInTheDocument();
    expect(container.querySelector(selector)).toHaveAttribute("data-national-rank", nationalRank);

    fireEvent.change(screen.getByRole("combobox", { name: "Team field" }), {
      target: { value: "conference" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Conference" }), {
      target: { value: "big-ten" },
    });
    expect(container.querySelector(selector)).toHaveAttribute("data-national-rank", nationalRank);
  }, 20_000);

  it("updates comparison immediately from schedule-backed matchup shortcuts", () => {
    renderPage();
    const teams = getAllTeams();
    const byId = new Map(teams.map((team) => [team.id, team]));
    const top25Game = CFB_GAMES_2026.find((game) =>
      (byId.get(game.awayTeamId)?.ratings.jkbRank ?? 999) <= 25
      && (byId.get(game.homeTeamId)?.ratings.jkbRank ?? 999) <= 25,
    )!;
    fireEvent.change(screen.getByRole("combobox", { name: "Top 25 matchups" }), {
      target: { value: top25Game.id },
    });
    expect(screen.getByRole("combobox", { name: "Team A" })).toHaveValue(top25Game.awayTeamId);
    expect(screen.getByRole("combobox", { name: "Team B" })).toHaveValue(top25Game.homeTeamId);
    expect(screen.getByTestId("comparison-team-a")).toHaveTextContent(byId.get(top25Game.awayTeamId)!.name);
    expect(screen.getByTestId("comparison-team-b")).toHaveTextContent(byId.get(top25Game.homeTeamId)!.name);

    // Comparison uses the shared registry across every category, labeled 2025 FINAL.
    const comparison = screen.getByRole("table", { name: "Team comparison" });
    for (const label of ["AP", "JKB Power", "SOS Rem", "PPG", "PA/G", "Pass Yds", "Rush Yds", "3D%"]) {
      expect(within(comparison).getByRole("rowheader", { name: label })).toBeInTheDocument();
    }
    expect(comparison).toHaveTextContent(/2025 FINAL/);

    const secGame = CFB_GAMES_2026.find((game) =>
      byId.get(game.awayTeamId)?.conference === "sec"
      && byId.get(game.homeTeamId)?.conference === "sec",
    )!;
    fireEvent.change(screen.getByRole("combobox", { name: "Conference matchup" }), {
      target: { value: secGame.id },
    });
    expect(screen.getByTestId("comparison-team-a")).toHaveTextContent(byId.get(secGame.awayTeamId)!.name);
    expect(screen.getByTestId("comparison-team-b")).toHaveTextContent(byId.get(secGame.homeTeamId)!.name);
    // Only the most recently used shortcut stays selected (no stale selection).
    expect(screen.getByRole("combobox", { name: "Top 25 matchups" })).toHaveValue("");
  }, 20_000);
});
