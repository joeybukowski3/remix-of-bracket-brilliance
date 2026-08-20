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

// Real published projections artifact, so N/A vs. real-value rendering is
// exercised against the actual data shape rather than an invented one.
vi.mock("@/hooks/useNflMatchupProjections", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  const artifact = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/nfl/matchup-projections.json"), "utf-8")
  );
  return { useNflMatchupProjections: () => ({ loading: false, error: null, artifact }) };
});

// Real published market artifact (public/data/nfl/matchup-market.json), so the
// Market Spread / Market Total columns are exercised against the actual
// guide-derived data shape — never invented, never derived from the JKB
// projection above.
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

function ratingRow(abbr: string, team: string, division: string, rating: number, rank: number, offenseRating: number, offenseRank: number, defenseRating: number, defenseRank: number) {
  return {
    abbr, team, division, rating, rank,
    offenseRating, offenseRank, defenseRating, defenseRank,
    performanceRating: null, performanceRank: null, gamesPlayed: 0,
    preseasonWeight: 1, performanceWeight: 0, state: "preseason" as const,
    preseasonV04Rating: rating, preseasonOffenseRating: offenseRating, preseasonDefenseRating: defenseRating,
  };
}

// Deterministic current-rating board, mirroring the shape useNflCurrentRating2026
// actually returns, covering the teams exercised in the tests below.
vi.mock("@/hooks/useNflCurrentRating2026", () => ({
  useNflCurrentRating2026: () => ({
    loading: false,
    error: null,
    data: {
      season: 2026,
      state: "preseason",
      teams: [
        ratingRow("buf", "Buffalo Bills", "AFC East", 71.2, 4, 70.1, 5, 69.4, 6),
        ratingRow("hou", "Houston Texans", "AFC South", 60.0, 15, 58.0, 16, 61.0, 12),
        ratingRow("det", "Detroit Lions", "NFC North", 65.0, 8, 66.0, 7, 64.0, 9),
      ],
    },
  }),
}));

// Imported after mocks so they pick up the mocked hooks.
import NflPlatformLayout from "@/components/nfl/NflPlatformLayout";
import NFLTeamSchedules from "@/pages/NFLTeamSchedules";

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nfl" element={<NflPlatformLayout />}>
          <Route path="team-schedules" element={<NFLTeamSchedules />} />
          <Route path="team-schedules/:teamSlug" element={<NFLTeamSchedules />} />
          <Route path="matchups/:gameSlug" element={<h1>Matchup Detail Page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("NFL sidebar", () => {
  it("lists Team Schedules under the SEASON section", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    expect(within(nav).getByRole("link", { name: /Team Schedules/i })).toBeTruthy();
  });
});

describe("NFLTeamSchedules route", () => {
  it("renders inside the shared NFL platform layout", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    expect(screen.getByRole("heading", { name: "Buffalo Bills" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "NFL sitemap" })).toBeTruthy();
  });

  it("redirects the bare route to the first team alphabetically", () => {
    renderRoute("/nfl/team-schedules");
    // Alphabetically first team in teams.json.
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("highlights Team Schedules in the sidebar", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const navLink = within(nav).getByRole("link", { name: /Team Schedules/i });
    expect(navLink.getAttribute("aria-current")).toBe("page");
  });
});

describe("NFLTeamSchedules team switching", () => {
  it("offers all 32 teams in the selector", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const select = screen.getByLabelText("Select team") as HTMLSelectElement;
    expect(select.options.length).toBe(32);
    expect(select.value).toBe("buffalo-bills");
  });

  it("shows a different team's header when the route param changes", () => {
    renderRoute("/nfl/team-schedules/houston-texans");
    expect(screen.getByRole("heading", { name: "Houston Texans" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Buffalo Bills" })).toBeNull();
  });
});

describe("NFLTeamSchedules header", () => {
  it("shows record, conference/division and JKB/Off/Def ratings for the selected team", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const overview = screen.getByRole("region", { name: "Buffalo Bills overview" });
    expect(within(overview).getByText("AFC · AFC East")).toBeTruthy();
    expect(within(overview).getByText("0-0")).toBeTruthy(); // no completed results in fixture
    expect(within(overview).getByText("#4 · 71.2")).toBeTruthy();
    expect(within(overview).getByText("#5 · 70.1")).toBeTruthy();
    expect(within(overview).getByText("#6 · 69.4")).toBeTruthy();
  });
});

describe("NFLTeamSchedules schedule table", () => {
  it("maps schedule rows to the correct opponents in week order", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(rows[0]).getByText("Houston Texans")).toBeTruthy();
    expect(within(rows[1]).getByText("Detroit Lions")).toBeTruthy();
  });

  it("resolves opponent power ratings and records", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("#15 · 60.0")).toBeTruthy();
    expect(within(rows[1]).getByText("#8 · 65.0")).toBeTruthy();
  });

  it("links each matchup row to the existing matchup-detail route", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const link = screen.getByRole("link", { name: /BUF at Houston Texans/i });
    expect(link.getAttribute("href")).toBe("/nfl/matchups/buffalo-bills-at-houston-texans");
  });

  it("shows correct home/away identity", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByText("AWAY").length).toBeGreaterThan(0);
    expect(within(rows[1]).getAllByText("HOME").length).toBeGreaterThan(0);
  });

  it("moves secondary info (date, site, opponent record, market total) into a compact mobile-only line without dropping it", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    const mobileLine = rows[0].querySelector(".sm\\:hidden");
    expect(mobileLine).toBeTruthy();
    expect(mobileLine!.textContent).toContain("AWAY");
    expect(mobileLine!.textContent).toContain("O/U");
    // Desktop-only cells (date, site, opponent record, market total) are
    // marked `hidden sm:table-cell` so the page never scrolls horizontally to
    // reach them on mobile, but they stay in the DOM for larger breakpoints.
    const desktopOnlyCells = rows[0].querySelectorAll("td.hidden.sm\\:table-cell");
    expect(desktopOnlyCells.length).toBeGreaterThanOrEqual(4);
  });
});

