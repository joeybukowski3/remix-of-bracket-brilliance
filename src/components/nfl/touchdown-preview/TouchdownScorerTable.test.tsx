import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TOUCHDOWN_SORT } from "@/lib/nfl/touchdown-preview/presentation";
import type { TouchdownMetric, TouchdownPreviewPlayer, TouchdownWindowMetrics } from "@/lib/nfl/touchdown-preview/types";
import TouchdownMetricCell from "./TouchdownMetricCell";
import TouchdownScorerTable from "./TouchdownScorerTable";

const metric = (value: number | null, percentile: number | null = value): TouchdownMetric => ({ value, percentile, rank: value == null ? null : 1, poolSize: value == null ? 0 : 2 });
function windowMetrics(): TouchdownWindowMetrics {
  return { sampleState: "available", sampleGames: 1, sampleLabel: "2025 regular season · 1 game", tdPerGame: 1, tdLast5PerGame: 1, usagePerGame: 14,
    teamUsageShare: 0.28, rzOpportunitiesPerGame: 3, inside10OpportunitiesPerGame: 2, goalLineOpportunitiesPerGame: 1, rzOpportunityShare: 0.375,
    goalLineOpportunityShare: 0.333, impliedTeamPoints: 25, opponentTdOpportunitiesPerGame: 4.1, opponentPositionTdsAllowedPerGame: 1,
    tdSuccessRate: 0.08, components: { playerUsage: metric(1, 80), tdOpportunities: metric(75, 75), teamUsage: metric(0.28, 80), tdSuccess: metric(0.08, 80),
      opponentTdOpportunities: metric(70, 70), opponentPositionTdsAllowed: metric(1, 80), impliedTeamPoints: metric(25, 80) }, jkbTdScore: 79.5, scoreRank: 1, scorePoolSize: 2 };
}
function player(): TouchdownPreviewPlayer {
  const metrics = windowMetrics();
  const playerGame = { gameId: "2025_01_CIN_CLE", season: 2025, week: 1, date: null, team: "cin", opponent: "cle", homeAway: "away" as const,
    teamScore: 24, opponentScore: 17, carries: 1, targets: 13, scorerOpportunities: 14, teamScorerOpportunities: 50, teamRzOpportunities: 8,
    teamGoalLineOpportunities: 3, rushingTds: 0, receivingTds: 1, touchdowns: 1, rzOpportunities: 3, inside10Opportunities: 2, goalLineOpportunities: 1 };
  const opponentGame = { gameId: "2025_01_CIN_CLE", season: 2025, week: 1, date: null, defense: "cle", opponent: "cin", homeAway: "home" as const,
    defenseScore: 17, opponentScore: 24, offensiveTdsAllowed: 3, rzOpportunitiesAllowed: 6, inside10OpportunitiesAllowed: 4, goalLineOpportunitiesAllowed: 2,
    touchdownsAllowedByPosition: { QB: 0, RB: 1, WR: 2, TE: 0 } };
  return { playerId: "gsis:1", playerName: "Ja'Marr Chase", team: "cin", opponent: "cle", homeAway: "away", position: "WR", gameId: "2026_01_CIN_CLE", kickoff: null,
    impliedTeamPoints: 25, anytimeTdOdds: null, windows: { 2025: metrics, 2026: { ...metrics, sampleState: "zero", sampleGames: 0, jkbTdScore: null }, last8: metrics },
    playerHistory: [playerGame], opponentHistory: [opponentGame] };
}

describe("TouchdownScorerTable", () => {
  it("renders the dense desktop table and remains horizontally usable at narrow widths", () => {
    render(<TouchdownScorerTable players={[player()]} window="2025" sort={DEFAULT_TOUCHDOWN_SORT} onSort={vi.fn()} />);
    expect(screen.getByText("Ja'Marr Chase")).toBeInTheDocument();
    expect(screen.getByText("JKB TD Score")).toBeInTheDocument();
    expect(screen.getByTestId("touchdown-table-scroller")).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("table")).toHaveClass("min-w-[1710px]");
  });

  it("expands one compact row and renders player and opponent histories vertically", () => {
    render(<TouchdownScorerTable players={[player()]} window="2025" sort={DEFAULT_TOUCHDOWN_SORT} onSort={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand details for Ja'Marr Chase" }));
    const detail = screen.getByTestId("touchdown-player-detail");
    expect(within(detail).getByText("Player game history")).toBeInTheDocument();
    expect(within(detail).getByText("Opponent game history")).toBeInTheDocument();
    expect(within(detail).getByText("Rec TD")).toBeInTheDocument();
    expect(within(detail).getByText("Off TD Allowed")).toBeInTheDocument();
    expect(within(detail).getByText("Unavailable")).toBeInTheDocument();
  });

  it("uses bettor-perspective canonical heat and gives missing values no fake heat", () => {
    const { rerender } = render(<TouchdownMetricCell value={4} percentile={90} />);
    const favorable = screen.getByText("4.00");
    expect(favorable).toHaveStyle({ backgroundColor: "#10b981" });
    rerender(<TouchdownMetricCell value={1} percentile={5} />);
    expect(screen.getByText("1.00")).toHaveStyle({ backgroundColor: "#dc2626" });
    rerender(<TouchdownMetricCell value={null} percentile={null} />);
    expect(screen.getByText("N/A")).toHaveClass("text-slate-400");
    expect(screen.getByText("N/A")).toHaveAttribute("title", "Unavailable from current source data");
  });
});
