import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TouchdownMetric, TouchdownPreviewArtifact, TouchdownPreviewPlayer, TouchdownWindowMetrics } from "@/lib/nfl/touchdown-preview/types";
import NFLTouchdownScorer from "./NFLTouchdownScorer";

const metric = (value: number | null, percentile: number | null = value): TouchdownMetric => ({ value, percentile, rank: value == null ? null : 1, poolSize: value == null ? 0 : 2 });

function windowMetrics(): TouchdownWindowMetrics {
  return { sampleState: "available", sampleGames: 1, sampleLabel: "2025 regular season · 1 game", tdPerGame: 1, tdLast5PerGame: 1, usagePerGame: 14,
    teamUsageShare: 0.28, rzOpportunitiesPerGame: 3, inside10OpportunitiesPerGame: 2, goalLineOpportunitiesPerGame: 1, rzOpportunityShare: 0.375,
    goalLineOpportunityShare: 0.333, impliedTeamPoints: 25, opponentTdOpportunitiesPerGame: 4.1, opponentPositionTdsAllowedPerGame: 1,
    opponentPositionTdsAllowedPerGameSeason: 1, opponentPositionTdsAllowedPerGameSeasonSource: "current_season", opponentPositionTdsAllowedPerGameLast5: 1,
    opponentPositionTdsAllowedPerGameSeasonPercentile: 50, opponentPositionTdsAllowedPerGameLast5Percentile: 50,
    tdSuccessRate: 0.08, components: { playerUsage: metric(1, 80), tdOpportunities: metric(75, 75), teamUsage: metric(0.28, 80), tdSuccess: metric(0.08, 80),
      opponentTdOpportunities: metric(70, 70), opponentPositionTdsAllowed: metric(1, 80), impliedTeamPoints: metric(25, 80) }, jkbTdScore: 79.5, scoreRank: 1, scorePoolSize: 6 };
}

function player(name: string, team: string, opponent: string, homeAway: "home" | "away"): TouchdownPreviewPlayer {
  const metrics = windowMetrics();
  return {
    playerId: `gsis:${name}`, playerName: name, team, opponent, homeAway, position: "WR", gameId: `2026_01_${team}_${opponent}`, kickoff: null,
    impliedTeamPoints: 25, anytimeTdOdds: null,
    windows: { 2025: metrics, 2026: metrics, last8: metrics },
    playerHistory: [], opponentHistory: [],
  };
}

function artifact(): TouchdownPreviewArtifact {
  return {
    schemaVersion: "nfl-touchdown-preview-v1", modelVersion: "jkb-td-score-v1.0.0", season: 2026, week: 1, generatedAt: null, defaultWindow: "last8",
    sourceStatus: { playerWeekStats: "available", touchdownContext: "available", marketImpliedPoints: "available", anytimeTdOdds: "unsupported" },
    methodology: { normalization: "", tdSuccess: "", positionAdjustment: "", componentWeights: { playerUsage: 0.2, tdOpportunities: 0.25, teamUsage: 0.15, tdSuccess: 0.15, opponentTdOpportunities: 0.1, opponentPositionTdsAllowed: 0.1, impliedTeamPoints: 0.05 }, opportunityWeights: { rz: 0.25, inside10: 0.35, goalLine: 0.4 } },
    players: [
      player("Drake Maye", "ne", "sea", "away"),
      player("Sam Darnold", "sea", "ne", "home"),
      player("Josh Allen", "buf", "mia", "home"),
      player("Tua Tagovailoa", "mia", "buf", "away"),
    ],
  };
}

function stubFetch(data: TouchdownPreviewArtifact) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("NFLTouchdownScorer matchup filter", () => {
  it("shows the NE @ SEA candidates when that matchup is selected, instead of a false empty state", async () => {
    stubFetch(artifact());
    render(<NFLTouchdownScorer />);
    await waitFor(() => expect(screen.getByTestId("touchdown-table")).toBeInTheDocument());

    const matchupSelect = screen.getByLabelText("Matchup") as HTMLSelectElement;
    fireEvent.change(matchupSelect, { target: { value: "ne@sea" } });

    expect(screen.queryByText("No players match these filters.")).not.toBeInTheDocument();
    expect(screen.getByText("Drake Maye")).toBeInTheDocument();
    expect(screen.getByText("Sam Darnold")).toBeInTheDocument();
    expect(screen.queryByText("Josh Allen")).not.toBeInTheDocument();
    expect(screen.queryByText("Tua Tagovailoa")).not.toBeInTheDocument();
  });

  it("shows the correct candidates for a second matchup (BUF @ MIA)", async () => {
    stubFetch(artifact());
    render(<NFLTouchdownScorer />);
    await waitFor(() => expect(screen.getByTestId("touchdown-table")).toBeInTheDocument());

    const matchupSelect = screen.getByLabelText("Matchup") as HTMLSelectElement;
    fireEvent.change(matchupSelect, { target: { value: "buf@mia" } });

    expect(screen.queryByText("No players match these filters.")).not.toBeInTheDocument();
    expect(screen.getByText("Josh Allen")).toBeInTheDocument();
    expect(screen.getByText("Tua Tagovailoa")).toBeInTheDocument();
    expect(screen.queryByText("Drake Maye")).not.toBeInTheDocument();
  });

  it("returns to the full board when the matchup filter is reset to All", async () => {
    stubFetch(artifact());
    render(<NFLTouchdownScorer />);
    await waitFor(() => expect(screen.getByTestId("touchdown-table")).toBeInTheDocument());

    const matchupSelect = screen.getByLabelText("Matchup") as HTMLSelectElement;
    fireEvent.change(matchupSelect, { target: { value: "ne@sea" } });
    fireEvent.change(matchupSelect, { target: { value: "all" } });

    expect(screen.getByText("Drake Maye")).toBeInTheDocument();
    expect(screen.getByText("Josh Allen")).toBeInTheDocument();
  });

  it("renders matchup options with the canonical team-pair value, not the display text, as the option value", async () => {
    stubFetch(artifact());
    render(<NFLTouchdownScorer />);
    await waitFor(() => expect(screen.getByTestId("touchdown-table")).toBeInTheDocument());
    const matchupSelect = screen.getByLabelText("Matchup") as HTMLSelectElement;
    const options = within(matchupSelect).getAllByRole("option") as HTMLOptionElement[];
    const neSea = options.find((option) => option.textContent === "ne @ sea");
    expect(neSea?.value).toBe("ne@sea");
  });
});
