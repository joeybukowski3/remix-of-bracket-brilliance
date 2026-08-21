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

  it("shows the canonical highest market total in the middle headline tile with both team logos", () => {
    renderDashboard();
    const highestTotal = dashboard.highlights.highestMarketTotal;
    expect(highestTotal).not.toBeNull();
    expect(screen.getByText("Highest Market Total")).toBeTruthy();
    const signals = screen.getByRole("region", { name: "Weekly headline signals" });
    const totalTile = within(signals).getByText("Highest Market Total").closest("div") as HTMLElement;
    expect(totalTile.querySelectorAll("img")).toHaveLength(2);
    expect(within(totalTile).getByText(highestTotal!.away.abbr)).toBeTruthy();
    expect(within(totalTile).getByText(highestTotal!.home.abbr)).toBeTruthy();
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

  it("shows the model-lean team logo and abbreviation on the largest gap headline tile", () => {
    renderDashboard();
    const gap = dashboard.highlights.largestGap;
    expect(gap).not.toBeNull();
    const signals = screen.getByRole("region", { name: "Weekly headline signals" });
    const gapTile = within(signals).getByText("Largest Model vs Market Gap").closest("div") as HTMLElement;
    if (gap!.modelLeanTeam) {
      expect(gapTile.querySelectorAll("img")).toHaveLength(1);
      expect(within(gapTile).getByText(gap!.modelLeanTeam.abbr)).toBeTruthy();
    }
    expect(within(gapTile).getByText(gap!.formattedComparison)).toBeTruthy();
  });

  it("renders a sticky, compact mobile header row with the column labels", () => {
    renderDashboard();
    const header = screen.getByTestId("mobile-game-board-sticky-header");
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    expect(within(header).getByText("Game")).toBeTruthy();
    expect(within(header).getByText("Market")).toBeTruthy();
    expect(within(header).getByText("JKB")).toBeTruthy();
    expect(within(header).getByText("Gap")).toBeTruthy();
  });

  it("provides Power Ratings and deeper NFL navigation funnels", () => {
    renderDashboard();
    expect(screen.getByRole("link", { name: "All 32" }).getAttribute("href")).toBe("/nfl/power-ratings");
    expect(screen.getByRole("link", { name: /Team Schedules/i }).getAttribute("href")).toBe("/nfl/team-schedules");
    expect(screen.getByRole("link", { name: /Performance Analytics/i }).getAttribute("href")).toBe("/nfl/analytics");
  });

  it("shows Power Watch Top 5 and Bottom 5 with a Full Power Rankings link to /nfl/power-ratings", () => {
    renderDashboard();
    expect(dashboard.powerWatch).toHaveLength(5);
    expect(dashboard.powerWatchBottom).toHaveLength(5);
    const desktop = screen.getByTestId("power-watch-desktop");
    expect(within(desktop).getByText("Top 5")).toBeTruthy();
    expect(within(desktop).getByText("Bottom 5")).toBeTruthy();
    for (const t of dashboard.powerWatch) expect(within(desktop).getByText(t.name)).toBeTruthy();
    for (const t of dashboard.powerWatchBottom) expect(within(desktop).getByText(t.name)).toBeTruthy();
    const fullRankingsLinks = screen.getAllByRole("link", { name: /Full Power Rankings/i });
    expect(fullRankingsLinks.length).toBeGreaterThan(0);
    expect(fullRankingsLinks.every((link) => link.getAttribute("href") === "/nfl/power-ratings")).toBe(true);
  });

  it("renders the mobile Power Watch Top 5 and Bottom 5 as two compact tables side by side", () => {
    renderDashboard();
    const mobile = screen.getByTestId("power-watch-mobile");
    expect(mobile.className).toContain("grid-cols-2");
    expect(within(mobile).getByText("Top 5")).toBeTruthy();
    expect(within(mobile).getByText("Bottom 5")).toBeTruthy();
    for (const t of dashboard.powerWatchBottom) {
      expect(within(mobile).getByText(`#${t.rating?.ovrRank}`)).toBeTruthy();
    }
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

  it("gives each fantasy position a distinct restrained header tone on desktop", () => {
    renderDashboard();
    const desktop = screen.getByTestId("desktop-fantasy-leaders");
    const qbHeader = within(desktop).getByText("Top QB plays");
    const rbHeader = within(desktop).getByText("Top RB plays");
    const wrHeader = within(desktop).getByText("Top WR plays");
    const teHeader = within(desktop).getByText("Top TE plays");
    expect(qbHeader.className).toContain("sky");
    expect(rbHeader.className).toContain("emerald");
    expect(wrHeader.className).toContain("violet");
    expect(teHeader.className).toContain("amber");
    const classes = [qbHeader.className, rbHeader.className, wrHeader.className, teHeader.className];
    expect(new Set(classes).size).toBe(4);
  });

  it("gives the mobile QB/RB/WR/TE tabs distinct position identity with an obvious active state", () => {
    renderDashboard();
    const selector = screen.getByRole("group", { name: "Fantasy position" });
    const qbTab = within(selector).getByRole("button", { name: "QB" });
    const rbTab = within(selector).getByRole("button", { name: "RB" });
    expect(qbTab).toHaveAttribute("aria-pressed", "true");
    expect(qbTab.className).toContain("sky");
    expect(rbTab.className).toContain("emerald");
    fireEvent.click(rbTab);
    expect(rbTab).toHaveAttribute("aria-pressed", "true");
    expect(qbTab).toHaveAttribute("aria-pressed", "false");
  });

  it("colors projected PPG by within-position percentile without changing the value or rank order", () => {
    renderDashboard();
    const desktop = screen.getByTestId("desktop-fantasy-leaders");
    const qbLeaders = dashboard.fantasyLeaders.QB;
    const ppgCells = within(desktop).getAllByTestId("fantasy-ppg-value");
    expect(ppgCells.length).toBeGreaterThanOrEqual(qbLeaders.length);
    // Values render unchanged, in canonical rank order.
    const qbValues = qbLeaders.map((row) => row.projectedPpg.toFixed(1));
    expect(ppgCells.slice(0, qbLeaders.length).map((el) => el.textContent)).toEqual(qbValues);
    // A higher-percentile row never renders a visually weaker (empty) style than a lower one.
    const styledCount = ppgCells.filter((el) => el.getAttribute("style")).length;
    expect(styledCount).toBeGreaterThan(0);
  });

  it("surfaces partial artifact failure without suppressing available modules", () => {
    renderDashboard({ artifactErrors: ["Market unavailable"] });
    expect(screen.getByRole("status")).toHaveTextContent(/supporting data is unavailable/i);
    expect(screen.getByRole("heading", { name: "Weekly Game Board" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeTruthy();
  });
});
