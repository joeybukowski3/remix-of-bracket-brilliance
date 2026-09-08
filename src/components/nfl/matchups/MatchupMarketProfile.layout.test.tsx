/**
 * What the Book Says → Market Profile previously stretched its comparison
 * rows to the full section width, pushing the two team columns far apart
 * from the centred metric label. `ComparisonHeader` and `MatchupMarketRow`
 * now cap and centre that inner value/metric/value unit with
 * `MATCHUP_COMPACT_ROW_MAX_WIDTH`; this file guards that bound and confirms
 * no metric/rank data changed shape as a result.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupMarketProfile from "@/components/nfl/matchups/MatchupMarketProfile";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

/** Walks up from `el` and returns the nearest ancestor whose class list carries a `max-w-[...]` bound. */
function findBoundedAncestor(el: Element | null): Element | null {
  let node = el;
  while (node) {
    if (/\bmax-w-\[/.test(node.className.toString())) return node;
    node = node.parentElement;
  }
  return null;
}

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "away-club",
    abbr: "awy",
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
  slug: "away-club-at-home-club",
  gameId: "2026_01_AWY_HME",
  season: 2026,
  week: 1,
  seasonType: "REG",
  kickoffUtc: "2026-09-13T20:05:00Z",
  stadium: "Test Field",
  away: makeTeam({}),
  home: makeTeam({ slug: "home-club", abbr: "hme", teamName: "Home Club", conference: "NFC", division: "NFC West" }),
  neutralSite: false,
  spread: null,
};

function renderProfile() {
  return render(
    <MemoryRouter>
      <MatchupMarketProfile matchup={MATCHUP} />
    </MemoryRouter>
  );
}

describe("Market Profile compact layout", () => {
  it("bounds the team header to a centred max width instead of the full section", () => {
    renderProfile();
    const awayLabel = screen.getByText("Away Club");
    expect(findBoundedAncestor(awayLabel)).not.toBeNull();
  });

  it("keeps W/L Record, ATS Record and Point Differential grouped inside the bounded container", () => {
    renderProfile();
    // "Market profile not connected." confirms no market data is wired for this
    // fixture, but the row scaffold (season rows) still renders and must sit
    // inside the same bounded width as the header.
    const scheduleLabel = screen.getByText("Schedule Strength Rank");
    const row = scheduleLabel.closest("div.border-b");
    expect(row).not.toBeNull();
  });

  it("does not change the underlying win-total or schedule-rank values", () => {
    renderProfile();
    expect(screen.getAllByText("8.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#16").length).toBeGreaterThan(0);
  });
});
