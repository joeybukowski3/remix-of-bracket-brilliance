import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import MatchupSituationalTrendsPanel from "@/components/nfl/matchups/MatchupSituationalTrendsPanel";
import type { NflSituationalTrendsArtifact, SituationalTrendResearch } from "@/lib/nfl/situationalTrends";

const metrics = (n: number, pct: number) => ({
  qualifyingTeamGames: n,
  atsWins: Math.round(n * pct),
  atsLosses: n - Math.round(n * pct),
  atsPushes: 0,
  atsWinPct: pct,
  atsRoiAtMinus110: pct - 0.5238,
  sampleSizeLabel: "LARGE",
});

const nonPlayoffTrend: SituationalTrendResearch = {
  id: "week1-prior-season-non-playoff-team",
  name: "Week 1: prior-season non-playoff team",
  definition: "Team's immediately prior regular season did not include a playoff appearance.",
  category: "Early Season",
  researchPhase: "PHASE_2C",
  earlySeasonWeek: 1,
  classification: "CONTEXT-DEPENDENT",
  confidence: "Moderate",
  recentEvidenceClassification: "MIXED",
  fullHistory: metrics(400, 0.514),
  recentForm: metrics(140, 0.556),
  robustnessLabel: null,
  robustnessInterpretation: null,
  articleNote: "Context-dependent early-season angle.",
  stability: { recentChange: "STABLE" },
  variants: [],
  tier: "CONTEXTUAL",
  historicalDirection: "MIXED",
};

const westToEast: SituationalTrendResearch = {
  id: "west-to-east-early",
  name: "West-to-East Early",
  definition: "Pacific-origin team at an Eastern-time venue at 1:00 PM ET.",
  category: "Travel",
  researchPhase: "PHASE_1",
  classification: "HISTORICALLY MEANINGFUL",
  confidence: "High",
  recentEvidenceClassification: "POSITIVE",
  fullHistory: metrics(200, 0.61),
  recentForm: metrics(70, 0.63),
  robustnessLabel: "BROADLY SUPPORTED",
  robustnessInterpretation: "The signal survived the locked checks.",
  articleNote: "Useful travel context, not a recommendation.",
  stability: { recentChange: "STABLE" },
  variants: [],
  tier: "NOTEWORTHY",
  historicalDirection: "POSITIVE",
};

const artifact: NflSituationalTrendsArtifact = {
  schemaVersion: "nfl-situational-trend-matchups-v1",
  season: 2026,
  generatedAt: null,
  asOf: { schedule: null, results: null, market: null },
  sources: {},
  definitionVersions: { phase1: "p1", phase2: "p2", phase2b: "p2b" },
  evaluatedTrendIds: [nonPlayoffTrend.id, westToEast.id],
  researchLibrary: [nonPlayoffTrend, westToEast],
  limitations: [],
  games: [{
    gameId: "2026_01_ATL_PIT",
    week: 1,
    away: "atl",
    home: "pit",
    awayName: "Atlanta Falcons",
    homeName: "Pittsburgh Steelers",
    gameSlug: "atlanta-falcons-at-pittsburgh-steelers",
    kickoff: "2026-09-13T17:00:00.000Z",
    status: "scheduled",
    // Directional (single-team) qualification: only ATL surfaces here, per the
    // asymmetric matchup rule already applied upstream by resolveMatchupTrendPresentation.
    qualifiers: [
      {
        gameId: "2026_01_ATL_PIT",
        team: "atl",
        trendId: nonPlayoffTrend.id,
        status: "CONFIRMED",
        reason: "The team was a prior-season non-playoff team.",
        variantIds: [],
        tier: "CONTEXTUAL",
        classification: "CONTEXT-DEPENDENT",
        confidence: "Moderate",
      },
      {
        gameId: "2026_01_ATL_PIT",
        team: "atl",
        trendId: westToEast.id,
        status: "CONFIRMED",
        reason: "Pacific-origin team at a non-neutral Eastern-time venue for a 1:00 PM ET kickoff.",
        variantIds: [],
        tier: "NOTEWORTHY",
        classification: "HISTORICALLY MEANINGFUL",
        confidence: "High",
      },
    ],
    pending: [{
      gameId: "2026_01_ATL_PIT",
      team: "pit",
      trendId: nonPlayoffTrend.id,
      status: "MATCHUP_PENDING",
      reason: "ATL individually qualifies, but PIT's status for this trend is still AWAITING_PRIOR_RESULT — a directional matchup trend is not yet confirmed.",
      variantIds: [],
      tier: "CONTEXTUAL",
      classification: "CONTEXT-DEPENDENT",
      confidence: "Moderate",
    }],
  }],
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <MatchupSituationalTrendsPanel
        matchup={{ gameId: "2026_01_ATL_PIT" }}
        artifact={artifact}
        loading={false}
        error={null}
      />
    </MemoryRouter>,
  );
}

