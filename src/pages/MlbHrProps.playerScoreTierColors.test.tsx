/**
 * MlbHrProps.playerScoreTierColors.test.tsx
 *
 * Confirms the HR Props "HR Score" (Player Score) cell uses the same shared
 * 8-tier percentile-color system as Batter vs. Pitcher's Matchup Score,
 * on both the desktop table and the mobile collapsed card.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

type MatchMediaStub = { matches: boolean; media: string; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string): MatchMediaStub => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const game: HrDashboardGame = {
  gameKey: "BAL@CHC", matchup: "BAL @ CHC", awayTeam: "BAL", homeTeam: "CHC",
  stadium: "Wrigley Field", roofType: "Open", temperature: 78, precipitation: 0,
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.0,
};

const pitcher: HrDashboardPitcher = {
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
    hrFBRatio: 10, pullRate: 40, xba: 0.26, kRate: 18, bbRate: 10, whiffRate: 24, last7HR: 5,
    last30HR: 3, opposingPitcherHrVs: 55, opposingPitcherHitsVs: 62, opposingPitcherKVs: 50,
    weatherBoost: 0, hrScore: 60, hrScoreRank: 1, angleTags: [],
    ...overrides,
  };
}

// 50 batters, strictly descending hrScore -- percentile for rank 1 (highest)
// is (49/50)*100 = 98, landing exactly on the Elite threshold; rank 50
// (lowest) is 0, landing in Poor. Kept out of the Overdue/Mismatches insight
// cards via last7HR: 5 and a moderate opposingPitcherHrVs/xera.
const batters = Array.from({ length: 50 }, (_, i) =>
  makeBatter({
    playerId: 100 + i,
    player: `Batter ${String(i + 1).padStart(2, "0")}`,
    hrScore: 100 - i,
    hrScoreRank: i + 1,
  }),
);

const dashboardFixture = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
  games: [game],
  pitchers: [pitcher],
  batters,
  gameEnvironments: [
    { gameKey: "BAL@CHC", matchup: "BAL @ CHC", ballpark: "Wrigley Field", gameHrEnvironmentScore: 82, parkFactor: 1.0, weatherEffect: 1.2, starterVulnerability: 60, qualifyingHitterCount: 4, avgQualifyingHitterScore: 65 },
  ],
};

const bestBetsFixture = {
  date: "2026-07-16",
  bestBets: [],
  valueBets: [],
  longshots: [],
  slatePreview: { slateOverview: "Slate note.", modelNote: "Model note." },
};

const CURRENT_STATUS = { kind: "current" as const, slateDate: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z" };

function mockPropsData() {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      bestBets: bestBetsFixture,
      status: CURRENT_STATUS,
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

describe("HR Props Player Score uses the shared percentile tier system", () => {
  it("gives the top HR Score the Elite gold tier on the desktop table", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    await screen.findByText("Batter 01");
    const row = screen.getByText("Batter 01").closest("tr");
    expect(row).not.toBeNull();
    const scoreCell = row!.querySelector('[data-percentile-tier]');
    expect(scoreCell).toHaveAttribute("data-percentile-tier", "elite");
    expect(scoreCell).toHaveTextContent("100.0");
    void container;
  }, SLOW_RENDER_TIMEOUT_MS);

  it("gives the bottom HR Score the Poor tier on the desktop table", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findByText("Batter 01");
    const row = screen.getByText("Batter 50").closest("tr");
    expect(row).not.toBeNull();
    const scoreCell = row!.querySelector('[data-percentile-tier]');
    expect(scoreCell).toHaveAttribute("data-percentile-tier", "poor");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("resolves the same Elite tier for the top batter's collapsed mobile card", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    // Batter name renders as two stacked lines (first/last) in the mobile row, so locate
    // the row via its aria-label rather than a single combined "Batter 01" text node.
    const card = await screen.findByRole("button", { name: /Show batter-vs-pitcher history for Batter 01/ });
    expect(card).not.toBeNull();
    const scoreCell = card!.querySelector('[data-percentile-tier]');
    expect(scoreCell).toHaveAttribute("data-percentile-tier", "elite");
  }, SLOW_RENDER_TIMEOUT_MS);
});
