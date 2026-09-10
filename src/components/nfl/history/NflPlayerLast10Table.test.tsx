import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import NflYardagePlayerLast10Table from "./NflPlayerLast10Table";
import type { NflYardagePlayerHistory } from "@/lib/nfl/props/types/yardageHistory";

function passingHistory(): NflYardagePlayerHistory {
  return {
    playerId: "gsis:1",
    playerName: "Drake Maye",
    market: "passing",
    position: "QB",
    games: [
      {
        gameId: "g1", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
        opponentAbbr: "mia", homeAway: "home", oppDefRank: 14, oppDefRankPoolSize: 32, oppYdsAllowAvg: 230.3,
        stat: { completions: 14, attempts: 18, passingTds: 1, interceptions: 0 },
        actualYards: 276, fantasyPointsPpr: 22.34, gameScore: { result: "W", teamScore: 38, oppScore: 10 }, vegasLine: 233.5,
      },
    ],
  };
}

function rushingHistory(): NflYardagePlayerHistory {
  return {
    playerId: "gsis:2",
    playerName: "Rhamondre Stevenson",
    market: "rushing",
    position: "RB",
    games: [
      {
        gameId: "g2", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
        opponentAbbr: "mia", homeAway: "away", oppDefRank: 9, oppDefRankPoolSize: 32, oppYdsAllowAvg: 98.1,
        stat: { rushAttempts: 18, rushTds: 1 },
        actualYards: 88, gameScore: { result: "L", teamScore: 10, oppScore: 24 }, vegasLine: null,
      },
    ],
  };
}

