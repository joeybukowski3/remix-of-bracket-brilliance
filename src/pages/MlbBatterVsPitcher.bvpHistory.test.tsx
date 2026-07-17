/**
 * Focused tests for the display-only "AVG vs P" column and expandable
 * batter-vs-pitcher history panel on /mlb/batter-vs-pitcher. Mirrors the
 * mocking pattern established in MlbBatterVsPitcher.render.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherVsBatterRow } from "@/pages/MlbHrProps";
import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/components/mlb/MlbTeamLogo", () => ({ default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span> }));

const baseRow: PitcherVsBatterRow = {
  rank: 1,
  gameKey: "BAL@CHC",
  player: "Adley Rutschman",
  playerId: 665742,
  team: "BAL",
  opposingPitcher: "Justin Steele",
  opposingPitcherId: 605400,
  park: "Wrigley Field",
  parkFactor: 1.0,
  hrScore: 60,
  opposingPitcherHrVs: 55,
  opposingPitcherHitsVs: 62,
  opposingPitcherKVs: 50,
  hrTargetScore: 58,
  bestMatchupScore: 61.5,
  strikeoutMatchupScore: 45,
  batterPowerScore: 57,
  pitcherVulnerabilityScore: 53,
  contextScore: 50,
  barrelRate: 9.5,
  hardHitRate: 44,
  xba: 0.26,
  kRate: 18,
  whiffRate: 24,
  pitcherBarrelRate: 7,
  pitcherHardHitRate: 40,
  pitcherKRate: 22,
  pitcherFlyBallRate: 35,
  windBlowingOut: false,
  angleTags: [],
};

const dashboardFixture = { date: "2026-07-17", generatedAt: "2026-07-17T12:00:00.000Z", games: [], pitchers: [], batters: [] };

const baseGame = {
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

const historyEntry: BvpHistoryEntry = {
  key: "665742|605400",
  batterId: 665742,
  pitcherId: 605400,
  batter: "Adley Rutschman",
  pitcher: "Justin Steele",
  status: "available",
  career: { pa: 59, h: 11, avg: 0.262, hr: 5 },
  last5y: { pa: 27, h: 7, avg: 0.412, hr: 3 },
};

function mockPropsData(rows: PitcherVsBatterRow[], games: (typeof baseGame)[] = [baseGame]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games,
      batterVsPitcherRows: rows,
      pitchers: [],
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
  }));
}

function mockBvpHistory(state: { loading?: boolean; fileUnavailable?: boolean; historyByKey?: Map<string, BvpHistoryEntry> } = {}) {
  vi.doMock("@/hooks/useMlbBvpHistory", async () => {
    const actual = await vi.importActual<typeof import("@/hooks/useMlbBvpHistory")>("@/hooks/useMlbBvpHistory");
    return {
      ...actual,
      useMlbBvpHistory: () => ({
        loading: state.loading ?? false,
        fileUnavailable: state.fileUnavailable ?? false,
        historyByKey: state.historyByKey ?? new Map([["665742|605400", historyEntry]]),
      }),
    };
  });
}

async function renderPage() {
  const { default: MlbBatterVsPitcher } = await import("@/pages/MlbBatterVsPitcher");
  return render(
    <MemoryRouter>
      <MlbBatterVsPitcher />
    </MemoryRouter>,
  );
}

const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbBatterVsPitcher — AVG vs P", () => {
  it("shows the AVG vs P column header", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockBvpHistory();
    await renderPage();

    expect(screen.getAllByText("AVG vs P").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows the career AVG in the compact column without expanding the row", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockBvpHistory();
    await renderPage();

    expect(screen.getAllByText(".262").length).toBeGreaterThan(0);
    expect(screen.queryByText("Career")).toBeNull();
    expect(screen.queryByText("Last 5Y")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not show PA, H, or HR before expanding", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockBvpHistory();
    await renderPage();

    expect(screen.queryByText("59")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("expanding the desktop row reveals PA, H, HR, and the Career/Last 5Y toggle", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockBvpHistory();
    await renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /batter-vs-pitcher history for Adley Rutschman/ })[0]);

    expect(screen.getAllByRole("button", { name: "Career" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Last 5Y" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("59").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows a no-history message when the batter has never faced this pitcher", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockBvpHistory({ historyByKey: new Map([["665742|605400", { ...historyEntry, career: null, last5y: null }]]) });
    await renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /batter-vs-pitcher history for Adley Rutschman/ })[0]);
    expect(screen.getAllByTestId("bvp-history-none").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("preserves matchup ranking and scores exactly as computed upstream (BvP history has no effect on order)", async () => {
    vi.resetModules();
    const second: PitcherVsBatterRow = { ...baseRow, rank: 2, player: "Gunnar Henderson", playerId: 683002, bestMatchupScore: 40.2 };
    // Give the lower-ranked batter a far higher AVG vs P to prove it doesn't affect ranking.
    mockPropsData([baseRow, second]);
    mockBvpHistory({
      historyByKey: new Map([
        ["665742|605400", { ...historyEntry, career: { pa: 10, h: 1, avg: 0.05, hr: 0 } }],
        ["683002|605400", { ...historyEntry, key: "683002|605400", batterId: 683002, career: { pa: 10, h: 8, avg: 0.6, hr: 4 } }],
      ]),
    });
    const { container } = await renderPage();

    expect(container.textContent).toMatch(/61\.5/);
    expect(container.textContent).toMatch(/40\.2/);
    const firstIndex = container.innerHTML.indexOf("Adley Rutschman");
    const secondIndex = container.innerHTML.indexOf("Gunnar Henderson");
    expect(firstIndex).toBeGreaterThan(-1);
    expect(firstIndex).toBeLessThan(secondIndex);
  }, SLOW_RENDER_TIMEOUT_MS);
});
