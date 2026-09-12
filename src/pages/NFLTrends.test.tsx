import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { NflSituationalTrendsArtifact, SituationalTrendResearch } from "@/lib/nfl/situationalTrends";

const metrics = {
  qualifyingTeamGames: 175,
  atsWins: 97,
  atsLosses: 74,
  atsPushes: 4,
  atsWinPct: 0.567,
  atsRoiAtMinus110: 0.083,
  sampleSizeLabel: "LARGE",
};

const westToEast: SituationalTrendResearch = {
  id: "west-to-east-early",
  name: "West-to-East Early",
  definition: "Pacific-origin team at an Eastern-time venue at 1:00 PM ET.",
  category: "Travel",
  researchPhase: "PHASE_1",
  classification: "CONTEXT-DEPENDENT",
  confidence: "Moderate",
  recentEvidenceClassification: "POSITIVE",
  fullHistory: metrics,
  recentForm: { ...metrics, qualifyingTeamGames: 63, atsWins: 37, atsLosses: 26, atsPushes: 0, atsWinPct: 0.587, atsRoiAtMinus110: 0.121 },
  robustnessLabel: "BROADLY SUPPORTED",
  robustnessInterpretation: "The signal survived the locked checks.",
  articleNote: "Useful travel context, not a recommendation.",
  stability: { recentChange: "STABLE" },
  variants: [],
  tier: "NOTEWORTHY",
  historicalDirection: "POSITIVE",
};

const classic: SituationalTrendResearch = {
  ...westToEast,
  id: "home-underdogs",
  name: "Home Underdogs",
  definition: "Non-neutral home team with a positive spread.",
  category: "Market Role",
  researchPhase: "PHASE_2B",
  classification: "LITTLE/NO EVIDENCE",
  confidence: "High",
  robustnessLabel: null,
  robustnessInterpretation: null,
  articleNote: "A classic market role with little broad edge.",
  tier: "CLASSIC_ANGLE",
  historicalDirection: "NO_BROAD_EDGE",
};

const artifact: NflSituationalTrendsArtifact = {
  schemaVersion: "nfl-situational-trend-matchups-v1",
  season: 2026,
  generatedAt: null,
  asOf: { schedule: null, results: null, market: null },
  sources: {},
  definitionVersions: { phase1: "p1", phase2: "p2", phase2b: "p2b" },
  evaluatedTrendIds: [westToEast.id, classic.id],
  researchLibrary: [westToEast, classic],
  limitations: [],
  games: [{
    gameId: "2026_01_SEA_NYG",
    week: 1,
    away: "sea",
    home: "nyg",
    awayName: "Seattle Seahawks",
    homeName: "New York Giants",
    gameSlug: "seattle-seahawks-at-new-york-giants",
    kickoff: "2026-09-13T17:00:00.000Z",
    status: "scheduled",
    qualifiers: [{
      gameId: "2026_01_SEA_NYG",
      team: "sea",
      trendId: westToEast.id,
      status: "CONFIRMED",
      reason: "Pacific-origin team at a non-neutral Eastern-time venue for a 1:00 PM ET kickoff.",
      variantIds: [],
      tier: "NOTEWORTHY",
      classification: "CONTEXT-DEPENDENT",
      confidence: "Moderate",
    }],
    pending: [{
      gameId: "2026_01_SEA_NYG",
      team: "nyg",
      trendId: classic.id,
      status: "AWAITING_MARKET",
      reason: "Awaiting a current market spread.",
      variantIds: [],
      tier: "CLASSIC_ANGLE",
      classification: "LITTLE/NO EVIDENCE",
      confidence: "High",
    }],
  }],
};

vi.mock("@/hooks/useNflSituationalTrends", () => ({
  useNflSituationalTrends: () => ({ artifact, loading: false, error: null }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

import NFLTrends from "@/pages/NFLTrends";

function renderPage() {
  return render(<MemoryRouter><NFLTrends /></MemoryRouter>);
}

describe("NFL Trends page", () => {
  it("shows current qualifiers, pending status and a matchup trends deep link", () => {
    const { container } = renderPage();
    expect(screen.getByRole("heading", { name: /Seattle Seahawks at New York Giants/i })).toBeTruthy();
    expect(screen.getByText(/Awaiting market 1/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Matchup trends/i });
    expect(link.getAttribute("href")).toBe("/nfl/matchups/seattle-seahawks-at-new-york-giants#trends");
    expect(screen.getAllByRole("img", { name: "Seattle Seahawks" }).some((logo) => logo.getAttribute("src")?.endsWith("/sea.png"))).toBe(true);
    expect(screen.getAllByRole("img", { name: "New York Giants" }).some((logo) => logo.getAttribute("src")?.endsWith("/nyg.png"))).toBe(true);
    expect(container.querySelector('[data-tier="NOTEWORTHY"]')).toBeTruthy();
  });

  it("searches current matchups by team", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Search current matchups by team"), { target: { value: "Buffalo" } });
    expect(screen.getByText(/No current or upcoming matchup matches/i)).toBeTruthy();
  });

  it("supports keyboard tab navigation and library search", () => {
    renderPage();
    const matchupsTab = screen.getByRole("tab", { name: "Current & Upcoming Matchups" });
    fireEvent.keyDown(matchupsTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Trend Library" })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByLabelText("Search the trend library"), { target: { value: "Home" } });
    expect(screen.getByRole("heading", { name: "Home Underdogs" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "West-to-East Early" })).toBeNull();
  });
});
