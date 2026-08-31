import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupCategoryAdvantage from "./MatchupCategoryAdvantage";
import MatchupComparisonSnapshot from "./MatchupComparisonSnapshot";
import { categorySideStrength, formatMetricDifference } from "./matchupVisualMath";
import MatchupExplainer from "./MatchupExplainer";
import type { MatchupDisplayMetric } from "./matchupDisplayMetrics";
import { MATCHUP_CATEGORIES, type CategoryAdvantageResult, type MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";
import type { NflMatchup } from "@/lib/nfl/matchups";

const matchup = {
  away: { slug: "away", abbr: "awy", teamName: "Away Club" },
  home: { slug: "home", abbr: "hme", teamName: "Home Club" },
} as NflMatchup;

const metric = (overrides: Partial<MatchupDisplayMetric> = {}): MatchupDisplayMetric => ({
  key: "off.epaPerPlay",
  label: "EPA / Play",
  direction: "higher-is-better",
  away: { value: 0.215, rank: 1, formatted: "+0.215" },
  home: { value: -0.01, rank: 19, formatted: "-0.010" },
  comparison: "away",
  ...overrides,
});

describe("reference refinement presentation", () => {
  it("sizes each edge-map side from the existing category authority counts", () => {
    const result: CategoryAdvantageResult = {
      categoryId: "overall",
      result: "away",
      awayLeads: 4,
      homeLeads: 1,
      ties: 1,
      eligible: 6,
    };
    expect(categorySideStrength(result, "away")).toBeCloseTo(66.67, 1);
    expect(categorySideStrength(result, "home")).toBeCloseTo(16.67, 1);
  });

  it("keeps row direction on the shared CategoryAdvantageResult", () => {
    const results = Object.fromEntries(MATCHUP_CATEGORIES.map((category, index) => [category.id, {
      categoryId: category.id,
      result: index === 0 ? "away" : index === 1 ? "home" : "even",
      awayLeads: index === 0 ? 4 : 2,
      homeLeads: index === 1 ? 4 : 2,
      ties: 0,
      eligible: 4,
    }])) as Record<MatchupCategoryId, CategoryAdvantageResult>;
    render(<MatchupCategoryAdvantage matchup={matchup} results={results} onOpenCategory={() => undefined} />);
    expect(screen.getByRole("button", { name: /^Overall Quality:/ })).toHaveAttribute("data-edge", "away");
    expect(screen.getByRole("button", { name: /^Offense:/ })).toHaveAttribute("data-edge", "home");
  });

  it("formats direct raw gaps without inventing normalized scores", () => {
    expect(formatMetricDifference(metric())).toBe("+0.225");
    expect(formatMetricDifference(metric({
      key: "off.successRate",
      away: { value: 48.2, rank: 4, formatted: "48.2%" },
      home: { value: 42.7, rank: 18, formatted: "42.7%" },
    }))).toBe("+5.5 pp");
    expect(formatMetricDifference(metric({ comparison: "missing", home: { value: null, rank: null, formatted: "N/A" } }))).toBeNull();
  });

  it("renders every registry category and every supplied metric in compact blocks", () => {
    const categoryMetrics = Object.fromEntries(MATCHUP_CATEGORIES.map((category) => [
      category.id,
      [metric({ key: `${category.id}.metric`, label: `${category.label} metric` })],
    ])) as Record<MatchupCategoryId, MatchupDisplayMetric[]>;
    render(<MatchupComparisonSnapshot matchup={matchup} categoryMetrics={categoryMetrics} />);
    for (const category of MATCHUP_CATEGORIES) {
      expect(screen.getByRole("heading", { name: category.label })).toBeTruthy();
      expect(screen.getByText(`${category.label} metric`)).toBeTruthy();
    }
  });

  it("splits only the dense passing and rushing blocks", () => {
    const denseMetrics = (categoryId: MatchupCategoryId) => Array.from({ length: 10 }, (_, index) => metric({
      key: `${categoryId}.metric-${index}`,
      label: `${categoryId} metric ${index}`,
    }));
    const categoryMetrics = Object.fromEntries(MATCHUP_CATEGORIES.map((category) => [
      category.id,
      denseMetrics(category.id),
    ])) as Record<MatchupCategoryId, MatchupDisplayMetric[]>;
    const { container } = render(<MatchupComparisonSnapshot matchup={matchup} categoryMetrics={categoryMetrics} />);

    expect(container.querySelector(".matchup-snapshot__block--offense .is-split")).toBeNull();
    expect(container.querySelector(".matchup-snapshot__block--defense .is-split")).toBeNull();
    expect(container.querySelectorAll(".matchup-snapshot__block--passing table")).toHaveLength(2);
    expect(container.querySelectorAll(".matchup-snapshot__block--rushing table")).toHaveLength(2);
  });

  it("keeps the explanatory copy present and collapsed by default at page-bottom placement", () => {
    const { container } = render(<MatchupExplainer sampleSettings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS} />);
    expect(screen.getByText("What this page is telling you")).toBeTruthy();
    expect(container.querySelector("details")?.open).toBe(false);
  });
});
