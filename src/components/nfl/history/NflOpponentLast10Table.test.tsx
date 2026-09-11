import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import NflYardageOpponentLast10Table from "./NflOpponentLast10Table";
import type { NflYardageOpponentHistory } from "@/lib/nfl/props/types/yardageHistory";

function passingHistory(homeAway: "home" | "away" | null = "home"): NflYardageOpponentHistory {
  return {
    team: "sea",
    market: "passing",
    position: "QB",
    games: [
      {
        gameId: "g1", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
        opponentPlayerId: "00-1", opponentPlayerName: "Test Opp QB", homeAway,
        oppOffRank: 20, oppOffRankPoolSize: 32, oppPlayerYpg: 210.4,
        stat: { completions: 22, attempts: 33, passingTds: 1, interceptions: 1 },
        yardsAllowed: 245, fantasyPointsPpr: 18.9, gameScore: { result: "L", teamScore: 17, oppScore: 24 }, vegasLine: null,
      },
    ],
  };
}

/**
 * Extracts the visible <th> header text, in DOM order, from the desktop
 * (full-column) table -- a separate mobile-compact table also renders
 * alongside it with a smaller fixed column set, so this scopes to the
 * `DenseTableScroller` region rather than querying the whole document.
 */
function headerTexts() {
  const region = screen.getByRole("region", { name: /defense last \d+ vs/i });
  return within(region).getAllByRole("columnheader").map((th) => th.textContent);
}

describe("NflYardageOpponentLast10Table column order", () => {
  it("passing/QB: the approved shared column order with Fantasy PPR Points and OFF Rank, no Score column", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(headerTexts()).toEqual([
      "Date", "Opp QB", "Home/Away", "Comp/Att", "Yards", "TD/INT", "Fantasy PPR Points", "QB YPG", "OFF Rank",
    ]);
  });

  it("passing/QB: never renders a Score / Game Score column", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(headerTexts()).not.toContain("Score");
    expect(headerTexts()).not.toContain("Game Score");
  });

  it("mobile Opp QB cell shows the opposing QB's last name only, next to the team logo slot; desktop keeps the full name", () => {
    const history = passingHistory();
    history.games[0].opponentPlayerName = "Bryce Young";
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={history} currentLine={null} />);
    const mobile = document.querySelector(".md\\:hidden");
    expect(mobile).toBeTruthy();
    expect(mobile!.textContent).toContain("Young");
    expect(mobile!.textContent).not.toContain("Bryce");
    const desktop = screen.getByRole("region", { name: /defense last \d+ vs/i });
    expect(within(desktop).getByText("Bryce Young")).toBeInTheDocument();
  });

  it("passing/QB: Fantasy PPR Points shows the opposing QB's existing nflverse Full PPR value", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(screen.getAllByText("18.9").length).toBeGreaterThan(0);
    // 245*0.04 + 4 - 1 = 12.8 -- a partial recompute, never shown.
    expect(screen.queryByText("12.8")).not.toBeInTheDocument();
  });

  it("passing/QB: Comp/Att and TD/INT footers drop the redundant per-side 'Avg'", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    const region = screen.getByRole("region", { name: /defense last \d+ vs/i });
    expect(within(region).getByText("22.0 / 33.0")).toBeInTheDocument();
    expect(within(region).getByText("1.0 / 1.0")).toBeInTheDocument();
    expect(within(region).queryByText(/Avg 22\.0/)).not.toBeInTheDocument();
  });

  it("never renders a Vegas Line column", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(screen.queryByRole("columnheader", { name: "Vegas Line" })).not.toBeInTheDocument();
  });

  it("OFF Rank renders as an ordinal, never a rank-out-of-32", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(screen.getAllByText("20th").length).toBeGreaterThan(0);
    expect(screen.queryByText(/20\/32/)).not.toBeInTheDocument();
  });

  it('renders a full-text "Home" pill, never an abbreviation', () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory("home")} currentLine={null} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText(/^H$/)).not.toBeInTheDocument();
  });

  it('renders a full-text "Away" pill, never an abbreviation', () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory("away")} currentLine={null} />);
    expect(screen.getByText("Away")).toBeInTheDocument();
    expect(screen.queryByText(/^A$/)).not.toBeInTheDocument();
  });

  it("passing/QB layout has no VS QB AVG column", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(headerTexts()).not.toContain("VS QB AVG");
  });

  it("Opp Off Rank paints heat only when a pool size is available -- N/A rank gets no heat class", () => {
    const history = passingHistory();
    history.games[0].oppOffRank = null;
    history.games[0].oppOffRankPoolSize = null;
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={history} currentLine={null} />);
    // "N/A" also appears in the summary strip's "Current Line" and the footer average -- the
    // heat-painted rank cell is the one wrapped in a span with a weekly-heat-* class.
    const rankCell = screen.getAllByText("N/A").find((el) => el.className.includes("weekly-heat"));
    expect(rankCell?.className).toContain("weekly-heat-missing");
  });

  it('renders a "Last 10 Avg" footer row', () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(screen.getByText("Last 10 Avg")).toBeInTheDocument();
  });

  it("contains horizontal overflow in the shared keyboard-reachable dense-table scroll region", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    const region = screen.getByRole("region", { name: /SEA defense last 1 vs QB/i });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-x-auto");
  });
});
