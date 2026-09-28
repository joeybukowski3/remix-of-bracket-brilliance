import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

// Serve real repository fixtures through the data hook (no network in jsdom).
// require() is used deliberately: this factory is hoisted above ESM imports.
vi.mock("@/hooks/useNflSeasonData", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  const root = process.cwd();
  const teams = JSON.parse(readFileSync(join(root, "public/data/nfl/teams.json"), "utf-8")).teams;
  const gamesFile = JSON.parse(readFileSync(join(root, "public/data/nfl/2026/games.json"), "utf-8"));
  return {
    useNflSeasonData: () => ({
      loading: false,
      error: null,
      data: {
        teams,
        games: gamesFile.games,
        results: [],
        gamesMeta: gamesFile._meta ?? null,
        resultsMeta: null,
      },
    }),
  };
});

// The landing page reads the published market artifact for each card's spread.
// Served from the committed fixture so the list renders deterministically and
// jsdom never issues a fetch.
vi.mock("@/hooks/useNflMatchupMarket", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  const artifact = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/nfl/matchup-market.json"), "utf-8")
  );
  return { useNflMatchupMarket: () => ({ loading: false, error: null, artifact }) };
});
vi.mock("@/hooks/useNflBettingSplits", () => ({
  useNflBettingSplits: () => ({ loading: false, error: null, freshness: "unavailable", reason: "invalid_artifact", artifact: null, sourceCapturedAt: null, generatedAt: null }),
}));

// The matrix's live-record column reads the current-season v0.3 full-season
// artifact. Mocked empty (no completed games) so records render the
// deliberate "—" fallback rather than inventing a record.
vi.mock("@/hooks/useNflV03Artifacts", () => ({
  useNflV03Artifacts: () => ({
    loading: false,
    error: null,
    data: { season: 2026, artifacts: { fullSeason: { teams: [] } }, slots: {} },
  }),
}));

// EPA/YPP/Success Rate/Trench pipelines are independent optional enrichments;
// mocked null so the matrix renders deterministically from the mocked OVR
// board alone, with every other matrix cell at its deliberate "N/A" state.
vi.mock("@/hooks/useNflMatchupEpa", () => ({
  useNflMatchupEpa: () => ({ loading: false, error: null, artifact: null }),
}));
vi.mock("@/hooks/useNflMatchupMetrics", () => ({
  useNflMatchupMetrics: () => ({ loading: false, error: null, artifact: null }),
}));
vi.mock("@/hooks/useNflSuccessRates", () => ({
  useNflSuccessRates: () => ({ loading: false, error: null, artifact: null }),
}));
vi.mock("@/hooks/useNflTrenchMetrics", () => ({
  useNflTrenchMetrics: () => ({ loading: false, error: null, artifact: null }),
}));

