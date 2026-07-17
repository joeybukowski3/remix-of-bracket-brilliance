/**
 * Focused tests for the display-only "AVG vs P" column and expandable
 * batter-vs-pitcher history panel on /mlb/hr-props -- both the main
 * Batters table and the Matchup Lenses table. Mirrors the mocking pattern
 * established in MlbHrProps.freshness.test.tsx and
 * MlbHrProps.relatedTools.test.tsx: hooks are mocked, never re-derived.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";
import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";

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

const highScoreBatter = makeBatter({ playerId: 1, player: "Adley Rutschman", hrScore: 80, hrScoreRank: 1 });
const lowScoreBatter = makeBatter({ playerId: 2, player: "Second Batter", opposingPitcherId: 1, hrScore: 40, hrScoreRank: 2 });

const dashboardFixture = {
  date: "2026-07-17",
  generatedAt: "2026-07-17T09:32:34.452Z",
  games: [baseGame],
  pitchers: [basePitcher],
  batters: [highScoreBatter, lowScoreBatter],
};

const historyEntry: BvpHistoryEntry = {
  key: "1|1",
  batterId: 1,
  pitcherId: 1,
  batter: "Adley Rutschman",
  pitcher: "Justin Steele",
  status: "available",
  career: { pa: 59, h: 11, avg: 0.262, hr: 5 },
  last5y: { pa: 27, h: 7, avg: 0.412, hr: 3 },
};

function mockPropsData() {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      bestBets: null,
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
        historyByKey: state.historyByKey ?? new Map([["1|1", historyEntry]]),
      }),
    };
  });
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

describe("MlbHrProps — AVG vs P (Batters table)", () => {
  it("shows the AVG vs P column header", async () => {
    vi.resetModules();
    mockPropsData();
    mockBvpHistory();
    await renderPage();

    expect(screen.getByText("AVG vs P")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows the career AVG in the compact column without expanding the row", async () => {
    vi.resetModules();
    mockPropsData();
    mockBvpHistory();
    await renderPage();

    expect(screen.getByText(".262")).toBeInTheDocument();
    expect(screen.queryByText("Career")).toBeNull();
    expect(screen.queryByText("Last 5Y")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not show PA, H, or HR in the collapsed state", async () => {
    vi.resetModules();
    mockPropsData();
    mockBvpHistory();
    await renderPage();

    expect(screen.queryByText("59")).toBeNull();
    expect(screen.queryByText("11")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("expanding the row reveals PA, H, HR, and the Career/Last 5Y toggle", async () => {
    vi.resetModules();
    mockPropsData();
    mockBvpHistory();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /batter-vs-pitcher history for Adley Rutschman/ }));

    expect(screen.getByRole("button", { name: "Career" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 5Y" })).toBeInTheDocument();
    expect(screen.getByText("59")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows an unavailable message when the history file failed to load", async () => {
    vi.resetModules();
    mockPropsData();
    mockBvpHistory({ fileUnavailable: true, historyByKey: new Map() });
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /batter-vs-pitcher history for Adley Rutschman/ }));
    expect(screen.getByTestId("bvp-history-unavailable")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not change the default HR-Score-descending row order regardless of BvP history values", async () => {
    vi.resetModules();
    mockPropsData();
    // Give the second (lower hrScore) batter a much higher AVG vs P than the first, to prove ordering ignores it.
    mockBvpHistory({
      historyByKey: new Map([
        ["1|1", { ...historyEntry, career: { pa: 59, h: 11, avg: 0.100, hr: 5 } }],
        ["2|1", { ...historyEntry, key: "2|1", batterId: 2, career: { pa: 40, h: 20, avg: 0.500, hr: 10 } }],
      ]),
    });
    const { container } = await renderPage();

    const html = container.innerHTML;
    const firstIndex = html.indexOf("Adley Rutschman");
    const secondIndex = html.indexOf("Second Batter");
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(-1);
    expect(firstIndex).toBeLessThan(secondIndex);
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("MlbHrProps — AVG vs P (Matchup Lenses table)", () => {
  it("shows the AVG vs P column and expandable panel after switching to the Matchup Lenses tab", async () => {
    vi.resetModules();
    mockPropsData();
    mockBvpHistory();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "⚔️ Matchup Lenses" }));

    const matchupHeaders = screen.getAllByText("AVG vs P");
    expect(matchupHeaders.length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /batter-vs-pitcher history for Adley Rutschman/ })[0]);
    expect(screen.getAllByRole("button", { name: "Career" }).length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("MlbHrProps — sword emoji on the strongest matchups (restored, same >= 70 rule already used on the Batters tab and Batter vs Pitcher)", () => {
  it("shows the sword on the Batters tab when the opposing pitcher's HR VS is >= 70", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useMlbPropsData", () => ({
      useMlbPropsData: () => ({
        dashboard: {
          ...dashboardFixture,
          batters: [makeBatter({ playerId: 1, player: "Adley Rutschman", opposingPitcherHrVs: 74.9 })],
        },
        bestBets: null,
        status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
      }),
    }));
    mockBvpHistory();
    await renderPage();

    // Exact match only, since the "⚔️ Matchup Lenses" tab label and heading
    // always contain the glyph as a substring -- only a standalone "⚔️" text
    // node is the real per-row indicator.
    expect(screen.getAllByText("⚔️", { exact: true }).length).toBeGreaterThanOrEqual(1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not show the sword on the Batters tab when the opposing pitcher's HR VS is below 70", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useMlbPropsData", () => ({
      useMlbPropsData: () => ({
        dashboard: {
          ...dashboardFixture,
          batters: [makeBatter({ playerId: 1, player: "Adley Rutschman", opposingPitcherHrVs: 55 })],
        },
        bestBets: null,
        status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
      }),
    }));
    mockBvpHistory();
    await renderPage();

    expect(screen.queryAllByText("⚔️", { exact: true })).toHaveLength(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows the sword on the Matchup Lenses (Best Matchups) table using the same >= 70 rule on Pitcher Hits VS and Pitcher HR VS", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useMlbPropsData", () => ({
      useMlbPropsData: () => ({
        dashboard: {
          ...dashboardFixture,
          batters: [makeBatter({ playerId: 1, player: "Adley Rutschman", opposingPitcherHitsVs: 71, opposingPitcherHrVs: 74.9 })],
        },
        bestBets: null,
        status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
      }),
    }));
    mockBvpHistory();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "⚔️ Matchup Lenses" }));

    // 2 standalone inline row indicators (Pitcher Hits VS, Pitcher HR VS).
    // Exact match only, since the tab label and heading contain the glyph as
    // a substring within a longer text node and must not count here.
    expect(screen.getAllByText("⚔️", { exact: true }).length).toBeGreaterThanOrEqual(2);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not show the sword on the Matchup Lenses table when both pitcher-vulnerability metrics are below 70", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useMlbPropsData", () => ({
      useMlbPropsData: () => ({
        dashboard: {
          ...dashboardFixture,
          batters: [makeBatter({ playerId: 1, player: "Adley Rutschman", opposingPitcherHitsVs: 62, opposingPitcherHrVs: 55 })],
        },
        bestBets: null,
        status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
      }),
    }));
    mockBvpHistory();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "⚔️ Matchup Lenses" }));

    // The tab label and section heading always contain the glyph as part of
    // a longer text node ("⚔️ Matchup Lenses"), so they never match an exact
    // "⚔️" query -- zero exact matches confirms no per-row indicator rendered.
    expect(screen.queryAllByText("⚔️", { exact: true })).toHaveLength(0);
  }, SLOW_RENDER_TIMEOUT_MS);
});
