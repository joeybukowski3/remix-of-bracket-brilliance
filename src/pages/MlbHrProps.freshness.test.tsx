/**
 * Focused integration tests for the FreshnessStatus wiring on the public
 * HR Props page. Mirrors the mocking pattern established in
 * MlbHrProps.relatedTools.test.tsx: the hook is mocked (never the real
 * useMlbPropsData), so `status` here is a fixed fixture, not something
 * re-derived from a mocked dashboard -- the page must trust it as-is.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/hooks/usePitcherRegression", () => ({
  usePitcherRegression: () => ({ data: [], loading: false }),
}));

const baseGame: HrDashboardGame = {
  gameKey: "BAL@CHC",
  matchup: "BAL @ CHC",
  awayTeam: "BAL",
  homeTeam: "CHC",
  stadium: "Wrigley Field",
  roofType: "Open",
  temperature: 78,
  precipitation: 0,
  windSpeed: 6,
  windDirection: "SW",
  conditions: "Clear",
  parkFactor: 1.0,
};

const basePitcher: HrDashboardPitcher = {
  gameKey: "BAL@CHC",
  pitcher: "Justin Steele",
  pitcherId: 1,
  team: "CHC",
  opponent: "BAL",
  hand: "L",
  ballpark: "Wrigley Field",
  parkFactor: 1.0,
  xera: 3.5,
  hardHitRate: 40,
  flyBallRate: 35,
  barrelRate: 7,
  kRate: 22,
  bbRate: 8,
  whiffRate: 24,
  last7HR: 1,
  hrPerStart: 0.8,
  hrVs: 55,
  hitsVs: 62,
  kVs: 50,
};

function makeBatter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: "BAL@CHC",
    playerId: 1,
    gameId: 1,
    lineupStatus: "confirmed",
    battingOrder: 3,
    starterConfirmed: true,
    position: "C",
    player: "Adley Rutschman",
    team: "BAL",
    opponent: "CHC",
    opposingPitcher: "Justin Steele",
    opposingPitcherId: 1,
    pitcherHand: "L",
    ballpark: "Wrigley Field",
    parkFactor: 1.0,
    atBats: 300,
    barrelRate: 9.5,
    hardHitRate: 44,
    exitVelo: 90,
    iso: 0.18,
    hrFBRatio: 10,
    pullRate: 40,
    xba: 0.26,
    kRate: 18,
    bbRate: 10,
    whiffRate: 24,
    last7HR: 1,
    last30HR: 3,
    opposingPitcherHrVs: 55,
    opposingPitcherHitsVs: 62,
    opposingPitcherKVs: 50,
    weatherBoost: 0,
    hrScore: 60,
    hrScoreRank: 1,
    angleTags: [],
    ...overrides,
  };
}

const confirmedBatter = makeBatter();
const secondBatter = makeBatter({
  playerId: 2,
  player: "Second Batter",
  hrScore: 75,
  hrScoreRank: 2,
});

const fullDashboard = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
  games: [baseGame],
  pitchers: [basePitcher],
  batters: [confirmedBatter, secondBatter],
};

const CURRENT_STATUS: MlbDataStatus = { kind: "current", slateDate: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z" };
const LOADING_STATUS: MlbDataStatus = { kind: "loading" };
const LINEUP_PENDING_STATUS: MlbDataStatus = { kind: "lineup-pending", slateDate: "2026-07-16", confirmedCount: 1, totalCount: 2 };
const STALE_PAST_STATUS: MlbDataStatus = { kind: "stale", slateDate: "2026-07-10", todayEt: "2026-07-16", direction: "past" };
const STALE_FUTURE_STATUS: MlbDataStatus = { kind: "stale", slateDate: "2026-07-20", todayEt: "2026-07-16", direction: "future" };
const UNAVAILABLE_STATUS: MlbDataStatus = { kind: "unavailable" };
const ERROR_NO_DATA_STATUS: MlbDataStatus = { kind: "error", message: "HTTP 500", hasLastKnownData: false };
const ERROR_WITH_DATA_STATUS: MlbDataStatus = {
  kind: "error",
  message: "HTTP 500",
  hasLastKnownData: true,
  slateDate: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
};
const WAITING_FOR_SLATE_STATUS: MlbDataStatus = {
  kind: "waiting-for-slate",
  slateDate: "2026-07-16",
  nextRunAt: { time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" },
};
const NO_GAMES_STATUS: MlbDataStatus = { kind: "no-games-scheduled", slateDate: "2026-07-16" };

function mockPropsData(options: { dashboard?: unknown; bestBets?: unknown; status: MlbDataStatus }) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: options.dashboard ?? null,
      bestBets: options.bestBets ?? null,
      status: options.status,
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

const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbHrProps — freshness status integration", () => {
  it("1. loading status appears during unresolved initial fetch", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    await renderPage();

    expect(screen.getByText("Loading MLB model data")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it('2. old "Live Slate" wording is absent', async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toMatch(/live slate/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("3. current status renders above the HR data", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector('[data-tone="positive"]');
    const table = container.querySelector("table");
    expect(statusEl).toBeInTheDocument();
    expect(table).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("4. current rows still render", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("5. lineup-pending status renders with counts", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: LINEUP_PENDING_STATUS });
    await renderPage();

    expect(screen.getByText("1 of 2 listed batters are confirmed.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("6. lineup-pending rows remain visible", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: LINEUP_PENDING_STATUS });
    await renderPage();

    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
    expect(screen.getByText("Second Batter")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("7. stale-past status renders while rows remain visible", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("8. stale-future status renders while rows remain visible", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: STALE_FUTURE_STATUS });
    await renderPage();

    expect(screen.getByText("Showing a future MLB slate")).toBeInTheDocument();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("9. initial blocking error shows the error status and hides data controls/tables", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("Unable to load MLB model data")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("10. unavailable status hides false empty-table messaging", async () => {
    vi.resetModules();
    mockPropsData({ status: UNAVAILABLE_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("MLB model data unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/generates daily at 10 AM ET/)).toBeNull();
    expect(screen.queryByText(/No batters match/)).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("11. refresh error with retained data shows warning and keeps rows visible", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    expect(screen.getByText(/Unable to refresh MLB model data/)).toBeInTheDocument();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("12. waiting-for-slate renders the next scheduled update label", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    await renderPage();

    expect(screen.getByText("Next scheduled update: 1:00 PM ET.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("13. waiting-for-slate does not also render a duplicate no-props message", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    await renderPage();

    expect(screen.queryByText(/No batters match/)).toBeNull();
    expect(screen.queryByText(/generates daily at 10 AM ET/)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("14. no-games-scheduled renders its shared message", async () => {
    vi.resetModules();
    mockPropsData({ status: NO_GAMES_STATUS });
    await renderPage();

    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("15. no-games-scheduled does not render a duplicate generic empty state", async () => {
    vi.resetModules();
    mockPropsData({ status: NO_GAMES_STATUS });
    const { container } = await renderPage();

    expect(screen.queryByText(/generates daily at 10 AM ET/)).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("16. current data with zero filter-qualified rows still renders the page-local filter/model empty state", async () => {
    vi.resetModules();
    mockPropsData({
      dashboard: { ...fullDashboard, batters: [] },
      status: CURRENT_STATUS,
    });
    await renderPage();

    expect(screen.getByText("No batters match the current search or game filter.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("17. changing filters still works under current status", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    await renderPage();

    const search = screen.getByPlaceholderText("Search batter, pitcher, or team");
    fireEvent.change(search, { target: { value: "Nonexistent Player Name" } });

    expect(screen.getByText("No batters match the current search or game filter.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("18. existing sorting remains unchanged", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    const rowsBefore = container.querySelectorAll("tbody tr");
    expect(rowsBefore[0].textContent).toContain("Second Batter");

    const scoreHeaderButton = screen.getByRole("button", { name: /^HR/ });
    fireEvent.click(scoreHeaderButton);

    const rowsAfter = container.querySelectorAll("tbody tr");
    expect(rowsAfter[0].textContent).toContain("Adley Rutschman");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("19. existing model selection remains unchanged", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    await renderPage();

    const sinCityToggle = screen.getByRole("button", { name: /Sin City/i });
    fireEvent.click(sinCityToggle);

    expect(screen.getByText("No Sin City batters match the current filters.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("20. existing HR score/rank values remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("60.0")).toBeInTheDocument();
    expect(screen.getByText("75.0")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("21. existing links and RelatedTools remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    await renderPage();

    const relatedTools = screen.getByRole("navigation", { name: "Related MLB tools" });
    const links = within(relatedTools).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Game Matchups",
      "Strikeout Props",
      "Batter vs Pitcher",
      "Props Hub",
      "Power Rankings",
      "Sin City",
    ]);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("22. FreshnessStatus appears only once", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelectorAll("[data-tone]")).toHaveLength(1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("23. no raw ISO timestamp appears", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toContain("2026-07-16T09:32:34.452Z");
  }, SLOW_RENDER_TIMEOUT_MS);

  it('24. no "Live," "real-time," or "up to the minute" freshness wording appears', async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).not.toMatch(/real[- ]time/i);
    expect(text).not.toMatch(/up to the minute/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("25. retained-data error does not disable table interactions", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    const search = screen.getByPlaceholderText("Search batter, pitcher, or team");
    expect(search).not.toBeDisabled();

    fireEvent.change(search, { target: { value: "Adley" } });
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
    expect(screen.queryByText("Second Batter")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("26. blocking error does not show a misleading zero-row count", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toMatch(/0 hitters/);
    expect(container.textContent).not.toMatch(/0 games/);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("27. status appears before the first major table/control region in DOM order", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector('[data-tone]');
    const searchInput = screen.getByPlaceholderText("Search batter, pitcher, or team");
    expect(statusEl).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("28. mobile-safe classes or container behavior are preserved", async () => {
    vi.resetModules();
    mockPropsData({ dashboard: fullDashboard, status: CURRENT_STATUS });
    const { container } = await renderPage();

    const scrollWrapper = container.querySelector(".overflow-x-auto");
    expect(scrollWrapper).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("29. the hook is mocked rather than status being re-derived in page tests", async () => {
    vi.resetModules();
    // Deliberately mismatched: fullDashboard has today's date and games, which
    // deriveMlbDataStatus would classify as "current" -- but the mocked
    // status says "stale". If the page re-derived status from the dashboard
    // instead of trusting the hook's `status`, this would render "Current
    // slate data" instead.
    mockPropsData({ dashboard: fullDashboard, status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.queryByText("Current slate data")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("30. page does not directly import deriveMlbDataStatus", () => {
    const source = readFileSync("src/pages/MlbHrProps.tsx", "utf-8");
    expect(source).not.toContain("deriveMlbDataStatus");
  });
});
