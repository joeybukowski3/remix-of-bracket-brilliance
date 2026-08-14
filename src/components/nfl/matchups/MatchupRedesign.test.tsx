import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupAvailabilityPanel from "@/components/nfl/matchups/MatchupAvailabilityPanel";
import MatchupComparisonPanel from "@/components/nfl/matchups/MatchupComparisonPanel";
import MatchupIdentityHeader from "@/components/nfl/matchups/MatchupIdentityHeader";
import MatchupModelDetails from "@/components/nfl/matchups/MatchupModelDetails";
import MatchupOverviewPanel from "@/components/nfl/matchups/MatchupOverviewPanel";
import MatchupTabRow from "@/components/nfl/matchups/MatchupTabRow";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import {
  MATCHUP_TABS,
  matchupPanelId,
  matchupTabId,
  parseMatchupHash,
  useMatchupNavigation,
} from "@/components/nfl/matchups/matchupNavigation";
import {
  categoryResultFrom,
  describeMetricAdvantage,
  resolveCategoryMetrics,
  type MatchupDisplayMetric,
  type MatchupMetricSources,
} from "@/components/nfl/matchups/matchupDisplayMetrics";
import {
  MATCHUP_CATEGORIES,
  getMatchupCategory,
  matchupCategoryTriggerId,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import { formatSpread, formatTotal, type MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import type { NflInjuryEntry, NflInjuryResolver } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";
import type { GameProjection } from "@/lib/nfl/projectionData";

/**
 * Redesign behaviour, exercised through the production components.
 *
 * The fixtures below are deliberately anonymous clubs. Nothing in the tab
 * navigation, the category jump or the advantage roll-up may depend on a
 * particular franchise, so nothing in these tests names one.
 */

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

const MARKET: MarketCurrentGame = {
  gameId: MATCHUP.gameId,
  season: 2026,
  week: 1,
  seasonType: "REG",
  homeAbbr: "hme",
  awayAbbr: "awy",
  neutralSite: false,
  spread: { home: -3.5, away: 3.5 },
  moneyline: { home: -198, away: 164 },
  total: 44.5,
  rawSpreadLine: 3.5,
};

const PROJECTION_SIDE = {
  offAdj: 0.1,
  defAdj: -0.05,
  pdgAdj: 4,
  compositeZ: 0,
  sampleGames: 17,
  lastSampleGameId: "2025_18_AWY_HME",
  priorSeason: 2025,
  priorWeight: 1,
  currentSeasonGames: 0,
  priorSeasonGames: 17,
};

const PROJECTION: GameProjection = {
  gameId: MATCHUP.gameId,
  season: 2026,
  week: 1,
  kickoff: "2026-09-13T20:05:00Z",
  awayTeam: "awy",
  homeTeam: "hme",
  neutralSite: false,
  beta: 4.63,
  away: { ...PROJECTION_SIDE },
  home: { ...PROJECTION_SIDE, compositeZ: 0.2934 },
  strengthDiff: 0.2934,
  neutralMargin: 1.3586,
  homeFieldAdvantage: 2,
  projectedHomeMargin: 3.3586,
  projectedSpread: { favoriteTeam: "hme", line: -3.4, display: "HME −3.4" },
};

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

const emptyResolver: NflMatchupMetricResolver = () => null;

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

/**
 * Mirror of the route's composition: shared header, the tab row, and one panel
 * per tab with only the selected one visible.
 */
function Harness({
  sources = { resolver: leadingResolver },
}: {
  sources?: MatchupMetricSources;
}) {
  const navigation = useMatchupNavigation();
  const { metrics, results } = buildCategoryData(sources);

  return (
    <div>
      <MatchupTabRow
        activeTab={navigation.tab}
        onSelect={navigation.selectTab}
        token={navigation.token}
      />
      {MATCHUP_TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={matchupPanelId(tab.id)}
          aria-labelledby={matchupTabId(tab.id)}
          hidden={navigation.tab !== tab.id}
        >
          {tab.id === "overview" && (
            <MatchupOverviewPanel
              matchup={MATCHUP}
              categoryResults={results}
              onOpenCategory={navigation.openCategory}
              projection={PROJECTION}
              market={MARKET}
              projectionLoading={false}
              advantages={[]}
              angles={[]}
              sampleSettings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS}
            />
          )}
          {tab.id === "comparison" && (
            <MatchupComparisonPanel
              matchup={MATCHUP}
              categoryMetrics={metrics}
              categoryResults={results}
              onOpenCategory={navigation.openCategory}
              pendingCategory={navigation.category}
              navigationToken={navigation.token}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** The shared test setup already stubs this; these tests assert against it. */
const scrollIntoView = window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;

/**
 * The harness mounts every panel and every metric row at once, which jsdom
 * renders slowly. These suites are given headroom over the 5s default so a
 * loaded machine reports real failures rather than timeouts.
 */
const HEAVY_RENDER_TIMEOUT_MS = 30_000;

beforeEach(() => {
  window.history.replaceState(null, "", "/nfl/matchups/away-club-at-home-club");
  scrollIntoView.mockClear();
});

describe("hash parsing", () => {
  it("defaults to Overview for an empty or unknown fragment", () => {
    expect(parseMatchupHash("")).toEqual({ tab: "overview", category: null });
    expect(parseMatchupHash("#nope")).toEqual({ tab: "overview", category: null });
    expect(parseMatchupHash("#comparison-market")).toEqual({ tab: "overview", category: null });
  });

  it("resolves each tab fragment", () => {
    for (const tab of MATCHUP_TABS) {
      expect(parseMatchupHash(`#${tab.id}`)).toEqual({ tab: tab.id, category: null });
    }
  });

  it("resolves every category fragment onto Team Comparison", () => {
    for (const category of MATCHUP_CATEGORIES) {
      expect(parseMatchupHash(`#${category.hash}`)).toEqual({
        tab: "comparison",
        category: category.id,
      });
    }
  });
});

describe("tabs", () => {
  it("selects Overview by default and shows only its panel", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById(matchupPanelId("overview"))).not.toHaveAttribute("hidden");
    expect(document.getElementById(matchupPanelId("comparison"))).toHaveAttribute("hidden");
  });

  it("uses a roving tabindex", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
  });

  it("switches panel and hash on selection", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Model Details" }));
    expect(window.location.hash).toBe("#model");
    expect(document.getElementById(matchupPanelId("model"))).not.toHaveAttribute("hidden");
    expect(document.getElementById(matchupPanelId("overview"))).toHaveAttribute("hidden");
  });

  it("moves through the tabs with Arrow, Home and End", () => {
    render(<Harness />);
    const tablist = screen.getByRole("tablist", { name: "Matchup sections" });

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Team Comparison" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByRole("tab", { name: "Model Details" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(window.location.hash).toBe("#model");

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens the tab named by a direct visit", () => {
    window.history.replaceState(null, "", "#availability");
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "Availability & Snaps" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("scrolls the selected tab fully into view", () => {
    render(<Harness />);
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("tab", { name: "Model Details" }));
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "nearest", inline: "nearest" })
    );
  });
}, HEAVY_RENDER_TIMEOUT_MS);

