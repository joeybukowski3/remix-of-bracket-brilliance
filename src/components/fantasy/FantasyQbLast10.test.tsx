import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { NflYardageHistoryArtifact } from "@/lib/nfl/props/types/yardageHistory";

const mockHistory = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useNflYardageHistory", () => ({ useNflYardageHistory: mockHistory }));

import FantasyQbLast10 from "./FantasyQbLast10";

function artifact(): NflYardageHistoryArtifact {
  const passingPlayerGame = {
    gameId: "g1", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
    opponentAbbr: "mia", homeAway: "home" as const, oppDefRank: 14, oppDefRankPoolSize: 32, oppYdsAllowAvg: 230.3,
    stat: { completions: 14, attempts: 18, passingTds: 1, interceptions: 0 },
    actualYards: 276, fantasyPointsPpr: 22.34,
    gameScore: { result: "W" as const, teamScore: 38, oppScore: 10 }, vegasLine: null,
  };
  const oppGame = {
    gameId: "g2", season: 2025, week: 17, dateUtc: "2025-12-28T18:00:00.000Z",
    opponentPlayerId: "gsis:00-9", opponentPlayerName: "Opposing QB", homeAway: "away" as const,
    oppOffRank: 20, oppOffRankPoolSize: 32, oppPlayerYpg: 210.4,
    stat: { completions: 22, attempts: 33, passingTds: 2, interceptions: 1 },
    yardsAllowed: 245, fantasyPointsPpr: 19.8,
    gameScore: { result: "L" as const, teamScore: 17, oppScore: 24 }, vegasLine: null,
  };
  return {
    _meta: { generatedAt: "", source: "", season: 2026, week: 1, notes: [] },
    schemaVersion: "nfl-yardage-history-v2",
    season: 2026,
    week: 1,
    players: {
      "gsis:00-1:passing": { playerId: "gsis:00-1", playerName: "Test QB", market: "passing", position: "QB", games: [passingPlayerGame] },
    },
    teamDefense: {
      "buf:passing:QB": { team: "buf", market: "passing", position: "QB", games: [oppGame] },
    },
    currentWeekEpaRanks: {},
  };
}

describe("FantasyQbLast10 renders the shared Last 10 tables from the Fantasy context", () => {
  it("renders NflPlayerLast10Table / NflOpponentLast10Table with the approved QB column order incl. Fantasy PPR Points", () => {
    mockHistory.mockReturnValue({ loading: false, error: null, data: artifact() });
    render(
      <FantasyQbLast10 season={2026} playerId="gsis:00-1" playerName="Test QB" team="kc" opponent="buf" homeAway="home" />,
    );

    const playerRegion = screen.getByRole("region", { name: /Test QB last \d+ games?/i });
    expect(within(playerRegion).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Date", "Opponent", "Comp/Att", "Yards", "TD/INT", "Fantasy PPR Points", "Avg. Yards Allowed", "vs AVG", "Def Rank",
    ]);
    expect(within(playerRegion).getAllByText("22.3").length).toBeGreaterThan(0);

    const oppRegion = screen.getByRole("region", { name: /defense last \d+ vs QB/i });
    expect(within(oppRegion).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Date", "Opp QB", "Home/Away", "Comp/Att", "Yards", "TD/INT", "Fantasy PPR Points", "QB YPG", "OFF Rank",
    ]);
    expect(within(oppRegion).getAllByText("19.8").length).toBeGreaterThan(0);
    // opposing QB name is present next to (a slot for) its team logo
    expect(within(oppRegion).getByText("Opposing QB")).toBeInTheDocument();
  });

  it("shows an unavailable state, never a crash, when the history artifact fails", () => {
    mockHistory.mockReturnValue({ loading: false, error: "boom", data: null });
    render(
      <FantasyQbLast10 season={2026} playerId="gsis:00-1" playerName="Test QB" team="kc" opponent="buf" homeAway="home" />,
    );
    expect(screen.getAllByText(/Last-10 history unavailable/i).length).toBeGreaterThan(0);
  });
});