function receivingHistory(): NflYardagePlayerHistory {
  return {
    playerId: "gsis:3",
    playerName: "Test WR",
    market: "receiving",
    position: "WR",
    games: [
      {
        gameId: "g3", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
        opponentAbbr: "mia", homeAway: "home", oppDefRank: 22, oppDefRankPoolSize: 32, oppYdsAllowAvg: 65.4,
        stat: { targets: 8, receptions: 5, recTds: 1 },
        actualYards: 71, gameScore: { result: "W", teamScore: 20, oppScore: 17 }, vegasLine: null,
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
  const region = screen.getByRole("region", { name: /last \d+ games?/i });
  return within(region).getAllByRole("columnheader").map((th) => th.textContent);
}

describe("NflYardagePlayerLast10Table column order", () => {
  it("passing/QB: the approved shared column order with Fantasy PPR Points and no Score column", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    expect(headerTexts()).toEqual([
      "Date", "Opponent", "Comp/Att", "Yards", "TD/INT", "Fantasy PPR Points", "Avg. Yards Allowed", "vs AVG", "Def Rank",
    ]);
  });

  it("passing/QB: never renders a Score / Game Score column", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    expect(headerTexts()).not.toContain("Score");
    expect(headerTexts()).not.toContain("Game Score");
  });

  it("mobile Player Last 10 opponent cell shows vs/@ + a team logo, never the opponent abbreviation", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    const mobile = document.querySelector(".md\\:hidden");
    expect(mobile).toBeTruthy();
    expect(mobile!.querySelector("img")).toBeTruthy();
    expect(mobile!.textContent).toContain("vs");
    expect(mobile!.textContent).not.toContain("MIA");
  });

  it("rushing keeps its Game Score column", () => {
    render(<NflYardagePlayerLast10Table playerName="Rhamondre Stevenson" history={rushingHistory()} currentLine={null} />);
    expect(headerTexts()).toContain("Game Score");
  });

  it("passing/QB: Fantasy PPR Points shows the existing nflverse Full PPR value, not a recomputed total", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    // artifact value is 22.34; a naive per-market DK-ish recompute (276*0.04 + 4) would be 15.04.
    expect(screen.getAllByText("22.3").length).toBeGreaterThan(0);
    expect(screen.queryByText("15.0")).not.toBeInTheDocument();
  });

  it("passing/QB: Comp/Att and TD/INT footers drop the redundant per-side 'Avg'", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    const region = screen.getByRole("region", { name: /last \d+ games?/i });
    expect(within(region).getByText("14.0 / 18.0")).toBeInTheDocument();
    expect(within(region).getByText("1.0 / 0.0")).toBeInTheDocument();
    expect(within(region).queryByText(/Avg 14\.0/)).not.toBeInTheDocument();
  });

  it("rushing: Date, Opponent, Opp Def Rank, Opp Yds Allow Avg, Rush Yds, VS OPP AVG, Rush Att, Rush TD, Game Score -- no Vegas Line or Fantasy Pts", () => {
    render(<NflYardagePlayerLast10Table playerName="Rhamondre Stevenson" history={rushingHistory()} currentLine={null} />);
    expect(headerTexts()).toEqual([
      "Date", "Opponent", "Opp Def Rank", "Opp Yds Allow Avg", "Rush Yds", "VS OPP AVG", "Rush Att", "Rush TD", "Game Score",
    ]);
  });

  it("receiving: Date, Opponent, Opp Def Rank, Opp Yds Allow Avg, Rec Yds, VS OPP AVG, Targets/Rec, Rec TD, Game Score -- no Vegas Line or Fantasy Pts", () => {
    render(<NflYardagePlayerLast10Table playerName="Test WR" history={receivingHistory()} currentLine={null} />);
    expect(headerTexts()).toEqual([
      "Date", "Opponent", "Opp Def Rank", "Opp Yds Allow Avg", "Rec Yds", "VS OPP AVG", "Targets / Rec", "Rec TD", "Game Score",
    ]);
  });

  it("Opp Def Rank renders as an ordinal, never a rank-out-of-32", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    expect(screen.getAllByText("14th").length).toBeGreaterThan(0);
    expect(screen.queryByText(/14\/32/)).not.toBeInTheDocument();
  });

  it("actual yards over TODAY's current line renders as a green/over result", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    const [cell] = screen.getAllByText("276");
    expect(cell.getAttribute("data-result")).toBe("over");
  });

  it("no current line renders yardage neutral, never fabricating an over/under result", () => {
    render(<NflYardagePlayerLast10Table playerName="Rhamondre Stevenson" history={rushingHistory()} currentLine={null} />);
    const [cell] = screen.getAllByText("88");
    expect(cell.getAttribute("data-result")).toBe("neutral");
  });

  it("VS OPP AVG is actual yards minus Opp Yds Allow Avg, positive/green, and ignores the current line entirely", () => {
    // 276 actual - 230.3 opp avg = +45.7, computed the same whether or not a current line exists.
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={null} />);
    const [cell] = screen.getAllByText("+45.7");
    expect(cell.getAttribute("data-result")).toBe("over");
  });

  it("never renders a Vegas Line column, and never a recomputed single-market total", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    expect(screen.queryByRole("columnheader", { name: "Vegas Line" })).not.toBeInTheDocument();
    // 276 * 0.04 + 1 * 4 = 15.04 -- a partial single-market recompute, never shown.
    expect(screen.queryByText("15.0")).not.toBeInTheDocument();
  });

  it("rushing keeps its original columns -- no Fantasy PPR Points column", () => {
    render(<NflYardagePlayerLast10Table playerName="Rhamondre Stevenson" history={rushingHistory()} currentLine={null} />);
    expect(headerTexts()).not.toContain("Fantasy PPR Points");
  });

  it("VS OPP AVG is negative/red when actual yards trail the opponent's allowed average", () => {
    // 88 actual - 98.1 opp avg = -10.1
    render(<NflYardagePlayerLast10Table playerName="Rhamondre Stevenson" history={rushingHistory()} currentLine={null} />);
    const [cell] = screen.getAllByText("-10.1");
    expect(cell.getAttribute("data-result")).toBe("under");
  });

  it("Opp Def Rank paints heat only when a pool size is available -- N/A rank gets no heat class", () => {
    const history = passingHistory();
    history.games[0].oppDefRank = null;
    history.games[0].oppDefRankPoolSize = null;
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={history} currentLine={null} />);
    // "N/A" also appears in the summary strip's "Current Line" and, since this game's rank is
    // its only game, the footer average -- the heat-painted rank cell is the one wrapped in a span.
    const rankCell = screen.getAllByText("N/A").find((el) => el.className.includes("weekly-heat"));
    expect(rankCell?.className).toContain("weekly-heat-missing");
  });

  it('renders a "Last 10 Avg" footer row', () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    expect(screen.getByText("Last 10 Avg")).toBeInTheDocument();
  });

  it("contains horizontal overflow in the shared keyboard-reachable dense-table scroll region", () => {
    render(<NflYardagePlayerLast10Table playerName="Drake Maye" history={passingHistory()} currentLine={233.5} />);
    const region = screen.getByRole("region", { name: /Drake Maye last 1 game/i });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-x-auto");
  });
});
