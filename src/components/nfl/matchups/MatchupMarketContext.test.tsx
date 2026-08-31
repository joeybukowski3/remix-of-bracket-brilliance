/**
 * Phase 5 — focused tests for the Betting Market Context section.
 *
 * The betting-lines hook is mocked so these assert presentation only: the
 * designated sportsbook, the current line, the JKB gap, freshness wording,
 * first-observed line movement, independent spread/total degradation, the
 * sparkline using only real points, and the reserved splits placeholder.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type {
  CurrentMarketView,
  LineMovementView,
} from "@/lib/nfl/bettingLinesView";
import type { NflBettingLinesState } from "@/hooks/useNflBettingLines";

const mockUseNflBettingLines = vi.fn<[], NflBettingLinesState>();
vi.mock("@/hooks/useNflBettingLines", () => ({
  useNflBettingLines: () => mockUseNflBettingLines(),
}));

import MatchupMarketContext from "@/components/nfl/matchups/MatchupMarketContext";

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "away-club",
    abbr: "ne",
    teamName: "Away Club",
    division: "AFC East",
    conference: "AFC",
    color: "#000000",
    projectedWins: 8.5,
    marketWinTotal: 8.5,
    modelVsMarketGap: 0,
    recommendationLabel: "Pass",
    confidenceLabel: "Low",
    regressionGap: 0,
    regressionSignal: "Neutral",
    powerRank: 16,
    offenseRank: 16,
    defenseRank: 16,
    scheduleRank: 16,
    scheduleLabel: "Average",
    record2025: "8-9",
    overallPct: 0,
    offensePct: 0,
    defensePct: 0,
    headline: "",
    editorialSummary: "",
    strengths: [],
    concerns: [],
    keyQuestions: [],
    ...overrides,
  } as NflMatchupTeam;
}

const MATCHUP: NflMatchup = {
  slug: "ne-at-sea",
  gameId: "2026_01_NE_SEA",
  season: 2026,
  week: 1,
  seasonType: "REG",
  kickoffUtc: "2026-09-10T00:20:00Z",
  stadium: "Test Field",
  away: makeTeam({ slug: "ne", abbr: "ne", teamName: "New England" }),
  home: makeTeam({ slug: "sea", abbr: "sea", teamName: "Seattle", conference: "NFC", division: "NFC West" }),
  neutralSite: false,
  spread: null,
};

const PROJECTION = {
  gameId: MATCHUP.gameId,
  week: 1,
  kickoff: null,
  homeTeam: "sea",
  awayTeam: "ne",
  homeCurrentOVR: 55,
  awayCurrentOVR: 45,
  leagueAverageOVR: 50,
  homePowerNumber: 2,
  awayPowerNumber: -2,
  neutralSite: false,
  homeFieldAdvantage: 2,
  neutralProjectedMargin: 4,
  projectedHomeMargin: 4.2,
  formattedJkbSpread: "SEA −4.2",
} satisfies GameProjection;

function current(overrides: Partial<CurrentMarketView> = {}): CurrentMarketView {
  return {
    sportsbook: { id: "draftkings", name: "DraftKings" },
    selectionReason: "priority",
    spread: { homeLine: -3.5, awayLine: 3.5, homePrice: -110, awayPrice: -110 },
    total: { line: 44.5, overPrice: -110, underPrice: -110 },
    moneyline: { homePrice: -198, awayPrice: 164 },
    capturedAt: "2026-08-31T12:00:00.000Z",
    providerUpdatedAt: "2026-08-31T12:00:00.000Z",
    firstObservedAt: "2026-08-31T10:00:00.000Z",
    lastObservedAt: "2026-08-31T12:00:00.000Z",
    artifactGeneratedAt: "2026-08-31T12:00:00.000Z",
    freshness: {
      level: "fresh",
      basis: "providerUpdatedAt",
      basisAt: "2026-08-31T12:00:00.000Z",
      ageMs: 8 * 60 * 1000,
      evaluatedAt: "2026-08-31T12:08:00.000Z",
    },
    ...overrides,
  };
}

function movement(overrides: Partial<LineMovementView> = {}): LineMovementView {
  return {
    sportsbook: { id: "draftkings", name: "DraftKings" },
    spread: {
      firstObserved: -3,
      current: -3.5,
      move: -0.5,
      points: [
        { value: -3, at: "2026-08-31T10:00:00.000Z" },
        { value: -3.5, at: "2026-08-31T12:00:00.000Z" },
      ],
      firstObservedAt: "2026-08-31T10:00:00.000Z",
      lastObservedAt: "2026-08-31T12:00:00.000Z",
    },
    total: {
      firstObserved: 46,
      current: 44.5,
      move: -1.5,
      points: [
        { value: 46, at: "2026-08-31T10:00:00.000Z" },
        { value: 45, at: "2026-08-31T11:00:00.000Z" },
        { value: 44.5, at: "2026-08-31T12:00:00.000Z" },
      ],
      firstObservedAt: "2026-08-31T10:00:00.000Z",
      lastObservedAt: "2026-08-31T12:00:00.000Z",
    },
    ...overrides,
  };
}

function renderContext(state: Partial<NflBettingLinesState>, theme: "light" | "dark" = "light") {
  mockUseNflBettingLines.mockReturnValue({
    loading: false,
    error: null,
    current: null,
    movement: null,
    ...state,
  });
  return render(
    <MemoryRouter>
      <div className="nfl-matchup-sheet" data-theme={theme}>
        <MatchupMarketContext matchup={MATCHUP} projection={PROJECTION} />
      </div>
    </MemoryRouter>,
  );
}

describe("MatchupMarketContext", () => {
  it("names the single designated sportsbook", () => {
    renderContext({ current: current(), movement: movement() });
    expect(screen.getByText(/Current Market — DraftKings/)).toBeInTheDocument();
  });

  it("shows the current spread, total and moneyline from that book", () => {
    renderContext({ current: current(), movement: movement() });
    const block = screen.getByText(/Current Market — DraftKings/).closest("div")
      ?.parentElement as HTMLElement;
    expect(within(block).getByText("SEA −3.5")).toBeInTheDocument();
    expect(within(block).getByText("44.5")).toBeInTheDocument();
    expect(within(block).getByText("SEA −198")).toBeInTheDocument();
  });

  it("compares the JKB projection to this book's line", () => {
    renderContext({ current: current(), movement: movement() });
    expect(screen.getByText("JKB Spread")).toBeInTheDocument();
    expect(screen.getByText("SEA −4.2")).toBeInTheDocument();
    // projectedHomeMargin 4.2 vs market home margin 3.5 -> SEA +0.7
    expect(screen.getByText("SEA +0.7")).toBeInTheDocument();
  });

  it("states freshness as a relative age, not the render time", () => {
    renderContext({ current: current(), movement: movement() });
    expect(screen.getByText("Updated 8m ago")).toBeInTheDocument();
  });

  it("renders missing individual markets as N/A", () => {
    renderContext({
      current: current({ spread: null, moneyline: null }),
      movement: movement({ spread: null }),
    });
    const na = screen.getAllByText("N/A");
    expect(na.length).toBeGreaterThanOrEqual(2);
  });

  it("uses First observed wording and never says Open", () => {
    const { container } = renderContext({ current: current(), movement: movement() });
    expect(screen.getByText("First Obs.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bopen\b/i);
  });

  it("uses no consensus or average wording", () => {
    const { container } = renderContext({ current: current(), movement: movement() });
    expect(container.textContent).not.toMatch(/consensus/i);
    expect(container.textContent).not.toMatch(/averag/i);
  });

  it("shows spread movement (first observed, current, move)", () => {
    renderContext({ current: current(), movement: movement() });
    const row = screen.getByText("SEA Spread").closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText("−3")).toBeInTheDocument();
    expect(within(row).getByText("−3.5")).toBeInTheDocument();
    expect(within(row).getByText("−0.5")).toBeInTheDocument();
  });

  it("shows total movement independently of spread", () => {
    renderContext({ current: current(), movement: movement() });
    const row = screen.getByText("Game Total").closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText("46")).toBeInTheDocument();
    expect(within(row).getByText("44.5")).toBeInTheDocument();
    expect(within(row).getByText("−1.5")).toBeInTheDocument();
  });

  it("degrades spread and total independently", () => {
    renderContext({ current: current(), movement: movement({ spread: null }) });
    const spreadRow = screen.getByText("SEA Spread").closest('[role="row"]') as HTMLElement;
    expect(within(spreadRow).getByText(/Not enough history/)).toBeInTheDocument();
    // total stays usable
    const totalRow = screen.getByText("Game Total").closest('[role="row"]') as HTMLElement;
    expect(within(totalRow).getByText("44.5")).toBeInTheDocument();
  });

  it("plots only the actual observed points in the sparkline", () => {
    const { container } = renderContext({ current: current(), movement: movement() });
    const polylines = container.querySelectorAll("svg.matchup-spark polyline");
    // spread has 2 points, total has 3
    const counts = Array.from(polylines).map(
      (line) => (line.getAttribute("points") ?? "").trim().split(/\s+/).length,
    );
    expect(counts).toContain(2);
    expect(counts).toContain(3);
  });

  it("keeps line movement a compact two-row table", () => {
    renderContext({ current: current(), movement: movement() });
    expect(screen.getByText("SEA Spread")).toBeInTheDocument();
    expect(screen.getByText("Game Total")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /large chart/i })).toBeNull();
  });

  it("shows a reserved betting splits placeholder with no percentages", () => {
    const { container } = renderContext({ current: current(), movement: movement() });
    const splits = screen.getByText("Betting Splits").closest("div")
      ?.parentElement as HTMLElement;
    expect(within(splits).getByText(/Production source not yet qualified/)).toBeInTheDocument();
    expect(within(splits).getAllByText("Awaiting source").length).toBe(2);
    expect(splits.textContent).not.toMatch(/\d%/);
    expect(container.textContent).not.toMatch(/SportsDataIO/i);
  });

  it("renders the splits placeholder even when no line is published", () => {
    renderContext({ current: null, movement: null });
    expect(screen.getByText("Betting Splits")).toBeInTheDocument();
    expect(
      screen.getByText(/No sportsbook line has been published/),
    ).toBeInTheDocument();
  });

  it("renders in the dark theme", () => {
    renderContext({ current: current(), movement: movement() }, "dark");
    expect(screen.getByText(/Current Market — DraftKings/)).toBeInTheDocument();
  });
});