describe("NFLTeamSchedules market vs. JKB columns", () => {
  it("renders Market Spread from the guide-derived market artifact, distinct from the JKB projection", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    // Week 1 BUF @ HOU: market artifact prices HOU +1.5 (favorite: BUF -1.5);
    // the JKB projection artifact independently favors HOU -2.0. The two
    // must never collapse into the same number by accident.
    expect(within(rows[0]).getByText("BUF −1.5")).toBeTruthy();
    expect(within(rows[0]).getByText("HOU −2.0")).toBeTruthy();
  });

  it("renders Market Total from the guide-derived market artifact", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    // Week 1 BUF @ HOU market total is 44.5 in the published artifact.
    expect(within(rows[0]).getByText("44.5")).toBeTruthy();
  });

  it("renders JKB Spread from the existing JKB projection artifact", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[1]).getByText("BUF −3.9")).toBeTruthy(); // week 2 DET @ BUF
  });

  it("renders — for a game the market artifact has not priced yet, rather than inventing a line", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    // Week 4 BUF vs NE has no entry in the market artifact's currentMarket.
    const week4Row = rows.find((row) => within(row).queryByText("New England Patriots"));
    expect(week4Row).toBeTruthy();
    expect(within(week4Row!).getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("no longer renders a Win % column", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    expect(screen.queryByText("Win %")).toBeNull();
  });
});

describe("NFLTeamSchedules Site column", () => {
  it("renames the Loc header to Site while preserving HOME/AWAY/NEUTRAL badges", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    expect(screen.getByText("Site")).toBeTruthy();
    expect(screen.queryByText("Loc")).toBeNull();
  });
});

describe("NFLTeamSchedules row tint", () => {
  it("applies home styling to a HOME row", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    // Row 1 (week 2, DET @ BUF) is a HOME game for the selected team.
    expect(rows[1].className).toContain("bg-emerald-50");
  });

  it("applies away styling to an AWAY row", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    // Row 0 (week 1, BUF @ HOU) is an AWAY game for the selected team.
    expect(rows[0].className).toContain("bg-sky-50");
  });
});

describe("NFLTeamSchedules Opp Power color scale", () => {
  it("colors the Opp Power cell using the NFL-calibrated score-based rating scale", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    // Houston Texans opponent rating is 60.0 in the mocked current-rating
    // board — the NFL rating-presentation scale's "good" (54-61.9) tier,
    // not a rank-only red/green split.
    const cell = within(rows[0]).getByText("#15 · 60.0");
    expect(cell.className).toContain("bg-emerald-50");
  });

  it("gives a stronger opponent rating a visibly different tier than a weaker one", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const rows = screen.getAllByRole("row").slice(1);
    // Houston Texans (60.0, "good") vs. Detroit Lions (65.0, "strong").
    const houCell = within(rows[0]).getByText("#15 · 60.0");
    const detCell = within(rows[1]).getByText("#8 · 65.0");
    expect(houCell.className).not.toBe(detCell.className);
  });
});

describe("NFLTeamSchedules matchup links", () => {
  it("keeps the semantic matchup link unchanged after the column/styling rework", () => {
    renderRoute("/nfl/team-schedules/buffalo-bills");
    const link = screen.getByRole("link", { name: /BUF at Houston Texans/i });
    expect(link.getAttribute("href")).toBe("/nfl/matchups/buffalo-bills-at-houston-texans");
  });
});