describe("category rows", () => {
  it("renders one interactive row per category, in registry order", () => {
    render(<Harness />);
    const table = screen.getByRole("table", { name: /which team leads each comparison category/i });
    const rows = within(table).getAllByRole("button");
    expect(rows).toHaveLength(MATCHUP_CATEGORIES.length);
    rows.forEach((row, index) => {
      expect(row).toHaveAccessibleName(
        new RegExp(`^${MATCHUP_CATEGORIES[index].label}:`)
      );
    });
  });

  it.each(MATCHUP_CATEGORIES.map((category) => [category.id, category.label] as const))(
    "opens Team Comparison at %s when its row is activated",
    async (id, label) => {
      render(<Harness />);
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`^${label}:`) })
      );

      expect(window.location.hash).toBe(`#${getMatchupCategory(id).hash}`);
      expect(screen.getByRole("tab", { name: "Team Comparison" })).toHaveAttribute(
        "aria-selected",
        "true"
      );

      const trigger = document.getElementById(matchupCategoryTriggerId(id));
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    }
  );

  it("scrolls the destination group into view", () => {
    render(<Harness />);
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Defense:/ }));
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  });

  it("opens, expands and focuses from a direct category visit", async () => {
    window.history.replaceState(null, "", "#comparison-trenches");
    render(<Harness />);

    expect(screen.getByRole("tab", { name: "Team Comparison" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const trigger = document.getElementById(matchupCategoryTriggerId("trenches"));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("responds to a fragment changed without a history traversal", async () => {
    // An in-page link or an edited address bar fires hashchange and no
    // popstate; the jump must still run.
    render(<Harness />);
    window.location.hash = "#comparison-rushing";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Team Comparison" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
    const trigger = document.getElementById(matchupCategoryTriggerId("rushing"));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("restores the previous tab on Back and the category on Forward", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("tab", { name: "Model Details" }));
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: /^Passing:/ }));
    expect(window.location.hash).toBe("#comparison-passing");

    window.history.back();
    await waitFor(() => expect(window.location.hash).toBe("#overview"));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );

    window.history.forward();
    await waitFor(() => expect(window.location.hash).toBe("#comparison-passing"));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Team Comparison" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
  });

  it("shows EVEN and N/A as badges without a crest", () => {
    const { rerender } = render(<Harness sources={{ resolver: emptyResolver }} />);
    // With no resolver values and no power board, nothing is comparable.
    const table = screen.getByRole("table", {
      name: /which team leads each comparison category/i,
    });
    expect(within(table).getAllByText("N/A").length).toBe(MATCHUP_CATEGORIES.length);
    expect(within(table).queryByRole("img")).toBeNull();
    rerender(<Harness sources={{ resolver: emptyResolver }} />);
  });
}, HEAVY_RENDER_TIMEOUT_MS);

