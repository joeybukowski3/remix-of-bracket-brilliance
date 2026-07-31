/**
 * Focused tests for the HR Props/Batter View "Game Time" column:
 * - the header "?" tooltip icons removed from HR Odds/Market %/HR Score/
 *   Pitcher Trend/AVG vs P (their copy moved into the sidebar glossary
 *   instead, covered separately by MlbSectionSidebar's own tests/usage),
 * - the Angle column replaced by a sortable Game Time column,
 * - scheduled-time formatting and the TBD fallback for missing times,
 * - ascending/descending Game Time sorting via the shared timestamp sort key,
 * - stable ordering for two players in the same game.
 * Mirrors the mocking pattern established in MlbHrProps.freshness.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
// Desktop layout for every test in this file (the table under test only renders at lg+).
vi.mock("@/hooks/useIsCompactLayout", () => ({ useIsCompactLayout: () => false }));

const gameA: HrDashboardGame = {
  gameKey: "BAL@CHC", matchup: "BAL @ CHC", awayTeam: "BAL", homeTeam: "CHC",
  stadium: "Wrigley Field", roofType: "Open", temperature: 78, precipitation: 0,
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.0,
  gameStartTime: "2026-07-16T23:10:00Z", // 7:10 PM ET
};
const gameB: HrDashboardGame = {
  gameKey: "NYY@BOS", matchup: "NYY @ BOS", awayTeam: "NYY", homeTeam: "BOS",
  stadium: "Yankee Stadium", roofType: "Open", temperature: 82, precipitation: 0,
  windSpeed: 8, windDirection: "SW", conditions: "Clear", parkFactor: 1.15,
  gameStartTime: "2026-07-16T17:05:00Z", // 1:05 PM ET (earlier than gameA)
};

const basePitcher: HrDashboardPitcher = {
  gameKey: "BAL@CHC", pitcher: "Justin Steele", pitcherId: 1, team: "CHC", opponent: "BAL",
  hand: "L", ballpark: "Wrigley Field", parkFactor: 1.0, xera: 3.5, hardHitRate: 40,
  flyBallRate: 35, barrelRate: 7, kRate: 22, bbRate: 8, whiffRate: 24, last7HR: 1,
  hrPerStart: 0.8, hrVs: 55, hitsVs: 62, kVs: 50,
};
const secondPitcher: HrDashboardPitcher = {
  ...basePitcher, gameKey: "NYY@BOS", pitcher: "Second Pitcher", pitcherId: 2, team: "BOS", opponent: "NYY",
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

// Two batters sharing gameA (later start time), one in gameB (earlier start
// time), and one batter with no game match at all (missing/TBD start time).
// The HR/batter table reads gameStartTime directly off each batter row
// (already present per-row in the real generator payload -- see
// normalizeBatter), so the fixture sets it explicitly per batter here
// rather than relying on a client-side join against `games`.
const lateGameBatterOne = makeBatter({
  playerId: 1, player: "Late Batter One", hrScore: 80, hrScoreRank: 1, gameStartTime: gameA.gameStartTime,
});
const lateGameBatterTwo = makeBatter({
  playerId: 2, player: "Late Batter Two", hrScore: 70, hrScoreRank: 2,
  gameKey: "BAL@CHC", team: "CHC", opponent: "BAL", gameStartTime: gameA.gameStartTime,
});
const earlyGameBatter = makeBatter({
  playerId: 3, player: "Early Batter", hrScore: 60, hrScoreRank: 3,
  gameKey: "NYY@BOS", team: "NYY", opponent: "BOS", opposingPitcher: "Second Pitcher", opposingPitcherId: 2,
  gameStartTime: gameB.gameStartTime,
});
const tbdTimeBatter = makeBatter({
  playerId: 4, player: "TBD Batter", hrScore: 50, hrScoreRank: 4,
  gameKey: "UNKNOWN@GAME", team: "SF", opponent: "SD", opposingPitcher: "Unknown Pitcher", opposingPitcherId: 9,
  gameStartTime: null,
});

const dashboardFixture = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
  games: [gameA, gameB],
  pitchers: [basePitcher, secondPitcher],
  batters: [lateGameBatterOne, lateGameBatterTwo, earlyGameBatter, tbdTimeBatter],
};

function mockPropsData() {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      bestBets: null,
      status: { kind: "current", slateDate: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z" },
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

describe("MlbHrProps — Batter View header help icons removed", () => {
  it("renders the HR/batter table with no '?' help-icon buttons", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    const helpButtons = within(table).queryAllByRole("button", { name: /^About /i });
    expect(helpButtons).toHaveLength(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("still shows the HR Odds/Market %/HR Score/Pitcher Trend/AVG vs P header text (only the icon was removed, not the label)", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    expect(within(table).getByText("HR Score ↕")).toBeInTheDocument();
    expect(within(table).getByText("Pitcher Trend")).toBeInTheDocument();
    expect(within(table).getByText("AVG vs P")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("MlbHrProps — Angle column replaced by Game Time", () => {
  it("no longer renders an 'Angle' column header in the batter table", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    const headerRow = table.querySelector("thead tr") as HTMLElement;
    expect(within(headerRow).queryByText("Angle")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("renders a sortable Game Time column header", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    expect(within(table).getByRole("button", { name: /Game Time/ })).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("formats scheduled game times using the shared formatter", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    // gameA (BAL@CHC) is 2026-07-16T23:10:00Z -> 7:10 PM Eastern.
    expect(within(table).getAllByText("7:10 PM").length).toBeGreaterThan(0);
    // gameB (NYY@BOS) is 2026-07-16T17:05:00Z -> 1:05 PM Eastern.
    expect(within(table).getByText("1:05 PM")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows the TBD fallback for a batter whose game has no matching start time, never 'Invalid Date'", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    expect(within(table).getAllByText("TBD").length).toBeGreaterThan(0);
    expect(table.textContent).not.toMatch(/Invalid Date/i);
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("MlbHrProps — Game Time sorting", () => {
  function getBatterNameOrder(container: HTMLElement) {
    const table = container.querySelector("table") as HTMLElement;
    // Only real data rows have a multi-cell row with a sticky name cell containing this
    // exact span; the expanded batter-detail row is a single colSpan cell and is skipped.
    return Array.from(table.querySelectorAll("tbody tr td span.font-semibold.text-slate-900"))
      .map((el) => el.textContent?.trim())
      .filter((name): name is string => Boolean(name));
  }

  it("sorts ascending (earliest game first) on first click", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Game Time/ }));

    const order = getBatterNameOrder(container);
    // Earliest first: gameB (1:05 PM) batter, then gameA (7:10 PM) batters, then the TBD batter last.
    expect(order.indexOf("Early Batter")).toBeLessThan(order.indexOf("Late Batter One"));
    expect(order.indexOf("Early Batter")).toBeLessThan(order.indexOf("Late Batter Two"));
    expect(order.indexOf("TBD Batter")).toBe(order.length - 1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("sorts descending (latest game first) on second click, still with TBD last", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const header = screen.getByRole("button", { name: /Game Time/ });
    fireEvent.click(header); // ascending
    fireEvent.click(header); // descending

    const order = getBatterNameOrder(container);
    expect(order.indexOf("Late Batter One")).toBeLessThan(order.indexOf("Early Batter"));
    expect(order.indexOf("Late Batter Two")).toBeLessThan(order.indexOf("Early Batter"));
    // TBD sorts after every valid time in BOTH directions -- never jumps to the front on desc.
    expect(order.indexOf("TBD Batter")).toBe(order.length - 1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("keeps two players in the same game adjacent and does not reorder them relative to each other unexpectedly", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Game Time/ }));

    const order = getBatterNameOrder(container);
    const oneIndex = order.indexOf("Late Batter One");
    const twoIndex = order.indexOf("Late Batter Two");
    expect(Math.abs(oneIndex - twoIndex)).toBe(1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not break existing HR Score sorting", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /HR Score/ }));

    const order = getBatterNameOrder(container);
    // Default HR Score click toggles from the existing desc default to asc (lowest first).
    expect(order[0]).toBe("TBD Batter"); // hrScore 50, lowest
    expect(order[order.length - 1]).toBe("Late Batter One"); // hrScore 80, highest
  }, SLOW_RENDER_TIMEOUT_MS);
});
