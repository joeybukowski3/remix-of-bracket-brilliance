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

  it("defaults to RANKS, switches to VALUES, and keeps the mode across category changes", () => {
    const { container } = renderPage();
    expect(screen.getByRole("button", { name: "ranks" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "values" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Offense" }));
    expect(screen.getByRole("columnheader", { name: "PPG" })).toBeInTheDocument();
    expect(screen.getAllByText(/2025 FINAL/i).length).toBeGreaterThan(0);

    const ohioState = getAllTeams().find((team) => team.name === "Ohio State")!;
    const selector = `[data-team-id="${ohioState.id}"][data-metric-key="pointsPerGame"]`;
    const expectedRank = CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM[ohioState.id].pointsPerGame;
    // Category change did not reset the default RANKS mode.
    expect(screen.getByRole("button", { name: "ranks" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(selector)).toHaveTextContent(`#${expectedRank}`);
    const rankTier = container.querySelector(selector)!.getAttribute("data-rank-tier");

    fireEvent.click(screen.getByRole("button", { name: "values" }));
    expect(screen.getByRole("button", { name: "values" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(selector)).toHaveTextContent(
      CFB_STATS_PREVIOUS_SEASON_BY_TEAM[ohioState.id].pointsPerGame!.toFixed(1),
    );
    // Same national-rank tier in Values mode: no contradictory colors between modes.
    expect(container.querySelector(selector)).toHaveAttribute("data-rank-tier", rankTier!);

    fireEvent.click(screen.getByRole("button", { name: "Defense" }));
    expect(screen.getByRole("button", { name: "values" })).toHaveAttribute("aria-pressed", "true");
  }, 20_000);

  it("colors main-table cells with the JKB rank-tier palette without green", () => {
    const { container } = renderPage();
    const cells = container.querySelectorAll("[data-metric-key='jkbPowerRating']");
    const tiers = new Set(Array.from(cells).map((cell) => cell.getAttribute("data-rank-tier")));
    expect(tiers.has("elite")).toBe(true);
    expect(tiers.has("poor")).toBe(true);
    expect(container.innerHTML).not.toMatch(/emerald|lime-/);
  }, 20_000);

  it("shows the canonical team record inside the TEAM cell", () => {
    const { container } = renderPage();
    const team = getAllTeams().find((item) => item.id === "osu")!;
    const record = container.querySelector(`[data-team-record="${team.id}"]`);
    expect(record).toHaveTextContent(`${team.record.wins}-${team.record.losses}`);
    expect(record?.closest("td")).toHaveClass("sticky");
    expect(container.querySelectorAll("th[scope='col']").length).toBeLessThan(10);
  }, 20_000);

  it("keeps national ranks invariant under search, Top 25, and conference filters", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Offense" }));
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
    expect(comparison).not.toHaveTextContent(/FBS/);
    expect(comparison).toHaveTextContent(/· #\d+/);

    // Identity blocks carry the canonical record and a team-color tint.
    for (const [testId, id] of [["comparison-team-a", top25Game.awayTeamId], ["comparison-team-b", top25Game.homeTeamId]] as const) {
      const team = byId.get(id)!;
      expect(screen.getByTestId(`${testId}-record`)).toHaveTextContent(`${team.record.wins}-${team.record.losses}`);
      expect(screen.getByTestId(testId).style.borderTop).toContain("3px solid");
    }

    // Comparison cells use the same rank-tier palette as the table.
    const leftJkb = comparison.querySelector("[data-compare-side='left'][data-metric-key='jkbPowerRating']")!;
    const rightJkb = comparison.querySelector("[data-compare-side='right'][data-metric-key='jkbPowerRating']")!;
    expect(leftJkb).toHaveAttribute("data-rank-tier");
    expect(leftJkb.getAttribute("data-rank-tier")).not.toBe("unavailable");

    // Advantage check sits on the side with the lower (better) national rank only.
    const leftRank = Number(leftJkb.getAttribute("data-national-rank"));
    const rightRank = Number(rightJkb.getAttribute("data-national-rank"));
    const jkbRow = leftJkb.closest("tr")!;
    expect(jkbRow.querySelectorAll("[data-advantage]")).toHaveLength(leftRank === rightRank ? 0 : 1);
    expect(jkbRow.querySelector(`[data-advantage='${leftRank < rightRank ? "left" : "right"}']`)).not.toBeNull();
    // Unranked AP (no national rank) never gets a check.
    const apRow = comparison.querySelector("[data-metric-key='apRank']")!.closest("tr")!;
    expect(apRow.querySelectorAll("[data-advantage]")).toHaveLength(0);

    // Schedule context only from the schedule artifact: everything is scheduled, so no fabricated result.
    expect(screen.getByTestId("comparison-team-a").querySelector("[data-game-line='next']")).not.toBeNull();
    expect(screen.getByTestId("comparison-team-a").querySelector("[data-game-line='last']")).toBeNull();

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