describe("metric resolution", () => {
  it("compares raw values, not the formatted display string", () => {
    // A resolver whose display string says "N/A" while the raw value is finite:
    // the comparison must still come from the numbers.
    const conflicting: NflMatchupMetricResolver = (teamSlug, metricKey) => ({
      key: metricKey,
      value: teamSlug === AWAY.slug ? 7 : 3,
      rank: null,
      formattedValue: "N/A",
    });

    const rows = resolveCategoryMetrics(getMatchupCategory("offense"), MATCHUP, {
      resolver: conflicting,
    });
    // Catalogue rows only — the power-model baseline reads a different source.
    const comparable = rows.filter(
      (row) => row.direction === "higher-is-better" && !row.key.startsWith("team.")
    );
    expect(comparable.length).toBeGreaterThan(0);
    for (const row of comparable) {
      expect(row.away.formatted).toBe("N/A");
      expect(row.comparison).toBe("away");
    }

    const result = categoryResultFrom("offense", rows);
    expect(result.result).toBe("away");
    expect(result.eligible).toBeGreaterThan(0);
  });

  it("keeps unavailable conventional metrics at N/A and counts them as missing", () => {
    const rows = resolveCategoryMetrics(getMatchupCategory("offense"), MATCHUP, {
      resolver: emptyResolver,
    });
    const thirdDown = rows.find((row) => row.key === "off.thirdDownConversion");
    expect(thirdDown?.away.formatted).toBe("N/A");
    expect(thirdDown?.comparison).toBe("missing");
  });

  it("excludes a context-only metric as not compared", () => {
    const rows = resolveCategoryMetrics(getMatchupCategory("offense"), MATCHUP, {
      resolver: leadingResolver,
    });
    const top = rows.find((row) => row.key === "off.timeOfPossession");
    expect(top?.comparison).toBe("not-comparable");
  });

  it("states the advantage in words from live abbreviations", () => {
    expect(describeMetricAdvantage("away", "awy", "hme")).toBe("AWY advantage");
    expect(describeMetricAdvantage("home", "awy", "hme")).toBe("HME advantage");
    expect(describeMetricAdvantage("tie", "awy", "hme")).toBe("Even");
    expect(describeMetricAdvantage("missing", "awy", "hme")).toBe("No data");
    expect(describeMetricAdvantage("not-comparable", "awy", "hme")).toBe("Not compared");
  });
});

describe("team crest", () => {
  it("falls back to this team's abbreviation when the image fails", () => {
    render(<NflTeamCrest team={HOME} side="home" label="Home Club" />);
    const image = screen.getByRole("img", { name: "Home Club" });
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "Home Club" })).toHaveTextContent("HME");
  });

  it("falls back immediately when there is no abbreviation to build a source from", () => {
    render(<NflTeamCrest team={makeTeam({ abbr: "" })} side="away" label="Away Club" />);
    expect(screen.getByRole("img", { name: "Away Club" })).toHaveTextContent("NFL");
  });

  it("holds its dimensions so a failure causes no layout shift", () => {
    const { container } = render(<NflTeamCrest team={AWAY} side="away" size={32} />);
    const before = container.firstElementChild as HTMLElement;
    expect(before.style.width).toBe("32px");
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    const after = container.firstElementChild as HTMLElement;
    expect(after.style.width).toBe("32px");
    expect(after.style.height).toBe("32px");
  });
});