vi.mock("@/hooks/useNflSituationalTrends", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  const artifact = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/nfl/2026/situational-trend-matchups.json"), "utf-8")
  );
  return { useNflSituationalTrends: () => ({ loading: false, error: null, artifact }) };
});

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="site-shell">{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

// The universal current-rating board -- deterministic and mocked so cards
// render synchronously and the "Power" line can be asserted directly rather
// than racing a real fetch.
vi.mock("@/hooks/useNflCurrentRating2026", () => ({
  useNflCurrentRating2026: () => ({
    loading: false,
    error: null,
    data: {
      season: 2026,
      state: "preseason",
      teams: [
        { abbr: "ne", team: "New England Patriots", division: "AFC East", rating: 68.4, rank: 3, evidenceWeight: 0, performanceDelta: null, gamesPlayed: 0, preseasonV04Rating: 68.4, preseasonV03Rating: 68.4, currentV03Rating: null, state: "preseason" },
        { abbr: "sea", team: "Seattle Seahawks", division: "NFC West", rating: 74.5, rank: 2, evidenceWeight: 0, performanceDelta: null, gamesPlayed: 0, preseasonV04Rating: 74.5, preseasonV03Rating: 74.5, currentV03Rating: null, state: "preseason" },
      ],
    },
  }),
}));

// Imported after mocks so they pick up the mocked hook.
import NflPlatformLayout from "@/components/nfl/NflPlatformLayout";
import NFLMatchups from "@/pages/NFLMatchups";
import NFLMatchupDetail from "@/pages/NFLMatchupDetail";
import NFLMatchupLegacyRedirect from "@/pages/nfl/NFLMatchupLegacyRedirect";
import { legacyNflMatchupPath, nflMatchupPath } from "@/lib/nfl/matchupRoutes";
import { usePageSeo } from "@/hooks/usePageSeo";
import { MATCHUP_CATEGORIES } from "@/lib/nfl/matchupCategoryAdvantage";
import {
  MATCHUP_TABS,
  matchupPanelId,
} from "@/components/nfl/matchups/matchupNavigation";

/** Exposes the router's final location so redirects can be asserted. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function currentLocation() {
  return screen.getByTestId("location").textContent;
}

// Mirrors the /nfl matchup routes in src/AppRoutes.tsx.
function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/nfl" element={<NflPlatformLayout />}>
          <Route path="matchups" element={<NFLMatchups />} />
          <Route path="matchups/:season/:weekSegment/:gameSlug" element={<NFLMatchupDetail />} />
          <Route path="matchups/:gameSlug" element={<NFLMatchupLegacyRedirect />} />
          <Route path="trends" element={<h1>NFL Trends Page</h1>} />
          <Route path="schedule" element={<h1>Schedule Page</h1>} />
          <Route path="teams/:teamSlug" element={<h1>Team Dashboard</h1>} />
        </Route>
        <Route path="/mlb" element={<h1>MLB Page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

const OPENER = "new-england-patriots-at-seattle-seahawks";
const OPENER_PATH = nflMatchupPath({ season: 2026, week: 1, slug: OPENER });

beforeEach(() => {
  window.history.replaceState(null, "", "/nfl/matchups");
});

describe("NFLMatchups landing", () => {
  it("renders inside the shared NFL platform layout", () => {
    renderRoute("/nfl/matchups");
    expect(screen.getByRole("heading", { name: /2026 NFL Weekly Matchups/i })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "NFL sitemap" })).toBeTruthy();
  });

  it("renders all 16 Week 1 games as matrix rows", () => {
    renderRoute("/nfl/matchups");
    expect(screen.getAllByText("Matchup →")).toHaveLength(16);
    expect(screen.getAllByText("Seattle Seahawks").length).toBeGreaterThan(0);
  });

  it("honors an explicit week query from the shared resolver", () => {
    renderRoute("/nfl/matchups?week=2");
    const weekPicker = screen.getByRole("group", { name: "Select week" });
    expect(within(weekPicker).getByRole("link", { name: "W2" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getAllByText("Matchup →")).toHaveLength(16);
  });

  function linksToMatchup(path: string) {
    return screen.getAllByRole("link").filter((link) => link.getAttribute("href") === path);
  }

  it("links each game's matchup control to its detail page", () => {
    // Forced to week 1 explicitly: the default week resolves relative to
    // today's date, which may no longer be week 1 by the time this suite
    // runs, but OPENER is specifically the week 1 NE-at-SEA game.
    renderRoute("/nfl/matchups?week=1");
    expect(linksToMatchup(OPENER_PATH).length).toBeGreaterThan(0);
  });

  it("links the header control and both team identity cells to the same matchup detail page, not the stat cells", () => {
    renderRoute("/nfl/matchups?week=1");
    // Header "Matchup →" control + away team identity cell + home team
    // identity cell, all pointing at the same detail page.
    expect(linksToMatchup(OPENER_PATH).length).toBe(3);
    // Stat cells are plain <td> content and are never their own link — total
    // links stay well under one per stat cell across all 16 games. The week
    // selector's links are navigation, not matchup cells, so they are excluded.
    const weekLinks = screen.getByRole("group", { name: "Select week" }).querySelectorAll("a[href]");
    expect(screen.getAllByRole("link").length - weekLinks.length).toBeLessThan(16 * 5);
  });

  it("shows the universal current OVR rank on each matrix row, not the legacy guide powerRank/overallPct", () => {
    renderRoute("/nfl/matchups");
    // Mocked useNflCurrentRating2026 values above; the guide's own powerRank/
    // overallPct for these teams differ from these figures. Rankings mode is
    // the default, so the OVR cell shows the board's own rank (#3 / #2), not
    // the raw rating value.
    const ovrCells = screen.getAllByText("OVR");
    expect(ovrCells.length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.queryByText("68.4")).toBeNull();
  });

  it("exposes page-wide Rankings/Values and Data Window controls", () => {
    renderRoute("/nfl/matchups");
    expect(screen.getByRole("tab", { name: "Rankings" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Values" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Blended" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "2026 Only" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Last 8" })).toBeTruthy();
  });

  it("switches every matrix row to Values display when the Values tab is selected, showing OVR's native scale", () => {
    renderRoute("/nfl/matchups");
    fireEvent.click(screen.getByRole("tab", { name: "Values" }));
    // OVR shows its own native JKB rating in Values mode, never the league
    // rank — the mocked 68.4-rated team's OVR cell reads 68.4, not "3".
    expect(screen.getAllByText("68.4").length).toBeGreaterThan(0);
    expect(screen.queryByText("+18.4")).toBeNull();
  });

  it("shows a compact page-level note that Success Rate and trench metrics never move with the Data Window toggle, instead of implying every cell changed", () => {
    renderRoute("/nfl/matchups");
    expect(screen.getByText(/latest published periods/i)).toBeTruthy();
  });

  it("notes the OVR Last 8 limitation in the UI once Last 8 is selected", () => {
    renderRoute("/nfl/matchups");
    expect(screen.queryByText(/no rolling 8-game composite/i)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Last 8" }));
    expect(screen.getByText(/no rolling 8-game composite/i)).toBeTruthy();
  });

  it("falls back to a deliberate '—' record rather than inventing one when no live record data exists", () => {
    renderRoute("/nfl/matchups");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("highlights Weekly Matchups in the sidebar on the index route", () => {
    renderRoute("/nfl/matchups");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const navLink = within(nav).getByRole("link", { name: /Weekly Matchups/i });
    expect(navLink.getAttribute("aria-current")).toBe("page");
  });
});

/**
 * Each test here renders the whole analyzer, which now mounts all four tab
 * panels so in-page anchors and find-in-page still reach every section. That is
 * slow under jsdom, so the suite is given headroom over the 5s default and
 * reports real failures rather than timeouts on a loaded machine.
 */
const FULL_PAGE_RENDER_TIMEOUT_MS = 30_000;

describe("NFLMatchupDetail", () => {
  it("renders the correct teams and comparison", () => {
    renderRoute(OPENER_PATH);
    expect(
      screen.getByRole("heading", { name: /New England Patriots at Seattle Seahawks — Week 1 matchup/i })
    ).toBeTruthy();
    const header = screen.getByRole("heading", { name: /Week 1 matchup/i }).closest("section")!;
    expect(within(header).getByText("New England Patriots")).toBeTruthy();
    expect(within(header).getByText("Seattle Seahawks")).toBeTruthy();
    // The offense and defense comparison sections became categories inside the
    // Team Comparison tab; both are still addressable by name.
    expect(screen.getByRole("button", { name: /^Offense:/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Defense:/ })).toBeTruthy();
    // Inside the unselected Team Comparison panel, so it is deliberately hidden
    // from the accessibility tree until that tab is chosen; addressed by id
    // rather than by role for exactly that reason.
    expect(document.getElementById("statistical-comparison-heading")).toBeTruthy();
  });

  it("renders every tab and its panel, in order", () => {
    renderRoute(OPENER_PATH);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(MATCHUP_TABS.map((tab) => tab.label));
    for (const tab of MATCHUP_TABS) {
      expect(document.getElementById(matchupPanelId(tab.id)), tab.id).toBeTruthy();
    }
  });

  it("links the Situational Trends panel to the standalone trend library", () => {
    renderRoute(OPENER_PATH);
    fireEvent.click(screen.getByRole("tab", { name: "Situational Trends" }));
    expect(screen.getByRole("link", { name: /View all NFL trends/i }).getAttribute("href")).toBe("/nfl/trends");
  });

  it("renders every comparison category anchor, in registry order", () => {
    renderRoute(OPENER_PATH);
    const anchors = MATCHUP_CATEGORIES.map((category) =>
      document.getElementById(category.hash)
    );
    anchors.forEach((anchor, index) => {
      expect(anchor, MATCHUP_CATEGORIES[index].hash).toBeTruthy();
    });
    // Order on the page must match the registry the Overview table reads.
    const rendered = [...document.querySelectorAll('[id^="comparison-"]')]
      .map((node) => node.id)
      .filter((id) => MATCHUP_CATEGORIES.some((category) => category.hash === id));
    expect(rendered).toEqual(MATCHUP_CATEGORIES.map((category) => category.hash));
  });

  it("keeps Advantages and Things to Watch on the analyzer", () => {
    renderRoute(OPENER_PATH);
    expect(screen.getByRole("heading", { name: "Advantages" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Things to Watch" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Angles to watch/i })).toBeNull();
  });

  it("links each team to its canonical dashboard route", () => {
    renderRoute(OPENER_PATH);
    const away = screen.getByRole("link", { name: "New England Patriots" });
    expect(away.getAttribute("href")).toBe("/nfl/teams/new-england-patriots");
  });

  it("highlights Weekly Matchups in the sidebar on the detail route", () => {
    renderRoute(OPENER_PATH);
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const navLink = within(nav).getByRole("link", { name: /Weekly Matchups/i });
    expect(navLink.getAttribute("aria-current")).toBe("page");
  });

  it("redirects an unknown slug back to the matchups landing", () => {
    renderRoute("/nfl/matchups/2026/week-1/not-a-real-game");
    expect(screen.getByRole("heading", { name: /2026 NFL Weekly Matchups/i })).toBeTruthy();
  });

  /** Every usePageSeo call the detail page made for a given canonical path. */
  function detailSeoCalls(path: string) {
    return vi
      .mocked(usePageSeo)
      .mock.calls.map(([options]) => options)
      .filter((options) => options.path === path);
  }

  it("marks a valid matchup indexable (index, follow)", () => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute(OPENER_PATH);
    const calls = detailSeoCalls(OPENER_PATH);
    expect(calls.length).toBeGreaterThan(0);
    for (const options of calls) {
      expect(options.noindex).toBe(false);
      expect(options.nofollow).toBeUndefined();
    }
    expect(calls.at(-1)?.title).toBe("New England Patriots at Seattle Seahawks — 2026 Week 1 Matchup | Joe Knows Ball");
  });

  it("marks an invalid matchup slug noindex (noindex, follow) before redirecting", () => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute("/nfl/matchups/2026/week-1/not-a-real-game");
    const calls = detailSeoCalls("/nfl/matchups/2026/week-1/not-a-real-game");
    expect(calls.length).toBeGreaterThan(0);
    for (const options of calls) {
      expect(options.noindex).toBe(true);
      expect(options.nofollow).toBeUndefined();
    }
  });

  it("keeps the /nfl/matchups landing indexable", () => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute("/nfl/matchups?week=2");
    const landing = vi
      .mocked(usePageSeo)
      .mock.calls.map(([options]) => options)
      .filter((options) => options.path === "/nfl/matchups");
    expect(landing.length).toBeGreaterThan(0);
    for (const options of landing) expect(options.noindex).toBeFalsy();
  });
}, FULL_PAGE_RENDER_TIMEOUT_MS);

describe("NFL matchups scope", () => {
  it("does not render the NFL sidebar on non-NFL routes", () => {
    renderRoute("/mlb");
    expect(screen.getByRole("heading", { name: "MLB Page" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "NFL sitemap" })).toBeNull();
  });
});

describe("season/week matchup URLs", () => {
  const NEUTRAL = "indianapolis-colts-vs-washington-commanders";
  const NEUTRAL_PATH = nflMatchupPath({ season: 2026, week: 4, slug: NEUTRAL });
  const LATE = "san-francisco-49ers-at-la-chargers";
  const LATE_PATH = nflMatchupPath({ season: 2026, week: 15, slug: LATE });

  function seoCallsFor(path: string) {
    return vi
      .mocked(usePageSeo)
      .mock.calls.map(([options]) => options)
      .filter((options) => options.path === path);
  }

  it.each([
    [OPENER_PATH, "New England Patriots at Seattle Seahawks — 2026 Week 1 Matchup | Joe Knows Ball"],
    [NEUTRAL_PATH, "Indianapolis Colts vs Washington Commanders — 2026 Week 4 Matchup | Joe Knows Ball"],
    [LATE_PATH, "San Francisco 49ers at LA Chargers — 2026 Week 15 Matchup | Joe Knows Ball"],
  ])("renders %s indexable with a self-referencing season/week canonical", (path, title) => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute(path);
    expect(currentLocation()).toBe(path);
    const calls = seoCallsFor(path);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.noindex).toBe(false);
    expect(calls.at(-1)?.title).toBe(title);
    const schema = calls.at(-1)?.structuredData as Array<Record<string, unknown>>;
    expect(schema.find((item) => item["@type"] === "SportsEvent")?.url).toBe(`https://www.joeknowsball.com${path}`);
  }, FULL_PAGE_RENDER_TIMEOUT_MS);

  it("canonicalizes a mixed-case slug to the lowercase URL", () => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute("/nfl/matchups/2026/week-1/New-England-Patriots-at-Seattle-Seahawks");
    expect(seoCallsFor(OPENER_PATH).at(-1)?.noindex).toBe(false);
  }, FULL_PAGE_RENDER_TIMEOUT_MS);

  it.each([
    ["an unsupported season", `/nfl/matchups/2025/week-1/${OPENER}`],
    ["a future season", `/nfl/matchups/2027/week-1/${OPENER}`],
    ["a non-numeric season", `/nfl/matchups/twenty/week-1/${OPENER}`],
    ["an out-of-range week", `/nfl/matchups/2026/week-0/${OPENER}`],
    ["a zero-padded week", `/nfl/matchups/2026/week-01/${OPENER}`],
    ["a malformed week segment", `/nfl/matchups/2026/1/${OPENER}`],
    ["an unknown slug", "/nfl/matchups/2026/week-1/not-a-real-game"],
    ["a week with no such game", "/nfl/matchups/2026/week-19/not-a-real-game"],
  ])("marks %s noindex and falls back to the landing page", (_label, path) => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute(path);
    const calls = seoCallsFor(path);
    expect(calls.length).toBeGreaterThan(0);
    for (const options of calls) expect(options.noindex).toBe(true);
    expect(currentLocation()).toBe("/nfl/matchups");
  }, FULL_PAGE_RENDER_TIMEOUT_MS);

  it("sends a real game requested under the wrong week to its one canonical URL, keeping query and hash", () => {
    vi.mocked(usePageSeo).mockClear();
    const wrongWeek = nflMatchupPath({ season: 2026, week: 9, slug: OPENER });
    renderRoute(`${wrongWeek}?ref=x#trends`);
    for (const options of seoCallsFor(wrongWeek)) expect(options.noindex).toBe(true);
    expect(currentLocation()).toBe(`${OPENER_PATH}?ref=x#trends`);
  }, FULL_PAGE_RENDER_TIMEOUT_MS);

  it.each([
    [OPENER, OPENER_PATH],
    [NEUTRAL, NEUTRAL_PATH],
    [LATE, LATE_PATH],
  ])("redirects legacy /nfl/matchups/%s to its season/week URL", (slug, target) => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute(legacyNflMatchupPath(slug));
    expect(currentLocation()).toBe(target);
    // The legacy URL never claims to be indexable, even for one render.
    for (const options of seoCallsFor(target).filter((options) => options.title.startsWith("NFL Weekly Matchup"))) {
      expect(options.noindex).toBe(true);
    }
  }, FULL_PAGE_RENDER_TIMEOUT_MS);

  it("keeps query and hash through the legacy redirect without looping", () => {
    renderRoute(`${legacyNflMatchupPath(OPENER)}?utm_source=x#trends`);
    expect(currentLocation()).toBe(`${OPENER_PATH}?utm_source=x#trends`);
    expect(screen.getByRole("heading", { name: /Week 1 matchup/i })).toBeTruthy();
  }, FULL_PAGE_RENDER_TIMEOUT_MS);

  it("sends an unknown legacy slug to the landing page, noindex, never to a guessed game", () => {
    vi.mocked(usePageSeo).mockClear();
    renderRoute(legacyNflMatchupPath("not-a-real-game"));
    expect(currentLocation()).toBe("/nfl/matchups");
    const legacyCalls = vi
      .mocked(usePageSeo)
      .mock.calls.map(([options]) => options)
      .filter((options) => options.title === "NFL Weekly Matchup | Joe Knows Ball");
    expect(legacyCalls.length).toBeGreaterThan(0);
    for (const options of legacyCalls) expect(options.noindex).toBe(true);
  }, FULL_PAGE_RENDER_TIMEOUT_MS);

  it("exposes every week as a crawlable link on the landing page", () => {
    renderRoute("/nfl/matchups?week=3");
    const group = screen.getByRole("group", { name: "Select week" });
    const hrefs = within(group).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/nfl/matchups?week=1");
    expect(hrefs).toContain("/nfl/matchups?week=18");
    fireEvent.click(within(group).getByRole("link", { name: "W4" }));
    expect(currentLocation()).toBe("/nfl/matchups?week=4");
    expect(linksToWeekFourNeutral().length).toBeGreaterThan(0);

    function linksToWeekFourNeutral() {
      return screen.getAllByRole("link").filter((link) => link.getAttribute("href") === NEUTRAL_PATH);
    }
  }, FULL_PAGE_RENDER_TIMEOUT_MS);
});
