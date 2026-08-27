import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NflYardageOpponentLast10Table from "./NflYardageOpponentLast10Table";
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
        yardsAllowed: 245, gameScore: { result: "L", teamScore: 17, oppScore: 24 }, vegasLine: null,
      },
    ],
  };
}

function headerTexts() {
  return screen.getAllByRole("columnheader").map((th) => th.textContent);
}

describe("NflYardageOpponentLast10Table column order", () => {
  it("passing: Date, Opp QB, Home/Away, Opp Off Rank, QB YPG, Pass Yds Allowed, VS QB AVG, Cmp/Att Allowed, TD/INT, Game Score, Vegas Line", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(headerTexts()).toEqual([
      "Date", "Opp QB", "Home/Away", "Opp Off Rank", "QB YPG", "Pass Yds Allowed", "VS QB AVG", "Cmp / Att Allowed", "TD / INT", "Game Score", "Vegas Line",
    ]);
  });

  it("Opp Off Rank renders as an ordinal, never a rank-out-of-32", () => {
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    expect(screen.getByText("20th")).toBeInTheDocument();
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

  it("VS QB AVG is yards allowed minus the QB's entering YPG -- positive means the defense allowed more than that QB's average", () => {
    // 245 allowed - 210.4 entering YPG = +34.6
    render(<NflYardageOpponentLast10Table opponentAbbr="sea" position="QB" history={passingHistory()} currentLine={null} />);
    const [cell] = screen.getAllByText("+34.6");
    expect(cell.getAttribute("data-result")).toBe("over");
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
});
