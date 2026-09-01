/**
 * MlbHrProps.phase9c.test.tsx
 *
 * Phase 9C — inline HR prop-board table migration onto the shared
 * `DenseTableScroller` + `stickyDenseHeader` / `frozenDenseColumn` helpers.
 * Verifies the desktop batter board scrolls inside an accessible region, its
 * sticky header + two frozen identity columns keep the documented
 * `TABLE_LAYER` z-index ladder, the column labels are unchanged, and the
 * mobile card fallback still replaces the table below `lg`. Mocking pattern
 * follows MlbHrProps.mobileSections.test.tsx.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/hooks/usePitcherRegression", () => ({
  usePitcherRegression: () => ({ data: [], loading: false }),
}));

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches, media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

const gameA: HrDashboardGame = {
  gameKey: "BAL@CHC", matchup: "BAL @ CHC", awayTeam: "BAL", homeTeam: "CHC",
  stadium: "Wrigley Field", roofType: "Open", temperature: 78, precipitation: 0,
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.0,
};
const basePitcher: HrDashboardPitcher = {
  gameKey: "BAL@CHC", pitcher: "Justin Steele", pitcherId: 1, team: "CHC", opponent: "BAL",
  hand: "L", ballpark: "Wrigley Field", parkFactor: 1.0, xera: 3.5, hardHitRate: 40,
  flyBallRate: 35, barrelRate: 7, kRate: 22, bbRate: 8, whiffRate: 24, last7HR: 1,
  hrPerStart: 0.8, hrVs: 55, hitsVs: 62, kVs: 50,
};
function makeBatter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: "BAL@CHC", playerId: 1, gameId: 1, lineupStatus: "confirmed", battingOrder: 3,
    starterConfirmed: true, position: "C", player: "Adley Rutschman", team: "BAL", opponent: "CHC",
    opposingPitcher: "Justin Steele", opposingPitcherId: 1, pitcherHand: "L", ballpark: "Wrigley Field",
    parkFactor: 1.0, atBats: 300, barrelRate: 9.5, hardHitRate: 44, exitVelo: 90, iso: 0.18,
    hrFBRatio: 10, pullRate: 40, xba: 0.26, kRate: 18, bbRate: 10, whiffRate: 24, last7HR: 1,
    last30HR: 3, opposingPitcherHrVs: 55, opposingPitcherHitsVs: 62, opposingPitcherKVs: 50,
    weatherBoost: 0, hrScore: 60, hrScoreRank: 1, angleTags: [],
    ...overrides,
  };
}

const batters = [
  makeBatter({ playerId: 1, player: "Alpha Batter", hrScore: 90, hrScoreRank: 1, last7HR: 5 }),
  makeBatter({ playerId: 2, player: "Bravo Batter", hrScore: 70, hrScoreRank: 2, last7HR: 5 }),
];

const dashboardFixture = {
  date: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z",
  games: [gameA], pitchers: [basePitcher], batters, gameEnvironments: [],
};
const bestBetsFixture = { date: "2026-07-16", bestBets: [], valueBets: [], longshots: [], slatePreview: null };

function mockPropsData() {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture, bestBets: bestBetsFixture,
      status: { kind: "current" as const, slateDate: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z" },
    }),
  }));
}

async function renderPage() {
  const { default: MlbHrProps } = await import("@/pages/MlbHrProps");
  return render(
    <MemoryRouter>
      <MlbHrProps />
    </MemoryRouter>,
  );
}

const SLOW = 15000;

describe("Phase 9C — HR batter prop board shared scroller", () => {
  it("wraps the desktop board in an accessible scroll region and keeps the sticky/frozen ladder", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findByText("Alpha Batter");
    const region = screen.getByRole("region", { name: "Batter HR prop board" });
    expect(region).toHaveAttribute("tabindex", "0");
    const table = within(region).getByRole("table");

    const thead = table.querySelector("thead");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("z-20");

    const headerCells = Array.from(table.querySelectorAll("thead th"));
    const rankHeader = headerCells.find((th) => th.className.includes("left-0"));
    const nameHeader = headerCells.find((th) => th.className.includes("left-6"));
    expect(rankHeader?.className).toContain("z-30");
    expect(nameHeader?.className).toContain("z-30");

    const firstRowCells = Array.from(table.querySelectorAll("tbody tr td"));
    expect(firstRowCells[0]?.className).toContain("left-0");
    expect(firstRowCells[0]?.className).toContain("z-10");
    expect(firstRowCells[1]?.className).toContain("left-6");
    expect(firstRowCells[1]?.className).toContain("z-10");
  }, SLOW);

  it("preserves the board column labels and row order", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findByText("Alpha Batter");
    const region = screen.getByRole("region", { name: "Batter HR prop board" });
    const headerText = region.querySelector("thead")?.textContent ?? "";
    for (const label of ["HR Score", "Barrel", "Pitcher Trend", "AVG vs P"]) {
      expect(headerText).toContain(label);
    }
    const names = Array.from(region.querySelectorAll("tbody tr td:nth-child(2)"))
      .map((td) => td.textContent ?? "")
      .filter((t) => t.includes("Batter"));
    expect(names[0]).toContain("Alpha Batter");
    expect(names[1]).toContain("Bravo Batter");
  }, SLOW);

  it("still replaces the board table with the stacked card fallback below lg", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findByText("Alpha Batter");
    expect(screen.queryByRole("region", { name: "Batter HR prop board" })).not.toBeInTheDocument();
  }, SLOW);
});
