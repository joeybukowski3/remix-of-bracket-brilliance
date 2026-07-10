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

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="site-shell">{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

// Imported after mocks so they pick up the mocked hook.
import NflPlatformLayout from "@/components/nfl/NflPlatformLayout";
import NFLMatchups from "@/pages/NFLMatchups";
import NFLMatchupDetail from "@/pages/NFLMatchupDetail";

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

  it("highlights Weekly Matchups in the sidebar on the index route", () => {
    renderRoute("/nfl/matchups");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const navLink = within(nav).getByRole("link", { name: /Weekly Matchups/i });
    expect(navLink.getAttribute("aria-current")).toBe("page");
  });
});

describe("NFLMatchupDetail", () => {
  it("renders the correct teams and comparison", () => {
    renderRoute(`/nfl/matchups/${OPENER}`);
    expect(
      screen.getByRole("heading", { name: /New England Patriots at Seattle Seahawks — Week 1 matchup/i })
    ).toBeTruthy();
    const header = screen.getByRole("heading", { name: /Week 1 matchup/i }).closest("section")!;
    expect(within(header).getByText("New England Patriots")).toBeTruthy();
    expect(within(header).getByText("Seattle Seahawks")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Team comparison/i })).toBeTruthy();
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
});

describe("NFL matchups scope", () => {
  it("does not render the NFL sidebar on non-NFL routes", () => {
    renderRoute("/mlb");
    expect(screen.getByRole("heading", { name: "MLB Page" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "NFL sitemap" })).toBeNull();
  });
});
