import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TouchdownMetric, TouchdownPosition, TouchdownPreviewPlayer, TouchdownWindowMetrics, TouchdownPlayerGame, TouchdownOpponentGame } from "@/lib/nfl/touchdown-preview/types";
import TouchdownPlayerDetail from "./TouchdownPlayerDetail";

const metric = (value: number | null, percentile: number | null = value): TouchdownMetric => ({ value, percentile, rank: value == null ? null : 1, poolSize: value == null ? 0 : 2 });

function windowMetrics(overrides: Partial<TouchdownWindowMetrics> = {}): TouchdownWindowMetrics {
  return {
    sampleState: "available", sampleGames: 1, sampleLabel: "2025 regular season · 1 game", tdPerGame: 1, tdLast5PerGame: 1, usagePerGame: 14,
    teamUsageShare: 0.28, rzOpportunitiesPerGame: 3, inside10OpportunitiesPerGame: 2, goalLineOpportunitiesPerGame: 1, rzOpportunityShare: 0.375,
    goalLineOpportunityShare: 0.333, impliedTeamPoints: 25, opponentTdOpportunitiesPerGame: 4.1, opponentPositionTdsAllowedPerGame: 1,
    opponentPositionTdsAllowedPerGameSeason: 1.4, opponentPositionTdsAllowedPerGameLast5: 0.8,
    opponentPositionTdsAllowedPerGameSeasonPercentile: 91, opponentPositionTdsAllowedPerGameLast5Percentile: 22,
    tdSuccessRate: 0.08, components: { playerUsage: metric(1, 80), tdOpportunities: metric(75, 75), teamUsage: metric(0.28, 62), tdSuccess: metric(0.08, 80),
      opponentTdOpportunities: metric(70, 70), opponentPositionTdsAllowed: metric(1, 80), impliedTeamPoints: metric(25, 55) }, jkbTdScore: 79.5, scoreRank: 1, scorePoolSize: 2,
    ...overrides,
  };
}

function playerGame(overrides: Partial<TouchdownPlayerGame> = {}): TouchdownPlayerGame {
  return {
    gameId: "2025_01_NE_SEA", season: 2025, week: 1, date: null, team: "ne", opponent: "sea", homeAway: "away",
    teamScore: 20, opponentScore: 17, carries: 10, targets: 2, scorerOpportunities: 3, teamScorerOpportunities: 10,
    teamRzOpportunities: 6, teamGoalLineOpportunities: 2, rushingTds: 1, receivingTds: 0, touchdowns: 1,
    rzOpportunities: 2, inside10Opportunities: 1, goalLineOpportunities: 1,
    ...overrides,
  };
}

function opponentGame(overrides: Partial<TouchdownOpponentGame> = {}): TouchdownOpponentGame {
  return {
    gameId: "2025_01_NE_SEA", season: 2025, week: 1, date: null, defense: "sea", opponent: "ne", homeAway: "home",
    defenseScore: 17, opponentScore: 20, offensiveTdsAllowed: 2, rzOpportunitiesAllowed: 4,
    inside10OpportunitiesAllowed: 2, goalLineOpportunitiesAllowed: 1,
    touchdownsAllowedByPosition: { QB: 0, RB: 1, WR: 1, TE: 0 },
    ...overrides,
  };
}

function player(position: TouchdownPosition, opts: { playerHistory?: TouchdownPlayerGame[]; opponentHistory?: TouchdownOpponentGame[]; metrics?: Partial<TouchdownWindowMetrics>; anytimeTdOdds?: number | null; anytimeTdBook?: string | null; marketImpliedProbability?: number | null; oddsUpdatedAt?: string | null } = {}): TouchdownPreviewPlayer {
  const metrics = windowMetrics(opts.metrics);
  const playerHistory = opts.playerHistory ?? [playerGame()];
  const opponentHistory = opts.opponentHistory ?? [opponentGame()];
  return {
    playerId: "gsis:1", playerName: "Test Player", team: "ne", opponent: "sea", homeAway: "away", position, gameId: "2026_01_NE_SEA", kickoff: null,
    impliedTeamPoints: 25, anytimeTdOdds: opts.anytimeTdOdds ?? null, anytimeTdBook: opts.anytimeTdBook ?? null,
    marketImpliedProbability: opts.marketImpliedProbability ?? null, oddsUpdatedAt: opts.oddsUpdatedAt ?? null,
    windows: { 2025: metrics, 2026: { ...metrics, sampleState: "zero", sampleGames: 0, jkbTdScore: null }, last8: metrics },
    playerHistory, opponentHistory,
  };
}