describe("MatchupSituationalTrendsPanel compact presentation", () => {
  it("shows every qualifier's team, trend name, Full/Recent ATS% and confidence without expansion", () => {
    renderPanel();
    expect(screen.getAllByText("Week 1: prior-season non-playoff team").length).toBeGreaterThan(0);
    expect(screen.getAllByText("West-to-East Early").length).toBeGreaterThan(0);
    // Full/Recent ATS% visible pre-expansion (collapsed summary content).
    expect(screen.getAllByText("51.4%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("55.6%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("61.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("63.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Moderate/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/High/).length).toBeGreaterThan(0);
  });

  it("preserves the asymmetric one-team directional rule: only the confirmed team is a qualifier row", () => {
    const { container } = renderPanel();
    const rows = container.querySelectorAll("details[data-tier]");
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(within(row as HTMLElement).getAllByText("ATL").length).toBeGreaterThan(0);
    }
    // PIT never appears as a confirmed qualifier for the suppressed/pending trend.
    for (const row of rows) {
      expect(within(row as HTMLElement).queryByText("PIT")).toBeNull();
    }
  });

  it("keeps tier grouping with compact group headers", () => {
    renderPanel();
    expect(screen.getByText(/Noteworthy · 1/i)).toBeTruthy();
    expect(screen.getByText(/Contextual · 1/i)).toBeTruthy();
  });

  it("preserves pending (MATCHUP_PENDING) state in a compact awaiting-inputs list", () => {
    renderPanel();
    fireEvent.click(screen.getByText(/Awaiting inputs \(1\)/i));
    expect(screen.getByText("Awaiting opponent status")).toBeTruthy();
    expect(screen.getAllByText("PIT").length).toBeGreaterThan(0);
  });

  it("expands a row's detail on click without duplicating historical metric calculations", () => {
    const { container } = renderPanel();
    const [firstRow] = container.querySelectorAll("details[data-tier]");
    const summary = firstRow.querySelector("summary") as HTMLElement;
    expect(summary.tagName).toBe("SUMMARY");
    expect(firstRow.hasAttribute("open")).toBe(false);
    fireEvent.click(summary);
    expect(firstRow.hasAttribute("open")).toBe(true);
    expect(within(firstRow as HTMLElement).getByText("Exact definition")).toBeTruthy();
    expect(within(firstRow as HTMLElement).getByText("Research interpretation")).toBeTruthy();
  });

  it("renders a mobile-only stacked row and a desktop-only column row for the same data (no forced desktop table on mobile)", () => {
    const { container } = renderPanel();
    const mobileRows = container.querySelectorAll("summary > div.md\\:hidden");
    const desktopCells = container.querySelectorAll("summary > span.hidden.md\\:block");
    expect(mobileRows.length).toBe(2);
    expect(desktopCells.length).toBeGreaterThan(0);
  });

  it("never emits a fixed row width wider than a 390px mobile viewport", () => {
    const { container } = renderPanel();
    const widthDeclarations = [...container.querySelectorAll<HTMLElement>("[style]")]
      .map((element) => element.getAttribute("style") ?? "")
      .filter((style) => /(^|[^-])width\s*:/.test(style));
    expect(widthDeclarations).toHaveLength(0);
  });

  it("keeps the header summary strip compact while preserving identity and counts", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Situational Trends" })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy(); // Confirmed count
    expect(screen.getByRole("link", { name: /View all NFL trends/i })).toHaveAttribute("href", "/nfl/trends");
  });
});