describe("market states", () => {
  it("renders the published line using the shared formatters", () => {
    render(
      <MemoryRouter>
        <MatchupIdentityHeader matchup={MATCHUP} market={MARKET} />
      </MemoryRouter>
    );
    // Formatting comes from marketData, typographic minus included, so the
    // header states the line exactly as every other surface does.
    expect(screen.getByText(`HME ${formatSpread(MARKET.spread.home)}`)).toBeInTheDocument();
    expect(screen.getByText(formatTotal(MARKET.total))).toBeInTheDocument();
  });

  it("states plainly when nothing has been priced", () => {
    render(
      <MemoryRouter>
        <MatchupIdentityHeader matchup={MATCHUP} market={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("No market line published for this game yet.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is estimated in their place/)).toBeInTheDocument();
  });
});

describe("availability states", () => {
  const entry: NflInjuryEntry = {
    playerId: "1",
    playerName: "Test Player",
    position: "CB",
    depthChartPosition: "CB",
    unit: "defense",
    gameStatus: "OUT",
    practiceStatus: "DID_NOT_PARTICIPATE",
    reserveStatus: null,
    injuryDescription: "Hamstring",
    lastGameSnapPct: null,
    seasonSnapPct: 74,
  };

  const emptyInjuries: NflInjuryResolver = () => null;

  it.each([
    ["Injury report not connected."],
    ["2026 injury and snap data has not been published yet."],
    ["No reported injuries."],
  ])("keeps the distinct empty state %s", (message) => {
    render(
      <MatchupAvailabilityPanel
        matchup={MATCHUP}
        resolver={emptyInjuries}
        unavailableMessage={message}
      />
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("distinguishes a did-not-dress N/A from a dressed 0%", () => {
    const resolver: NflInjuryResolver = (slug) =>
      slug === AWAY.slug
        ? {
            entries: [entry, { ...entry, playerId: "2", lastGameSnapPct: 0, seasonSnapPct: 0 }],
            summary: { out: 2, doubtful: 0, questionable: 0, reserve: 0 },
          }
        : null;

    render(
      <MatchupAvailabilityPanel
        matchup={MATCHUP}
        resolver={resolver}
        unavailableMessage="Injury report not connected."
      />
    );
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    // Practice participation stays separate from the game designation.
    expect(screen.getAllByText("Out").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DNP/).length).toBeGreaterThan(0);
  });
});

describe("model details", () => {
  it("renders the three real breakdown terms", () => {
    render(
      <MatchupModelDetails
        matchup={MATCHUP}
        projection={PROJECTION}
        modelVersion="nfl-spread-v0.1.0"
        generatedAt="2026-08-04T12:17:35.907Z"
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText("Team Strength Difference")).toBeInTheDocument();
    expect(screen.getByText("Home Field")).toBeInTheDocument();
    expect(screen.getByText("Projected Margin")).toBeInTheDocument();

    // The unverified prototype claim, the invented five-factor weighting and
    // the stale TeamRankings attribution must not reach production.
    fireEvent.click(screen.getByRole("button", { name: /Known limitations/ }));
    fireEvent.click(screen.getByRole("button", { name: /Data provenance/ }));
    expect(screen.queryByText(/weather/i)).toBeNull();
    expect(screen.queryByText(/special teams/i)).toBeNull();
    expect(screen.queryByText(/TeamRankings/i)).toBeNull();
    expect(screen.queryByText(/five-factor/i)).toBeNull();
    // "Confidence" may appear only in the sentence denying that one exists.
    for (const node of screen.queryAllByText(/confidence/i)) {
      expect(node.textContent).toMatch(/No win probability, confidence rating/);
    }
  });

  it("omits metadata rows rather than printing a placeholder", () => {
    render(
      <MatchupModelDetails
        matchup={MATCHUP}
        projection={PROJECTION}
        modelVersion={null}
        generatedAt={null}
        loading={false}
        error={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Data provenance/ }));
    expect(screen.queryByText("Model version")).toBeNull();
    expect(screen.queryByText("Artifact generated")).toBeNull();
    expect(screen.getByText("nflfastR play-by-play")).toBeInTheDocument();
  });

  it("never synthesises a spread when the projection is missing", () => {
    render(
      <MatchupModelDetails
        matchup={MATCHUP}
        projection={null}
        modelVersion={null}
        generatedAt={null}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText("Model projection not available for this matchup.")).toBeInTheDocument();
    expect(screen.getByText(/No spread has been estimated/)).toBeInTheDocument();
  });
});

describe("overview projection card", () => {
  it("states the unavailable projection without estimating one", () => {
    render(
      <MatchupOverviewPanel
        matchup={MATCHUP}
        categoryResults={buildCategoryData({ resolver: leadingResolver }).results}
        onOpenCategory={() => undefined}
        projection={null}
        market={MARKET}
        projectionLoading={false}
        advantages={[]}
        angles={[]}
        sampleSettings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS}
      />
    );
    expect(screen.getByText("Overall model assessment not yet available.")).toBeInTheDocument();
  });

  it("keeps the category note separate from the projection", () => {
    render(
      <MatchupOverviewPanel
        matchup={MATCHUP}
        categoryResults={buildCategoryData({ resolver: leadingResolver }).results}
        onOpenCategory={() => undefined}
        projection={PROJECTION}
        market={MARKET}
        projectionLoading={false}
        advantages={[]}
        angles={[]}
        sampleSettings={DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS}
      />
    );
    expect(
      screen.getByText(/They are not the model projection\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No pick, best bet or confidence rating is produced\./)
    ).toBeInTheDocument();
    // The removed page-level tally must not come back.
    expect(screen.queryByText(/of 6 categories/i)).toBeNull();
  });
});

/**
 * Category snapshot strip.
 *
 * Registry-driven, counting only comparable metrics, and carrying no aggregate
 * figure — the three properties that distinguish it from the page-level tally
 * this surface deliberately removed.
 */
describe("category snapshot", () => {
  const openComparison = () => {
    render(<Harness />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("tab", { name: "Team Comparison" }));
    return screen.getByRole("region", { name: /category snapshot/i });
  };

  it(
    "renders one tile per registry category, in registry order",
    async () => {
      const strip = openComparison();
      const tiles = within(strip).getAllByRole("button");

      expect(tiles).toHaveLength(MATCHUP_CATEGORIES.length);
      MATCHUP_CATEGORIES.forEach((category, index) => {
        expect(within(tiles[index]).getByText(category.label)).toBeInTheDocument();
      });
    },
    HEAVY_RENDER_TIMEOUT_MS
  );

  it(
    "counts only comparable metrics in the denominator, not N/A rows",
    async () => {
      const { results } = buildCategoryData({ resolver: leadingResolver });
      const overall = results.overall;
      const totalRows = getMatchupCategory("overall").metrics.length;

      // Overall Quality carries a context-only row and an unresolved power
      // rating, so eligible must be smaller than the row count — otherwise this
      // test could pass without the denominator ever being the eligible count.
      expect(overall.eligible).toBeLessThan(totalRows);

      const strip = openComparison();
      const tile = within(strip).getByRole("button", { name: /Overall Quality/ });

      // The denominator is the eligible count, never the raw row count.
      expect(tile.textContent).toContain(`of ${overall.eligible}`);
      expect(tile.textContent).not.toContain(`of ${totalRows}`);
    },
    HEAVY_RENDER_TIMEOUT_MS
  );

  it(
    "carries no percentage or average-rank figure",
    async () => {
      const strip = openComparison();

      expect(within(strip).queryByText(/%/)).toBeNull();
      expect(within(strip).queryByText(/avg rank/i)).toBeNull();
      expect(within(strip).queryByText(/of 6 categories/i)).toBeNull();
    },
    HEAVY_RENDER_TIMEOUT_MS
  );

  it.each(MATCHUP_CATEGORIES.map((category) => category.id))(
    "routes %s through the existing category navigation",
    async (id) => {
      const strip = openComparison();
      const category = getMatchupCategory(id);
      const tile = within(strip).getByRole("button", { name: new RegExp(category.label) });

      fireEvent.click(tile);

      // Same fragment, same expanded group and same focus target an Overview
      // row produces — no separate jump path exists for the strip.
      await waitFor(() => {
        expect(window.location.hash).toBe(`#${category.hash}`);
      });
      const trigger = document.getElementById(matchupCategoryTriggerId(id));
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      await waitFor(() => expect(trigger).toHaveFocus());
    },
    HEAVY_RENDER_TIMEOUT_MS
  );
});
