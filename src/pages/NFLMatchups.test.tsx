import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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
import { MATCHUP_CATEGORIES } from "@/lib/nfl/matchupCategoryAdvantage";
import {
  MATCHUP_TABS,
  matchupPanelId,
} from "@/components/nfl/matchups/matchupNavigation";

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nfl" element={<NflPlatformLayout />}>
          <Route path="matchups" element={<NFLMatchups />} />
          <Route path="matchups/:gameSlug" element={<NFLMatchupDetail />} />
          <Route path="schedule" element={<h1>Schedule Page</h1>} />
          <Route path="guide/team/:teamSlug" element={<h1>Team Dashboard</h1>} />
        </Route>
        <Route path="/mlb" element={<h1>MLB Page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

const OPENER = "new-england-patriots-at-seattle-seahawks";

describe("NFLMatchups landing", () => {
  it("renders inside the shared NFL platform layout", () => {
    renderRoute("/nfl/matchups");
    expect(screen.getByRole("heading", { name: /2026 NFL Weekly Matchups/i })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "NFL sitemap" })).toBeTruthy();
  });

  it("renders all 16 Week 1 games", () => {
    renderRoute("/nfl/matchups");
    expect(screen.getAllByText(/View matchup breakdown/i)).toHaveLength(16);
    expect(screen.getAllByText("Seattle Seahawks").length).toBeGreaterThan(0);
  });

  it("links each game card to its detail page", () => {
    renderRoute("/nfl/matchups");
    const link = screen.getByRole("link", { name: /New England Patriots at Seattle Seahawks/i });
    expect(link.getAttribute("href")).toBe(`/nfl/matchups/${OPENER}`);
  });

  it("shows the universal current OVR/rank on each card, not the legacy guide powerRank/overallPct", () => {
    renderRoute("/nfl/matchups");
    const link = screen.getByRole("link", { name: /New England Patriots at Seattle Seahawks/i });
    // Mocked useNflCurrentRating2026 values above; the guide's own powerRank/
    // overallPct for these teams differ from these figures.
    expect(within(link).getByText("#3 · 68.4")).toBeTruthy();
    expect(within(link).getByText("#2 · 74.5")).toBeTruthy();
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
    renderRoute(`/nfl/matchups/${OPENER}`);
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
    renderRoute(`/nfl/matchups/${OPENER}`);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(MATCHUP_TABS.map((tab) => tab.label));
    for (const tab of MATCHUP_TABS) {
      expect(document.getElementById(matchupPanelId(tab.id)), tab.id).toBeTruthy();
    }
  });

  it("renders every comparison category anchor, in registry order", () => {
    renderRoute(`/nfl/matchups/${OPENER}`);
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
    renderRoute(`/nfl/matchups/${OPENER}`);
    expect(screen.getByRole("heading", { name: "Advantages" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Things to Watch" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Angles to watch/i })).toBeNull();
  });

  it("links each team to its canonical dashboard route", () => {
    renderRoute(`/nfl/matchups/${OPENER}`);
    const away = screen.getByRole("link", { name: "New England Patriots" });
    expect(away.getAttribute("href")).toBe("/nfl/guide/team/new-england-patriots");
  });

  it("highlights Weekly Matchups in the sidebar on the detail route", () => {
    renderRoute(`/nfl/matchups/${OPENER}`);
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const navLink = within(nav).getByRole("link", { name: /Weekly Matchups/i });
    expect(navLink.getAttribute("aria-current")).toBe("page");
  });

  it("redirects an unknown slug back to the matchups landing", () => {
    renderRoute("/nfl/matchups/not-a-real-game");
    expect(screen.getByRole("heading", { name: /2026 NFL Weekly Matchups/i })).toBeTruthy();
  });
}, FULL_PAGE_RENDER_TIMEOUT_MS);

describe("NFL matchups scope", () => {
  it("does not render the NFL sidebar on non-NFL routes", () => {
    renderRoute("/mlb");
    expect(screen.getByRole("heading", { name: "MLB Page" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "NFL sitemap" })).toBeNull();
  });
});
