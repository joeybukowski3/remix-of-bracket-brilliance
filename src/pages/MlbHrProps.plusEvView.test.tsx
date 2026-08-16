/**
 * Additive +EV table view on the HR Props Batter tab.
 * Default remains Analytic View; existing HR Score rendering is unchanged
 * until the user explicitly switches.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/hooks/usePitcherRegression", () => ({
  usePitcherRegression: () => ({ data: [], loading: false }),
}));

type MatchMediaStub = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
};

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
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.05,
};

const pitcher: HrDashboardPitcher = {
  gameKey: "BAL@CHC", pitcher: "Justin Steele", pitcherId: 1, team: "CHC", opponent: "BAL",
  hand: "L", ballpark: "Wrigley Field", parkFactor: 1.05, xera: 3.5, hardHitRate: 40,
  flyBallRate: 35, barrelRate: 7, kRate: 22, bbRate: 8, whiffRate: 24, last7HR: 1,
  hrPerStart: 0.8, hrVs: 62, hitsVs: 62, kVs: 50,
};

function makeBatter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: "BAL@CHC", playerId: 1, gameId: 1, lineupStatus: "confirmed", battingOrder: 3,
    starterConfirmed: true, position: "C", player: "Adley Rutschman", team: "BAL", opponent: "CHC",
    opposingPitcher: "Justin Steele", opposingPitcherId: 1, pitcherHand: "L", ballpark: "Wrigley Field",
    parkFactor: 1.05, atBats: 300, barrelRate: 9.5, hardHitRate: 44, exitVelo: 90, iso: 0.18,
    hrFBRatio: 10, pullRate: 40, xba: 0.26, kRate: 18, bbRate: 10, whiffRate: 24, last7HR: 5,
    last30HR: 3, opposingPitcherHrVs: 62, opposingPitcherHitsVs: 62, opposingPitcherKVs: 50,
    weatherBoost: 2, hrScore: 70, hrScoreRank: 1, angleTags: [],
    hrOddsYes: "+425",
    bats: "S",
    handednessSplits: {
      vsLeft: {
        plateAppearances: 180, atBats: 160, hits: 40, homeRuns: 10, walks: 15, strikeouts: 30,
        battingAverage: 0.25, onBasePercentage: 0.32, sluggingPercentage: 0.48, ops: 0.8,
        hrRate: 10 / 180, abPerHr: 16, strikeoutRate: 0.16, walkRate: 0.08, status: "ok", sampleSizeTier: "high",
      },
      vsRight: {
        plateAppearances: 220, atBats: 190, hits: 50, homeRuns: 10, walks: 20, strikeouts: 40,
        battingAverage: 0.26, onBasePercentage: 0.33, sluggingPercentage: 0.47, ops: 0.8,
        hrRate: 10 / 220, abPerHr: 19, strikeoutRate: 0.18, walkRate: 0.09, status: "ok", sampleSizeTier: "high",
      },
    },
    ...overrides,
  };
}

const STATUS: MlbDataStatus = { kind: "current", slateDate: "2026-08-16", generatedAt: "2026-08-16T12:00:00.000Z" };

function mockPropsData(batters: HrDashboardBatter[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: {
        date: "2026-08-16",
        generatedAt: "2026-08-16T12:00:00.000Z",
        games: [game],
        pitchers: [pitcher],
        batters,
      },
      bestBets: null,
      status: STATUS,
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

const TIMEOUT = 15000;

describe("MlbHrProps +EV view toggle", () => {
  it("defaults to Analytic View and keeps the existing HR table", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeBatter()]);
    const { container } = await renderPage();

    const analyticTab = screen.getByRole("tab", { name: "Analytic View" });
    const plusEvTab = screen.getByRole("tab", { name: "+EV Table" });
    expect(analyticTab).toHaveAttribute("aria-selected", "true");
    expect(plusEvTab).toHaveAttribute("aria-selected", "false");
    expect(container.querySelector('[data-x-export="mlb-hr-props"]')).not.toBeNull();
    expect(container.querySelector("[data-plus-ev-table]")).toBeNull();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
    expect(screen.getByText("70.0")).toBeInTheDocument();
  }, TIMEOUT);

  it("switches to the +EV table without keeping the analytic export table mounted", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeBatter()]);
    const { container } = await renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "+EV Table" }));
    expect(screen.getByRole("tab", { name: "+EV Table" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector("[data-plus-ev-table]")).not.toBeNull();
    expect(container.querySelector('[data-x-export="mlb-hr-props"]')).toBeNull();
    expect(screen.getByText("JKB HR%")).toBeInTheDocument();
    expect(screen.getByText("Fair Odds")).toBeInTheDocument();
    expect(screen.getByText("+425")).toBeInTheDocument();
  }, TIMEOUT);

  it("returns to Analytic View and restores the existing HR table", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeBatter()]);
    const { container } = await renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "+EV Table" }));
    fireEvent.click(screen.getByRole("tab", { name: "Analytic View" }));
    expect(screen.getByRole("tab", { name: "Analytic View" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector('[data-x-export="mlb-hr-props"]')).not.toBeNull();
    expect(container.querySelector("[data-plus-ev-table]")).toBeNull();
  }, TIMEOUT);

  it("renders an unavailable +EV state when odds are missing", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeBatter({ player: "No Odds", hrOddsYes: null, handednessSplits: null })]);
    await renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "+EV Table" }));
    expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for No Odds/i }));
    expect(screen.getByText(/Season HR\/PA is unavailable/i)).toBeInTheDocument();
  }, TIMEOUT);

  it("expands +EV details from the page view", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeBatter()]);
    await renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "+EV Table" }));
    fireEvent.click(screen.getByRole("button", { name: /Show \+EV details for Adley Rutschman/i }));
    const details = document.querySelector('[data-plus-ev-details="Adley Rutschman"]') as HTMLElement;
    expect(details).not.toBeNull();
    expect(within(details).getByText("Adjusted HR/PA")).toBeInTheDocument();
    expect(within(details).getByText(/65% starter \/ 35% bullpen/i)).toBeInTheDocument();
  }, TIMEOUT);
});
