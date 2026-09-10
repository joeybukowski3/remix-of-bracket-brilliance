import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NflHeadToHeadMetricRow from "@/components/nfl/matchups/NflHeadToHeadMetricRow";
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
  };
}

const AWAY = makeTeam({});
const HOME = makeTeam({
  slug: "home-club",
  abbr: "hme",
  teamName: "Home Club",
  conference: "NFC",
  division: "NFC West",
});

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

const baseProps = {
  leftTeamName: "Away Club",
  rightTeamName: "Home Club",
  leftTeamAbbr: "awy",
  rightTeamAbbr: "hme",
};

describe("NflHeadToHeadMetricRow", () => {
  it("shows a left-team advantage in words and points the rail left", () => {
    render(
      <NflHeadToHeadMetricRow
        {...baseProps}
        label="EPA / Play"
        leftValue="0.180"
        rightValue="0.010"
        leftRank={3}
        rightRank={22}
        leftRawValue={0.18}
        rightRawValue={0.01}
        higherIsBetter
        comparison="away"
      />
    );
    expect(screen.getByText("AWY advantage")).toBeInTheDocument();
    const rail = screen.getByRole("img", { name: /Away Club advantage/i });
    expect(rail).toHaveAttribute("data-side", "left");
    expect(rail.querySelector(".nfl-h2h-rail__fill--left")).not.toBeNull();
  });

  it("shows a right-team advantage and points the rail right", () => {
    render(
      <NflHeadToHeadMetricRow
        {...baseProps}
        label="Rush Yards / Game"
        leftValue="88.0"
        rightValue="141.0"
        leftRank={25}
        rightRank={5}
        leftRawValue={88}
        rightRawValue={141}
        higherIsBetter
        comparison="home"
      />
    );
    expect(screen.getByText("HME advantage")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Home Club advantage/i })).toHaveAttribute(
      "data-side",
      "right"
    );
  });

  it("resolves a lower-is-better metric by the better (lower) rank", () => {
    render(
      <NflHeadToHeadMetricRow
        {...baseProps}
        label="Sacks Allowed / Game"
        leftValue="1.20"
        rightValue="2.90"
        leftRank={4}
        rightRank={27}
        leftRawValue={1.2}
        rightRawValue={2.9}
        higherIsBetter={false}
        comparison="away"
      />
    );
    expect(screen.getByText("AWY advantage")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Away Club advantage/i })).toHaveAttribute(
      "data-side",
      "left"
    );
  });

  it("renders a neutral centre for a tie", () => {
    render(
      <NflHeadToHeadMetricRow
        {...baseProps}
        label="Success Rate"
        leftValue="45.0%"
        rightValue="45.0%"
        leftRank={12}
        rightRank={12}
        leftRawValue={0.45}
        rightRawValue={0.45}
        higherIsBetter
        comparison="tie"
      />
    );
    expect(screen.getByText("Even")).toBeInTheDocument();
    const rail = screen.getByRole("img", { name: /even/i });
    expect(rail).toHaveAttribute("data-side", "even");
    expect(rail.querySelector(".nfl-h2h-rail__fill")).toBeNull();
  });

  it("keeps a missing value honest and asserts no winner", () => {
    render(
      <NflHeadToHeadMetricRow
        {...baseProps}
        label="3rd Down Conversion"
        leftValue="N/A"
        rightValue="N/A"
        leftRank={null}
        rightRank={null}
        leftRawValue={null}
        rightRawValue={null}
        higherIsBetter
        comparison="missing"
      />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getAllByText("N/A")).toHaveLength(2);
    expect(screen.getAllByText("Unranked").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: /not compared/i })).toHaveAttribute("data-side", "none");
  });

  it("renders an optional context sub-label and folds it into the rail label", () => {
    render(
      <NflHeadToHeadMetricRow
        {...baseProps}
        label="Success Rate"
        contextLabel="2025 L8"
        leftValue="48.0%"
        rightValue="44.0%"
        leftRank={6}
        rightRank={19}
        leftRawValue={0.48}
        rightRawValue={0.44}
        higherIsBetter
        comparison="away"
      />
    );
    expect(screen.getByText("2025 L8")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Success Rate \(2025 L8\)/ })
    ).toBeInTheDocument();
  });
});

/** Away leads every comparable conventional metric; ranks are plausible. */
const leadingResolver: NflMatchupMetricResolver = (teamSlug, metricKey) => {
  const isAway = teamSlug === AWAY.slug;
  return {
    key: metricKey,
    value: isAway ? 10 : 5,
    rank: isAway ? 4 : 20,
    formattedValue: isAway ? "10.0" : "5.0",
  };
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

/** Forces `useIsCompactLayout("(max-width: 639px)")` to true for one test. */
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

describe("NflHeadToHeadMetricRow on a compact (mobile) viewport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts the metric label, both teams' values and both teams' ranks on one row, with the rail beneath", () => {
    const restore = mockCompactViewport();
    render(
      <NflHeadToHeadMetricRow
        {...baseProps}
        label="Success Rate"
        shortLabel="Success Rate"
        leftValue="50.5%"
        rightValue="45.8%"
        leftRank={2}
        rightRank={9}
        leftRawValue={0.505}
        rightRawValue={0.458}
        higherIsBetter
        comparison="away"
      />
    );
    restore();

    const row = document.querySelector("[data-compact-matchup-row]");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("50.5%")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("2nd")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("45.8%")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("9th")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Success Rate")).toBeInTheDocument();

    // The "AWY advantage" wording is not repeated visibly — it's carried
    // only for assistive technology, on the compact row and on the rail.
    const advantageNodes = screen.getAllByText("AWY advantage");
    for (const node of advantageNodes) {
      expect(node.className).toContain("sr-only");
    }

    expect(screen.getByRole("img", { name: /comparison rail/i })).toBeInTheDocument();
  });
});

describe("Team Comparison panel with head-to-head rows", () => {
  it("keeps the category lead-count summary in each tab panel", () => {
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

    // Offense: away leads every comparable row, so its panel reads "Leads N of N".
    // Its tab is selected first so the panel is not `hidden`.
    fireEvent.click(screen.getByRole("tab", { name: "Offense" }));
    const offense = results.offense;
    expect(offense.result).toBe("away");
    const panel = document.getElementById("comparison-offense");
    expect(panel?.textContent).toContain(`Leads ${offense.awayLeads} of ${offense.eligible}`);

    // The first category renders the shared comparison table.
    fireEvent.click(screen.getByRole("tab", { name: "Overall Quality" }));
    const openPanel = document.getElementById("comparison-overall");
    expect(within(openPanel as HTMLElement).getByRole("table")).toBeInTheDocument();
    expect((openPanel as HTMLElement).querySelector(".matchup-metric-table")).not.toBeNull();
  });
});
