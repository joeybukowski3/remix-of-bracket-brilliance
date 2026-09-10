import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

/**
 * The harness renders every category's full metric set at once, which jsdom
 * renders slowly under load — the same reason MatchupRedesign.test.tsx gives
 * its heavy suites headroom over the 5s default.
 */
const HEAVY_RENDER_TIMEOUT_MS = 30_000;

describe("MatchupComparisonPanel accordion on a compact (mobile) viewport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every category as a collapsed accordion row by default", () => {
    const restore = mockCompactViewport();
    const { metrics, results } = buildCategoryData({ resolver: leadingResolver });
    render(
      <MemoryRouter>
        <MatchupComparisonPanel
          matchup={MATCHUP}
          categoryMetrics={metrics}
          categoryResults={results}
          pendingCategory={null}
          navigationToken={0}
        />
      </MemoryRouter>
    );
    restore();

    for (const category of MATCHUP_CATEGORIES) {
      const trigger = screen.getByRole("button", { name: new RegExp(`^${category.label}`) });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  }, HEAVY_RENDER_TIMEOUT_MS);

  it("expands a category's content when its row is tapped, and collapses it again on a second tap", () => {
    const restore = mockCompactViewport();
    const { metrics, results } = buildCategoryData({ resolver: leadingResolver });
    render(
      <MemoryRouter>
        <MatchupComparisonPanel
          matchup={MATCHUP}
          categoryMetrics={metrics}
          categoryResults={results}
          pendingCategory={null}
          navigationToken={0}
        />
      </MemoryRouter>
    );
    restore();

    const trigger = screen.getByRole("button", { name: /^Offense/ });
    const panel = document.getElementById("comparison-offense-panel");
    expect(panel).toHaveAttribute("hidden");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    // Team cells show league rank only (away rank 4 → "4th"), never the raw stat.
    expect(within(panel as HTMLElement).queryByText("10.0")).toBeNull();
    expect(within(panel as HTMLElement).getAllByText(/4th/).length).toBeGreaterThan(0);

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
  });

  it("opens the destination category's accordion row when arriving via the category navigation", () => {
    const restore = mockCompactViewport();
    const { metrics, results } = buildCategoryData({ resolver: leadingResolver });
    render(
      <MemoryRouter>
        <MatchupComparisonPanel
          matchup={MATCHUP}
          categoryMetrics={metrics}
          categoryResults={results}
          pendingCategory="defense"
          navigationToken={1}
        />
      </MemoryRouter>
    );
    restore();

    const trigger = screen.getByRole("button", { name: /^Defense/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById("comparison-defense-panel");
    expect(panel).not.toHaveAttribute("hidden");
  });
});
