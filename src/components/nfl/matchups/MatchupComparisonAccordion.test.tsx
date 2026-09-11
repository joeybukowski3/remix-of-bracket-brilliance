import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupComparisonPanel from "@/components/nfl/matchups/MatchupComparisonPanel";
import {
  categoryResultFrom,
  resolveCategoryMetrics,
  type MatchupDisplayMetric,
  type MatchupMetricSources,
} from "@/components/nfl/matchups/matchupDisplayMetrics";
import {
  MATCHUP_CATEGORIES,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import type { NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "away-club", abbr: "awy", teamName: "Away Club", division: "AFC East", conference: "AFC",
    color: "#000000", projectedWins: 8.5, marketWinTotal: 8.5, modelVsMarketGap: 0,
    recommendationLabel: "Pass", confidenceLabel: "Low", regressionGap: 0,
    regressionSignal: "Neutral", powerRank: 16, offenseRank: 16, defenseRank: 16,
    scheduleRank: 16, scheduleLabel: "Average", record2025: "8-9", overallPct: 0,
    offensePct: 0, defensePct: 0, headline: "", editorialSummary: "",
    strengths: [], concerns: [], keyQuestions: [],
    ...overrides,
  };
}

const AWAY = makeTeam({});
const HOME = makeTeam({ slug: "home-club", abbr: "hme", teamName: "Home Club", conference: "NFC", division: "NFC West" });

const MATCHUP: NflMatchup = {
  slug: "away-club-at-home-club",
  gameId: "2026_01_AWY_HME",
  season: 2026,
  week: 1,
  seasonType: "REG",
  kickoffUtc: "2026-09-13T20:05:00Z",
  stadium: "Test Field",
  away: AWAY,
  home: HOME,
  neutralSite: false,
  spread: null,
};

const leadingResolver: NflMatchupMetricResolver = (teamSlug, metricKey) => {
  const isAway = teamSlug === AWAY.slug;
  return { key: metricKey, value: isAway ? 10 : 5, rank: isAway ? 4 : 20, formattedValue: isAway ? "10.0" : "5.0" };
};

function buildCategoryData(sources: MatchupMetricSources) {
  const metrics = {} as Record<MatchupCategoryId, MatchupDisplayMetric[]>;
  const results = {} as Record<MatchupCategoryId, CategoryAdvantageResult>;
  for (const category of MATCHUP_CATEGORIES) {
    const rows = resolveCategoryMetrics(category, MATCHUP, sources);
    metrics[category.id] = rows;
    results[category.id] = categoryResultFrom(category.id, rows);
  }
  return { metrics, results };
}

/** The approved mockup uses one horizontal pill scroller on phones — no wrap. */
function mockCompactViewport() {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(max-width: 639px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  return () => {
    window.matchMedia = original;
  };
}

const HEAVY_RENDER_TIMEOUT_MS = 30_000;

function renderPanel(pendingCategory: MatchupCategoryId | null = null, navigationToken = 0) {
  const { metrics, results } = buildCategoryData({ resolver: leadingResolver });
  return render(
    <MemoryRouter>
      <MatchupComparisonPanel
        matchup={MATCHUP}
        categoryMetrics={metrics}
        categoryResults={results}
        pendingCategory={pendingCategory}
        navigationToken={navigationToken}
      />
    </MemoryRouter>
  );
}

describe("MatchupComparisonPanel category controls (compact / mobile viewport)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the categories as a single horizontal pill scroller, not a wrapped stack", () => {
    const restore = mockCompactViewport();
    renderPanel();
    restore();

    const tablist = screen.getByRole("tablist", { name: "Statistical comparison categories" });
    expect(tablist.className).toMatch(/flex-nowrap/);
    expect(tablist.className).toMatch(/overflow-x-auto/);
    for (const category of MATCHUP_CATEGORIES) {
      expect(screen.getByRole("tab", { name: category.label })).toBeInTheDocument();
    }
  }, HEAVY_RENDER_TIMEOUT_MS);

  it("shows one category's table at a time and switches on selection", () => {
    const restore = mockCompactViewport();
    renderPanel();
    restore();

    const firstCategory = MATCHUP_CATEGORIES[0];
    const other = MATCHUP_CATEGORIES.find((c) => c.id !== firstCategory.id)!;
    const firstPanel = document.getElementById(firstCategory.hash);
    const otherPanel = document.getElementById(other.hash);
    // The first registry category is selected by default.
    expect(firstPanel).not.toHaveAttribute("hidden");
    expect(otherPanel).toHaveAttribute("hidden");
    // Rank tiles carry the league rank only (away rank 4 → "4th"); the raw stat
    // lives under the bar, never inside the tile.
    const tiles = Array.from(
      (firstPanel as HTMLElement).querySelectorAll(".matchup-metric-table__value")
    ).map((t) => t.textContent ?? "");
    expect(tiles.some((t) => /4th/.test(t))).toBe(true);
    expect(tiles.every((t) => !/10\.0/.test(t))).toBe(true);
    // The raw value is present in the row, under its side of the bar.
    expect(
      (firstPanel as HTMLElement).querySelectorAll(".matchup-metric-table__val").length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: other.label }));
    expect(firstPanel).toHaveAttribute("hidden");
    expect(otherPanel).not.toHaveAttribute("hidden");
  });

  it("selects the destination category when arriving via the category navigation", () => {
    const restore = mockCompactViewport();
    renderPanel("defense", 1);
    restore();

    expect(screen.getByRole("tab", { name: "Defense" })).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("comparison-defense")).not.toHaveAttribute("hidden");
  });
});
