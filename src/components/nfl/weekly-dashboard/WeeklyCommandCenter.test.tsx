import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import WeeklyCommandCenter from "@/components/nfl/weekly-dashboard/WeeklyCommandCenter";
import {
  buildWeekOpponentMap,
  buildWeeklyRankingRows,
  WEEKLY_RANKING_POSITIONS,
} from "@/lib/fantasy/weeklyRankings";
import type { CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import type { MarketArtifact } from "@/lib/nfl/marketData";
import type { ProjectionsArtifact } from "@/lib/nfl/projectionData";
import type { CanonicalNflTeam, NflGameRecord } from "@/lib/nfl/standings";
import { buildWeeklyDashboard } from "@/lib/nfl/weeklyDashboard";

function fixture<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as T;
}

const games = fixture<{ games: NflGameRecord[] }>("public/data/nfl/2026/games.json").games;
const teams = fixture<{ teams: CanonicalNflTeam[] }>("public/data/nfl/teams.json").teams;
const market = fixture<MarketArtifact>("public/data/nfl/matchup-market.json");
const projections = fixture<ProjectionsArtifact>("public/data/nfl/matchup-projections.json");
const ratings: CurrentRatingRow[] = teams.map((team, index) => ({
  abbr: team.abbr,
  team: team.name,
  division: team.division,
  rating: 80 - index,
  rank: index + 1,
  offenseRating: 79 - index,
  offenseRank: index + 1,
  defenseRating: 78 - index,
  defenseRank: index + 1,
  performanceRating: null,
  performanceRank: null,
  gamesPlayed: 0,
  preseasonWeight: 1,
  performanceWeight: 0,
  state: "preseason",
  preseasonV04Rating: 80 - index,
  preseasonOffenseRating: 79 - index,
  preseasonDefenseRating: 78 - index,
}));
const opponentMap = buildWeekOpponentMap(games, 1);
const fantasyRows = Object.fromEntries(
  WEEKLY_RANKING_POSITIONS.map((position) => [position, buildWeeklyRankingRows(position, opponentMap, () => null)]),
);
const dashboard = buildWeeklyDashboard({
  season: 2026,
  week: 1,
  games,
  teams,
  marketArtifact: market,
  projectionsArtifact: projections,
  currentRatings: ratings,
  fantasyRows,
});

function renderDashboard(overrides: Partial<React.ComponentProps<typeof WeeklyCommandCenter>> = {}) {
  const props = {
    dashboard,
    weeks: [1, 2, 3],
    scheduleMeta: null,
    invalidQuery: false,
    artifactErrors: [],
    onWeekChange: vi.fn(),
    ...overrides,
  };
  return {
    ...render(<MemoryRouter><WeeklyCommandCenter {...props} /></MemoryRouter>),
    props,
  };
}

describe("WeeklyCommandCenter", () => {
  it("renders the compact week header and changes week through the selector", () => {
    const { props } = renderDashboard();
    expect(screen.getByRole("heading", { name: "NFL Week 1" })).toBeTruthy();
    expect(screen.getByText(/16 games/i)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Select NFL week" }), { target: { value: "2" } });
    expect(props.onWeekChange).toHaveBeenCalledWith(2);
  });

  it("renders every game and canonical matchup links in desktop and mobile boards", () => {
    renderDashboard();
    const openerLinks = screen.getAllByRole("link", { name: /New England Patriots at Seattle Seahawks matchup details/i });
    expect(openerLinks.length).toBeGreaterThanOrEqual(2);
    expect(openerLinks.every((link) => link.getAttribute("href") === "/nfl/matchups/new-england-patriots-at-seattle-seahawks")).toBe(true);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("renders Model vs Market gaps without pick or best-bet language", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "Largest Model-vs-Market Gaps" })).toBeTruthy();
    expect(screen.getByText(/descriptive comparison · not picks/i)).toBeTruthy();
    expect(screen.queryByText(/best bet/i)).toBeNull();
    const logoPairs = screen.getAllByTestId("gap-team-logos");
    expect(logoPairs).toHaveLength(5);
    expect(logoPairs.every((pair) => pair.querySelectorAll("img").length === 2)).toBe(true);
  });

  it("frames fantasy rows as Week 1 position picks and links to the full rankings", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeTruthy();
    expect(screen.getByText(/top 5 per position from the canonical weekly rankings/i)).toBeTruthy();
    const selector = screen.getByRole("group", { name: "Fantasy position" });
    fireEvent.click(within(selector).getByRole("button", { name: "WR" }));
    expect(within(selector).getByRole("button", { name: "WR" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "View full rankings" }).getAttribute("href")).toBe("/fantasy-football/weekly-rankings");
    expect(screen.getByTestId("desktop-fantasy-leaders")).not.toHaveAttribute("aria-hidden");
  });

  it("shows the canonical highest market total in the middle headline tile", () => {
    renderDashboard();
    expect(screen.getByText("Highest Market Total")).toBeTruthy();
    expect(screen.getByText(/^[A-Z]{2,3}\/[A-Z]{2,3} \d/)).toBeTruthy();
    expect(screen.queryByText("Highest-Rated Team Playing")).toBeNull();
    expect(screen.queryByText("Largest Total Gap")).toBeNull();
  });

  it("shows a clear unavailable state when the week has no market total", () => {
    const unavailableDashboard = {
      ...dashboard,
      highlights: { ...dashboard.highlights, highestMarketTotal: null },
    };
    renderDashboard({ dashboard: unavailableDashboard });
    const signals = screen.getByRole("region", { name: "Weekly headline signals" });
    expect(within(signals).getByText("Unavailable")).toBeTruthy();
    expect(within(signals).getByText("No market total available")).toBeTruthy();
  });

  it("provides Power Ratings and deeper NFL navigation funnels", () => {
    renderDashboard();
    expect(screen.getByRole("link", { name: "All 32" }).getAttribute("href")).toBe("/nfl/power-ratings");
    expect(screen.getByRole("link", { name: /Team Schedules/i }).getAttribute("href")).toBe("/nfl/team-schedules");
    expect(screen.getByRole("link", { name: /Performance Analytics/i }).getAttribute("href")).toBe("/nfl/analytics");
  });

  it("keeps the core mobile board compact without a horizontal-scroll contract", () => {
    renderDashboard();
    const mobile = screen.getByTestId("mobile-game-board");
    expect(mobile.className).not.toContain("overflow-x");
    expect(mobile.querySelectorAll("a")).toHaveLength(16);
    expect(mobile.textContent).toContain("Market");
    expect(mobile.textContent).toContain("JKB");
    expect(mobile.textContent).toContain("Gap");
  });

  it("surfaces partial artifact failure without suppressing available modules", () => {
    renderDashboard({ artifactErrors: ["Market unavailable"] });
    expect(screen.getByRole("status")).toHaveTextContent(/supporting data is unavailable/i);
    expect(screen.getByRole("heading", { name: "Weekly Game Board" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeTruthy();
  });
});