describe("TouchdownPlayerDetail position-specific opponent TD Allowed column", () => {
  it("shows only RB TD Allowed for an expanded RB, no QB/WR/TE columns", () => {
    render(<TouchdownPlayerDetail player={player("RB")} window="2025" />);
    const detail = screen.getByTestId("touchdown-player-detail");
    expect(within(detail).getByText("RB TD Allowed")).toBeInTheDocument();
    expect(within(detail).queryByText("QB Rush TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("WR TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("TE TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("QB TD")).not.toBeInTheDocument();
  });

  it("shows only WR TD Allowed for an expanded WR", () => {
    render(<TouchdownPlayerDetail player={player("WR")} window="2025" />);
    const detail = screen.getByTestId("touchdown-player-detail");
    expect(within(detail).getByText("WR TD Allowed")).toBeInTheDocument();
    expect(within(detail).queryByText("RB TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("QB Rush TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("TE TD Allowed")).not.toBeInTheDocument();
  });

  it("shows only TE TD Allowed for an expanded TE", () => {
    render(<TouchdownPlayerDetail player={player("TE")} window="2025" />);
    const detail = screen.getByTestId("touchdown-player-detail");
    expect(within(detail).getByText("TE TD Allowed")).toBeInTheDocument();
    expect(within(detail).queryByText("RB TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("WR TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("QB Rush TD Allowed")).not.toBeInTheDocument();
  });

  it("shows only QB Rush TD Allowed for an expanded QB (not a bare 'QB TD' label)", () => {
    render(<TouchdownPlayerDetail player={player("QB")} window="2025" />);
    const detail = screen.getByTestId("touchdown-player-detail");
    expect(within(detail).getByText("QB Rush TD Allowed")).toBeInTheDocument();
    expect(within(detail).queryByText("QB TD")).not.toBeInTheDocument();
    expect(within(detail).queryByText("RB TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("WR TD Allowed")).not.toBeInTheDocument();
    expect(within(detail).queryByText("TE TD Allowed")).not.toBeInTheDocument();
  });

  it("never shows more than one positional TD Allowed column, for any position", () => {
    const allLabels = ["QB Rush TD Allowed", "RB TD Allowed", "WR TD Allowed", "TE TD Allowed"];
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      const { unmount } = render(<TouchdownPlayerDetail player={player(position)} window="2025" />);
      const detail = screen.getByTestId("touchdown-player-detail");
      const present = allLabels.filter((label) => within(detail).queryByText(label));
      expect(present).toHaveLength(1);
      unmount();
    }
  });
});

describe("TouchdownPlayerDetail opponent logos", () => {
  it("renders the opponent team logo in Player Game History", () => {
    render(<TouchdownPlayerDetail player={player("WR", { playerHistory: [playerGame({ opponent: "buf" })] })} window="2025" />);
    const section = screen.getByText("Player game history").closest("section") as HTMLElement;
    expect(within(section).getByAltText("buf")).toBeInTheDocument();
  });

  it("renders the opponent team logo in Opponent Game History", () => {
    render(<TouchdownPlayerDetail player={player("WR", { opponentHistory: [opponentGame({ opponent: "mia" })] })} window="2025" />);
    const section = screen.getByText("Opponent game history").closest("section") as HTMLElement;
    expect(within(section).getByAltText("mia")).toBeInTheDocument();
  });
});

describe("TouchdownPlayerDetail average rows", () => {
  it("renders a 10-Game Avg row in Player Game History for a full 10-game sample", () => {
    const games = Array.from({ length: 10 }, (_, index) => playerGame({ gameId: `g${index}`, week: index + 1 }));
    render(<TouchdownPlayerDetail player={player("WR", { playerHistory: games })} window="2025" />);
    const section = screen.getByText("Player game history").closest("section") as HTMLElement;
    expect(within(section).getByText("10-Game Avg")).toBeInTheDocument();
  });

  it("renders an Opponent Game History average row sized to the displayed sample", () => {
    const games = Array.from({ length: 4 }, (_, index) => opponentGame({ gameId: `g${index}`, week: index + 1 }));
    render(<TouchdownPlayerDetail player={player("WR", { opponentHistory: games })} window="2025" />);
    const section = screen.getByText("Opponent game history").closest("section") as HTMLElement;
    expect(within(section).getByText("4-Game Avg")).toBeInTheDocument();
  });

  it("averages only the displayed sample rows, not the full history behind it", () => {
    // 10 games at RZ=2 (average 2) plus 2 more hidden-by-slice games at RZ=100 that must not shift the shown average.
    const shown = Array.from({ length: 10 }, (_, index) => playerGame({ gameId: `shown-${index}`, week: index + 1, rzOpportunities: 2 }));
    const hidden = [
      playerGame({ gameId: "hidden-1", week: 11, rzOpportunities: 100 }),
      playerGame({ gameId: "hidden-2", week: 12, rzOpportunities: 100 }),
    ];
    render(<TouchdownPlayerDetail player={player("WR", { playerHistory: [...shown, ...hidden] })} window="2025" />);
    const section = screen.getByText("Player game history").closest("section") as HTMLElement;
    const avgRow = within(section).getByText("10-Game Avg").closest("tr") as HTMLElement;
    // RZ Opps average column: with the 10 shown games all at 2, the average must read 2.00, not skewed toward 100.
    expect(within(avgRow).getByText("2.00")).toBeInTheDocument();
  });
});

describe("TouchdownPlayerDetail RZ/Inside-10/Goal-Line deltas", () => {
  it("shows a correct positive RZ Opps delta vs the displayed-sample average", () => {
    const games = [playerGame({ gameId: "a", rzOpportunities: 4 }), playerGame({ gameId: "b", rzOpportunities: 0 })];
    render(<TouchdownPlayerDetail player={player("WR", { playerHistory: games })} window="2025" />);
    const section = screen.getByText("Player game history").closest("section") as HTMLElement;
    // Average is 2; game "a" is 4, delta +2.0.
    expect(within(section).getByText("(+2.0)")).toBeInTheDocument();
  });

  it("shows a correct Inside 10 Opps delta vs the displayed-sample average", () => {
    const games = [playerGame({ gameId: "a", inside10Opportunities: 3 }), playerGame({ gameId: "b", inside10Opportunities: 1 })];
    render(<TouchdownPlayerDetail player={player("WR", { playerHistory: games })} window="2025" />);
    const section = screen.getByText("Player game history").closest("section") as HTMLElement;
    // Average is 2; game "b" is 1, delta -1.0.
    expect(within(section).getByText("(-1.0)")).toBeInTheDocument();
  });

  it("shows a correct Goal Line Opps delta vs the displayed-sample average", () => {
    const games = [playerGame({ gameId: "a", goalLineOpportunities: 3 }), playerGame({ gameId: "b", goalLineOpportunities: 1 })];
    render(<TouchdownPlayerDetail player={player("WR", { playerHistory: games })} window="2025" />);
    const section = screen.getByText("Player game history").closest("section") as HTMLElement;
    expect(within(section).getByText("(+1.0)")).toBeInTheDocument();
  });

  it("shows a correct position-specific TD Allowed delta in Opponent Game History", () => {
    const games = [
      opponentGame({ gameId: "a", touchdownsAllowedByPosition: { QB: 0, RB: 0, WR: 3, TE: 0 } }),
      opponentGame({ gameId: "b", touchdownsAllowedByPosition: { QB: 0, RB: 0, WR: 1, TE: 0 } }),
    ];
    render(<TouchdownPlayerDetail player={player("WR", { opponentHistory: games })} window="2025" />);
    const section = screen.getByText("Opponent game history").closest("section") as HTMLElement;
    // WR average allowed is 2; game "a" is 3, delta +1.0.
    expect(within(section).getByText("(+1.0)")).toBeInTheDocument();
  });
});

describe("TouchdownPlayerDetail Scoring Profile / Matchup & Market tables", () => {
  it("surfaces the secondary metrics moved out of the primary table with percentile context", () => {
    render(<TouchdownPlayerDetail player={player("WR")} window="2025" />);
    const detail = screen.getByTestId("touchdown-player-detail");
    const profile = within(detail).getByText("Scoring profile").closest("section") as HTMLElement;
    for (const label of ["TD/Game", "TD/Game Last 5", "Usage/G", "Team Usage %", "RZ Opp/G", "Inside 10 Opp/G", "Goal Line Opp/G", "RZ Share", "Goal Line Share"]) {
      expect(within(profile).getByText(label)).toBeInTheDocument();
    }
    // teamUsage percentile 62 backs Team Usage %, RZ Share and Goal Line Share.
    expect(within(profile).getAllByText("62nd pctile")).toHaveLength(3);

    const market = within(detail).getByText("Matchup & market").closest("section") as HTMLElement;
    for (const label of ["Team Implied Points", "Opp TD Opp/G", "Opp TD/Game vs Pos SZN", "Opp TD/Game vs Pos Last 5", "Odds Updated"]) {
      expect(within(market).getByText(label)).toBeInTheDocument();
    }
    expect(within(market).queryByText("Opp TD Allowed vs Pos")).not.toBeInTheDocument();
    expect(within(market).getByText("55th pctile")).toBeInTheDocument(); // Team Implied Points
    // Explicit SZN / Last 5 opponent rows carry the model's window-independent values.
    const sznRow = within(market).getByText("Opp TD/Game vs Pos SZN").closest("tr") as HTMLElement;
    expect(within(sznRow).getByText("1.40")).toBeInTheDocument();
    const l5Row = within(market).getByText("Opp TD/Game vs Pos Last 5").closest("tr") as HTMLElement;
    expect(within(l5Row).getByText("0.80")).toBeInTheDocument();
  });

  it("gives the SZN and Last 5 opponent rows their own distinct favorable percentiles, not one shared value", () => {
    render(<TouchdownPlayerDetail player={player("WR", { metrics: { opponentPositionTdsAllowedPerGameSeasonPercentile: 99, opponentPositionTdsAllowedPerGameLast5Percentile: 6 } })} window="2025" />);
    const market = screen.getByText("Matchup & market").closest("section") as HTMLElement;
    const szn = within(within(market).getByText("Opp TD/Game vs Pos SZN").closest("tr") as HTMLElement).getByText(/pctile$/);
    const l5 = within(within(market).getByText("Opp TD/Game vs Pos Last 5").closest("tr") as HTMLElement).getByText(/pctile$/);
    expect(szn.textContent).toBe("99th pctile");
    expect(l5.textContent).toBe("6th pctile");
    // Elite SZN -> gold; weak Last 5 -> red. Distinct tiers from distinct percentiles.
    expect(szn).toHaveStyle({ backgroundColor: "#e8d5a8" });
    expect(l5).toHaveStyle({ backgroundColor: "#dc2626" });
  });

  it("resolves identical raw opponent percentiles to the same tier", () => {
    render(<TouchdownPlayerDetail player={player("WR", { metrics: { opponentPositionTdsAllowedPerGameSeasonPercentile: 70, opponentPositionTdsAllowedPerGameLast5Percentile: 70 } })} window="2025" />);
    const market = screen.getByText("Matchup & market").closest("section") as HTMLElement;
    const szn = within(within(market).getByText("Opp TD/Game vs Pos SZN").closest("tr") as HTMLElement).getByText(/pctile$/);
    const l5 = within(within(market).getByText("Opp TD/Game vs Pos Last 5").closest("tr") as HTMLElement).getByText(/pctile$/);
    expect((szn as HTMLElement).style.backgroundColor).toBe((l5 as HTMLElement).style.backgroundColor);
  });

  it("heat-colors the percentile context with the shared JKB tier scale, elite gold at the top and red at the bottom", () => {
    render(<TouchdownPlayerDetail player={player("WR", { metrics: { components: { ...windowMetrics().components, tdSuccess: metric(0.2, 99), playerUsage: metric(1, 8) } } })} window="2025" />);
    const detail = screen.getByTestId("touchdown-player-detail");
    const eliteRow = within(detail).getByText("TD/Game").closest("tr") as HTMLElement;
    const elite = within(eliteRow).getByText("99th pctile");
    // Elite tier = warm muted gold (#e8d5a8), from PERCENTILE_TIERS.
    expect(elite).toHaveStyle({ backgroundColor: "#e8d5a8" });
    const weakRow = within(detail).getByText("Usage/G").closest("tr") as HTMLElement;
    const weak = within(weakRow).getByText("8th pctile");
    expect(weak).toHaveStyle({ backgroundColor: "#dc2626" });
    // Raw percentile text is preserved, not replaced by a swatch.
    expect(elite.textContent).toBe("99th pctile");
  });

  it("lays Scoring Profile and Matchup & Market out in a responsive two-column grid on desktop", () => {
    render(<TouchdownPlayerDetail player={player("WR")} window="2025" />);
    const panels = screen.getByTestId("touchdown-detail-panels");
    expect(panels).toHaveClass("grid");
    expect(panels).toHaveClass("grid-cols-1");
    expect(panels).toHaveClass("lg:grid-cols-2");
    // Tops align and neither panel is stretched to match the taller one.
    expect(panels).toHaveClass("lg:items-start");
    const scoring = within(panels).getByText("Scoring profile").closest("section") as HTMLElement;
    const market = within(panels).getByText("Matchup & market").closest("section") as HTMLElement;
    expect(panels).toContainElement(scoring);
    expect(panels).toContainElement(market);
  });

  it("keeps Player Game History full width below the two-panel area", () => {
    render(<TouchdownPlayerDetail player={player("WR")} window="2025" />);
    const panels = screen.getByTestId("touchdown-detail-panels");
    const history = screen.getByText("Player game history").closest("section") as HTMLElement;
    expect(panels).not.toContainElement(history);
    // History section follows the panels grid in document order.
    expect(panels.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("stacks the two panels in a single column on mobile (Scoring Profile first)", () => {
    render(<TouchdownPlayerDetail player={player("WR")} window="2025" />);
    const panels = screen.getByTestId("touchdown-detail-panels");
    expect(panels).toHaveClass("grid-cols-1");
    const sections = Array.from(panels.querySelectorAll("section"));
    expect(sections[0].textContent).toContain("Scoring profile");
    expect(sections[1].textContent).toContain("Matchup & market");
  });

  it("leaves Anytime TD Odds unavailable and adds no fabricated percentile context", () => {
    render(<TouchdownPlayerDetail player={player("WR", { anytimeTdOdds: null })} window="2025" />);
    const market = screen.getByText("Matchup & market").closest("section") as HTMLElement;
    const oddsRow = within(market).getByText("Anytime TD Odds").closest("tr") as HTMLElement;
    expect(within(oddsRow).getByText("Unavailable")).toBeInTheDocument();
    expect(within(oddsRow).queryByText(/pctile/)).not.toBeInTheDocument();
  });

  it("renders the selected book and market implied probability when odds are available", () => {
    render(<TouchdownPlayerDetail player={player("WR", { anytimeTdOdds: 160, anytimeTdBook: "draftkings", marketImpliedProbability: 0.3846, oddsUpdatedAt: "2026-09-09T16:13:25Z" })} window="2025" />);
    const market = screen.getByText("Matchup & market").closest("section") as HTMLElement;
    expect(within(within(market).getByText("Anytime TD Odds").closest("tr") as HTMLElement).getByText("+160")).toBeInTheDocument();
    expect(within(within(market).getByText("Book").closest("tr") as HTMLElement).getByText("DraftKings")).toBeInTheDocument();
    expect(within(within(market).getByText("Market Implied %").closest("tr") as HTMLElement).getByText("38.5%")).toBeInTheDocument();
  });
});
