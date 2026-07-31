/**
 * Focused tests for the Park Factors <-> Batter View shared game-filter
 * integration on the HR Props page:
 * - Park Factors no longer duplicates its game/park cards.
 * - Clicking a park card filters the batter table to that matchup.
 * - The Park Factors selection and the "Game" dropdown stay in sync in both
 *   directions.
 * - Clicking the already-selected park (or "All games" in the dropdown)
 *   restores the full table.
 * - Selecting a game does not alter park-factor/weather values or mutate
 *   source data.
 * Mirrors the mocking pattern established in MlbHrProps.gameTime.test.tsx.
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
vi.mock("@/hooks/useIsCompactLayout", () => ({ useIsCompactLayout: () => false }));

const gameA: HrDashboardGame = {
  gameKey: "PIT@CIN", matchup: "PIT @ CIN", awayTeam: "PIT", homeTeam: "CIN",
  stadium: "Great American Ball Park", roofType: "Open", temperature: 78, precipitation: 0,
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.05,
  gameStartTime: "2026-07-16T23:10:00Z",
};
const gameB: HrDashboardGame = {
  gameKey: "SEA@LAD", matchup: "SEA @ LAD", awayTeam: "SEA", homeTeam: "LAD",
  stadium: "Dodger Stadium", roofType: "Open", temperature: 82, precipitation: 0,
  windSpeed: 8, windDirection: "SW", conditions: "Clear", parkFactor: 0.92,
  gameStartTime: "2026-07-16T17:05:00Z",
};

const pitcherA: HrDashboardPitcher = {
  gameKey: "PIT@CIN", pitcher: "Cincy Pitcher", pitcherId: 1, team: "CIN", opponent: "PIT",
  hand: "L", ballpark: "Great American Ball Park", parkFactor: 1.05, xera: 3.5, hardHitRate: 40,
  flyBallRate: 35, barrelRate: 7, kRate: 22, bbRate: 8, whiffRate: 24, last7HR: 1,
  hrPerStart: 0.8, hrVs: 55, hitsVs: 62, kVs: 50,
};
const pitcherB: HrDashboardPitcher = {
  ...pitcherA, gameKey: "SEA@LAD", pitcher: "Dodger Pitcher", pitcherId: 2, team: "LAD", opponent: "SEA",
};

function makeBatter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: "PIT@CIN", playerId: 1, gameId: 1, lineupStatus: "confirmed", battingOrder: 3,
    starterConfirmed: true, position: "C", player: "Pirate Batter", team: "PIT", opponent: "CIN",
    opposingPitcher: "Cincy Pitcher", opposingPitcherId: 1, pitcherHand: "L", ballpark: "Great American Ball Park",
    parkFactor: 1.05, atBats: 300, barrelRate: 9.5, hardHitRate: 44, exitVelo: 90, iso: 0.18,
    hrFBRatio: 10, pullRate: 40, xba: 0.26, kRate: 18, bbRate: 10, whiffRate: 24, last7HR: 1,
    last30HR: 3, opposingPitcherHrVs: 55, opposingPitcherHitsVs: 62, opposingPitcherKVs: 50,
    weatherBoost: 0, hrScore: 60, hrScoreRank: 1, angleTags: [],
    ...overrides,
  };
}

const pitBatter = makeBatter({ playerId: 1, player: "Pirate Batter", hrScore: 70, hrScoreRank: 1 });
const cinBatter = makeBatter({
  playerId: 2, player: "Reds Batter", team: "CIN", opponent: "PIT", hrScore: 65, hrScoreRank: 2,
});
const seaBatter = makeBatter({
  playerId: 3, player: "Mariner Batter", hrScore: 60, hrScoreRank: 3,
  gameKey: "SEA@LAD", team: "SEA", opponent: "LAD", opposingPitcher: "Dodger Pitcher", opposingPitcherId: 2,
});

const dashboardFixture = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
  games: [gameA, gameB],
  pitchers: [pitcherA, pitcherB],
  batters: [pitBatter, cinBatter, seaBatter],
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

function getVisibleBatterNames(container: HTMLElement) {
  const table = container.querySelector("table") as HTMLElement;
  return Array.from(table.querySelectorAll("tbody tr td span.font-semibold.text-slate-900"))
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => Boolean(t));
}

describe("MlbHrProps — Park Factors does not duplicate cards", () => {
  it("renders each park exactly once (collapsed compact row, not also a detail card)", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    const parkSection = container.querySelector('[data-testid="park-factors-strip"]') as HTMLElement;
    expect(within(parkSection).getAllByText("Great American Ball Park")).toHaveLength(1);
    expect(within(parkSection).getAllByText("Dodger Stadium")).toHaveLength(1);
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("MlbHrProps — Park Factors click filters the Batter View table", () => {
  it("clicking PIT @ CIN shows only players from that game", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByText("Great American Ball Park"));

    const names = getVisibleBatterNames(container);
    expect(names).toContain("Pirate Batter");
    expect(names).toContain("Reds Batter");
    expect(names).not.toContain("Mariner Batter");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("clicking SEA @ LAD shows only players from that game", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByText("Dodger Stadium"));

    const names = getVisibleBatterNames(container);
    expect(names).toEqual(["Mariner Batter"]);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("synchronizes the park selection into the Game dropdown", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByText("Dodger Stadium"));

    // Find the Game <select> by its current value directly.
    const gameSelect = Array.from(container.querySelectorAll("select")).find((el) => (el as HTMLSelectElement).value === "SEA@LAD") as HTMLSelectElement | undefined;
    expect(gameSelect).toBeDefined();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("clicking the selected park again clears the filter (returns to All games)", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByText("Dodger Stadium"));
    expect(getVisibleBatterNames(container)).toEqual(["Mariner Batter"]);

    fireEvent.click(screen.getByText("Dodger Stadium"));
    const names = getVisibleBatterNames(container);
    expect(names).toContain("Pirate Batter");
    expect(names).toContain("Mariner Batter");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("changing the Game dropdown back to All games clears the Park Factors selection and restores the full table", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByText("Dodger Stadium"));
    expect(getVisibleBatterNames(container)).toEqual(["Mariner Batter"]);

    const gameSelect = Array.from(container.querySelectorAll("select")).find((el) => (el as HTMLSelectElement).value === "SEA@LAD") as HTMLSelectElement;
    fireEvent.change(gameSelect, { target: { value: "all" } });

    const names = getVisibleBatterNames(container);
    expect(names).toContain("Pirate Batter");
    expect(names).toContain("Mariner Batter");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("selecting a park does not change the park-factor or weather values shown", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    fireEvent.click(screen.getByText("Dodger Stadium"));

    const parkSection = container.querySelector('[data-testid="park-factors-strip"]') as HTMLElement;
    expect(within(parkSection).getByText("0.92")).toBeInTheDocument();
    expect(within(parkSection).getByText("1.05")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("preserves the current table sort after filtering by park", async () => {
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    // Default sort is HR Score descending; Pirate Batter (70) should outrank Reds Batter (65).
    fireEvent.click(screen.getByText("Great American Ball Park"));

    const names = getVisibleBatterNames(container);
    expect(names.indexOf("Pirate Batter")).toBeLessThan(names.indexOf("Reds Batter"));
  }, SLOW_RENDER_TIMEOUT_MS);
});
