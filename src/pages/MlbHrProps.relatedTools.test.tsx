import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";

// Verifies MlbHrProps renders the shared, registry-driven RelatedTools
// component in place of its old inline "More MLB tools" link array.
// Mirrors the mocking pattern already established in
// MlbBatterVsPitcher.render.test.tsx and MlbStrikeoutProps.sorting.test.tsx.

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

const baseBatter: HrDashboardBatter = {
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
};

const dashboardFixture = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T12:00:00.000Z",
  games: [baseGame],
  pitchers: [basePitcher],
  batters: [baseBatter],
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

async function renderPage() {
  const { default: MlbHrProps } = await import("@/pages/MlbHrProps");
  return render(
    <MemoryRouter>
      <MlbHrProps />
    </MemoryRouter>,
  );
}

const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbHrProps related-tools migration", () => {
  it("renders the shared RelatedTools navigation with canonical labels, excluding HR Props and Numerology", async () => {
    vi.resetModules();
    mockPropsData();
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

    expect(within(relatedTools).getByRole("link", { name: "Game Matchups" })).toHaveAttribute("href", "/mlb");
    expect(within(relatedTools).getByRole("link", { name: "Strikeout Props" })).toHaveAttribute("href", "/mlb/strikeout-props");
    expect(within(relatedTools).getByRole("link", { name: "Batter vs Pitcher" })).toHaveAttribute("href", "/mlb/batter-vs-pitcher");
    expect(within(relatedTools).getByRole("link", { name: "Props Hub" })).toHaveAttribute("href", "/mlb/props");
    expect(within(relatedTools).getByRole("link", { name: "Power Rankings" })).toHaveAttribute("href", "/mlb/power-rankings");
    expect(within(relatedTools).getByRole("link", { name: "Sin City" })).toHaveAttribute("href", "/mlb/sin-city");

    expect(within(relatedTools).queryByRole("link", { name: "HR Props" })).toBeNull();
    expect(within(relatedTools).queryByRole("link", { name: "Numerology" })).toBeNull();
    expect(within(relatedTools).queryByRole("link", { name: "MLB Hub" })).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not render any banned terminology in the related-tools navigation", async () => {
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const relatedTools = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(relatedTools).queryByText(/K Props/)).toBeNull();
    expect(within(relatedTools).queryByText(/Hit Props/)).toBeNull();
    expect(within(relatedTools).queryByText(/Prop Optimizer/)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);
});
