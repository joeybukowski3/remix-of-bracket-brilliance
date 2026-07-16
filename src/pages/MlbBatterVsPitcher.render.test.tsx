import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherVsBatterRow } from "@/pages/MlbHrProps";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";

// Same jsdom caveat as the Strikeout Props tests: the page renders a desktop
// table and a mobile card list simultaneously (jsdom doesn't evaluate CSS
// media queries), so single-match queries can match twice for row content.

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
  team: "BAL",
  opposingPitcher: "Justin Steele",
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

const dashboardFixture = { date: "2026-07-16", generatedAt: "2026-07-16T12:00:00.000Z", games: [], pitchers: [], batters: [] };

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

function mockPropsData(
  rows: PitcherVsBatterRow[],
  games: (typeof baseGame)[] = [baseGame],
  status: MlbDataStatus = { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games,
      batterVsPitcherRows: rows,
      pitchers: [],
      status,
    }),
  }));
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

describe("MlbBatterVsPitcher clarity presentation", () => {
  it("renders the page guide, corrected column labels, rank tooltip, legend, and related-tool links without changing model controls", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    await renderPage();

    expect(screen.getByRole("heading", { name: "How to read this page" })).toBeTruthy();
    expect(screen.getByText(/Traditional batter-vs-pitcher history usually contains very small samples\./)).toBeTruthy();
    expect(screen.queryByText(/missing/i)).toBeNull();

    // Renamed columns -- visible label stays the accessible name (title is a
    // supplementary hover hint, not an aria-label override).
    const matchupScoreBtn = screen.getAllByRole("button", { name: /Matchup Score/ })[0];
    expect(matchupScoreBtn).toHaveAttribute("title", expect.stringContaining("Overall matchup strength"));
    expect(screen.getAllByRole("button", { name: /Batter Quality/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Pitcher Contact Allowed/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Pitcher Power Risk/ }).length).toBeGreaterThan(0);

    // Old labels must not remain
    expect(screen.queryByRole("button", { name: /^Hit Score/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Batter Score/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pitcher Score/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pitcher Vuln/ })).toBeNull();

    // Duplicate Edge column removed
    expect(screen.queryByRole("columnheader", { name: "Edge" })).toBeNull();

    const rankControl = screen.getByRole("button", { name: "Model Rank. This remains fixed even if you sort by another column." });
    expect(rankControl).toHaveAttribute("title", "Model Rank. This remains fixed even if you sort by another column.");

    expect(screen.getByRole("heading", { name: "Signal legend" })).toBeTruthy();

    // Related-tool links now come from the shared, registry-driven
    // RelatedTools component: canonical label is "Game Matchups" (not the
    // old page-local "MLB Hub"), and Batter vs Pitcher is correctly absent
    // from its own related-tools list.
    const relatedTools = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(relatedTools).getByRole("link", { name: "Game Matchups" })).toHaveAttribute("href", "/mlb");
    expect(within(relatedTools).getByRole("link", { name: "HR Props" })).toHaveAttribute("href", "/mlb/hr-props");
    expect(within(relatedTools).getByRole("link", { name: "Strikeout Props" })).toHaveAttribute("href", "/mlb/strikeout-props");
    expect(within(relatedTools).getByRole("link", { name: "Props Hub" })).toHaveAttribute("href", "/mlb/props");
    expect(within(relatedTools).getByRole("link", { name: "Power Rankings" })).toHaveAttribute("href", "/mlb/power-rankings");
    expect(within(relatedTools).getByRole("link", { name: "Sin City" })).toHaveAttribute("href", "/mlb/sin-city");
    expect(within(relatedTools).queryByRole("link", { name: "Batter vs Pitcher" })).toBeNull();
    expect(within(relatedTools).queryByRole("link", { name: "Numerology" })).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not use 'Hit Props' terminology for this tool anywhere on the page", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    const { container } = await renderPage();

    expect(container.textContent).not.toMatch(/Hit Props/);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows the shared no-games status instead of stale data when there are no games", async () => {
    vi.resetModules();
    mockPropsData([], [], { kind: "no-games-scheduled", slateDate: dashboardFixture.date });
    await renderPage();

    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("preserves matchup ranking and scores exactly as computed upstream (no scoring change)", async () => {
    vi.resetModules();
    const second: PitcherVsBatterRow = { ...baseRow, rank: 2, player: "Gunnar Henderson", bestMatchupScore: 40.2 };
    mockPropsData([baseRow, second]);
    await renderPage();

    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).getByText("61.5")).toBeTruthy();
    expect(within(mainTable).getByText("40.2")).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);
});
