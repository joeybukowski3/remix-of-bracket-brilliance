/**
 * MlbStrikeoutProps.playerScoreTierColors.test.tsx
 *
 * Confirms the Strikeout Props "K Score" (Player Score) cell uses the same
 * shared 8-tier percentile-color system as Batter vs. Pitcher's Matchup
 * Score, on the desktop table, the mobile collapsed card, and the mobile
 * expand grid.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardGame, PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/hooks/usePitcherRegression", () => ({ usePitcherRegression: () => ({ data: [], loading: false }) }));
vi.mock("@/hooks/useMlbStrikeoutPropDetails", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMlbStrikeoutPropDetails")>("@/hooks/useMlbStrikeoutPropDetails");
  return {
    ...actual,
    useMlbStrikeoutPropDetails: () => ({ loading: false, fileUnavailable: false, detailsByKey: new Map(), detailsDate: "2026-07-09" }),
  };
});

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

const gameA: HrDashboardGame = {
  gameKey: "BAL@CHC", matchup: "BAL @ CHC", awayTeam: "BAL", homeTeam: "CHC",
  stadium: "Wrigley Field", roofType: "Open", temperature: 78, precipitation: 0,
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.0,
};

function makeRow(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "BAL@CHC",
    pitcher: "Base Pitcher",
    team: "BAL",
    opponent: "CHC",
    park: "Wrigley Field",
    parkFactor: 1.0,
    pitcherKRate: 28,
    pitcherWhiffRate: 31,
    pitcherKVs: 75,
    opponentTeamKRate: 25,
    opponentTeamWhiffRate: 28,
    opponentTeamXba: 0.24,
    pitcherKSkillScore: 74,
    opponentTeamStrikeoutScore: 66,
    strikeoutMatchupScore: 72,
    whyItRanksWell: "Strong K matchup",
    projectedIP: 6,
    projectedK9: 9,
    projectedKs: 6,
    kLine: 5.5,
    kOddsOver: "-115",
    kOddsUnder: "-115",
    kOddsBook: "draftkings",
    workloadRole: "starter",
    ...overrides,
  };
}

// 50 VALID pitchers, strictly descending K score -- percentile for rank 1
// (highest) is (49/50)*100 = 98, landing exactly on the Elite threshold;
// rank 50 (lowest) is 0, landing in Poor.
const rows = Array.from({ length: 50 }, (_, i) =>
  makeRow({
    rank: i + 1,
    pitcher: `Pitcher ${String(i + 1).padStart(2, "0")}`,
    strikeoutMatchupScore: 100 - i,
  }),
);

const dashboardFixture = { date: "2026-07-09", generatedAt: "2026-07-09T12:00:00.000Z", games: [gameA], batters: [] };

function mockPropsData() {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [gameA],
      strikeoutDetailRows: rows,
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
  }));
}

async function renderPage() {
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter>
      <MlbStrikeoutProps />
    </MemoryRouter>,
  );
}

const SLOW_RENDER_TIMEOUT_MS = 15000;

function mainSection() {
  return within(document.querySelector('[data-x-export="mlb-strikeout-props"]') as HTMLElement);
}

describe("Strikeout Props Player Score uses the shared percentile tier system", () => {
  it("gives the top K Score the Elite gold tier on the desktop table", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findAllByText("Pitcher 01");
    const row = mainSection().getByText("Pitcher 01").closest("tr");
    expect(row).not.toBeNull();
    const scoreCell = row!.querySelector("[data-percentile-tier]");
    expect(scoreCell).toHaveAttribute("data-percentile-tier", "elite");
    expect(scoreCell).toHaveTextContent("100.0");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("gives the bottom K Score the Poor tier on the desktop table", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findAllByText("Pitcher 01");
    const row = mainSection().getByText("Pitcher 50").closest("tr");
    expect(row).not.toBeNull();
    const scoreCell = row!.querySelector("[data-percentile-tier]");
    expect(scoreCell).toHaveAttribute("data-percentile-tier", "poor");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("resolves the same Elite tier for the top pitcher's collapsed mobile card and expanded K Score tile", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findAllByText("Pitcher 01");
    const card = mainSection().getByText("Pitcher 01").closest("article");
    expect(card).not.toBeNull();

    const collapsedCell = card!.querySelector("[data-percentile-tier]");
    expect(collapsedCell).toHaveAttribute("data-percentile-tier", "elite");

    const expandButton = within(card as HTMLElement).getByRole("button");
    fireEvent.click(expandButton);

    const tiers = card!.querySelectorAll("[data-percentile-tier]");
    expect(tiers.length).toBeGreaterThanOrEqual(2);
    tiers.forEach((el) => expect(el).toHaveAttribute("data-percentile-tier", "elite"));
  }, SLOW_RENDER_TIMEOUT_MS);
});
