import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

// Same jsdom caveat as MlbStrikeoutProps.rowDetail.test.tsx: the page renders
// a desktop table and a mobile card list simultaneously (jsdom doesn't
// evaluate CSS media queries), so single-match queries can match twice.
// Tests act on the first (desktop) match via getAllBy*.

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/components/mlb/MlbTeamLogo", () => ({ default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span> }));
vi.mock("@/hooks/useMlbStrikeoutPropDetails", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMlbStrikeoutPropDetails")>("@/hooks/useMlbStrikeoutPropDetails");
  return {
    ...actual,
    useMlbStrikeoutPropDetails: () => ({ loading: false, fileUnavailable: false, detailsByKey: new Map(), detailsDate: "2026-07-09" }),
  };
});

const baseRow: PitcherStrikeoutTeamRow = {
  rank: 1,
  gameKey: "BAL@CHC",
  pitcher: "Dean Kremer",
  team: "BAL",
  opponent: "CHC",
  park: "Wrigley Field",
  parkFactor: 1.0,
  pitcherKRate: 22,
  pitcherWhiffRate: 28,
  pitcherKVs: 60,
  opponentTeamKRate: 24,
  opponentTeamWhiffRate: 30,
  opponentTeamXba: 0.24,
  pitcherKSkillScore: 65,
  opponentTeamStrikeoutScore: 58,
  strikeoutMatchupScore: 62,
  whyItRanksWell: "Strong K matchup",
  projectedIP: 5.5,
  projectedK9: 8.2,
  projectedKs: 5.0,
  kLine: 6.5,
  kOddsOver: "-110",
  kOddsUnder: "-110",
};

// Highest projected Ks, but the smallest edge vs its line -- should rank
// first under "Most Strikeouts" but NOT first under "Best Value".
const highKsRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 2,
  pitcher: "Zac Gallen",
  team: "AZ",
  opponent: "SD",
  gameKey: "AZ@SD",
  projectedKs: 9.0,
  kLine: 8.8,
};

// Lower projected Ks, but the biggest absolute edge vs its line (a strong
// UNDER) -- should rank first under "Best Value".
const bigUnderEdgeRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 3,
  pitcher: "Framber Valdez",
  team: "HOU",
  opponent: "TEX",
  gameKey: "HOU@TEX",
  projectedKs: 4.0,
  kLine: 7.0,
};

const noMarketRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 4,
  pitcher: "No Market Pitcher",
  team: "SEA",
  opponent: "OAK",
  gameKey: "SEA@OAK",
  kLine: undefined,
  kOddsOver: undefined,
  kOddsUnder: undefined,
};

const lineWithoutOddsRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 5,
  pitcher: "Line Only Pitcher",
  team: "NYY",
  opponent: "BOS",
  gameKey: "NYY@BOS",
  kLine: 5.5,
  kOddsOver: undefined,
  kOddsUnder: undefined,
};

const dashboardFixture = { date: "2026-07-09", generatedAt: "2026-07-09T12:00:00.000Z", games: [], pitchers: [], batters: [] };

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({ dashboard: dashboardFixture, games: [], loading: false, strikeoutDetailRows: rows }),
  }));
}

async function renderPage() {
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter>
      <MlbStrikeoutProps />
    </MemoryRouter>
  );
}

function firstTrigger(name: string | RegExp) {
  return screen.getAllByRole("button", { name })[0];
}

/** Desktop rows are `role="button"` <tr> elements labeled the same way as the pitcher trigger used to be. */
function firstDesktopRow(name: string | RegExp) {
  const candidates = screen.getAllByRole("button", { name }).filter((el) => el.tagName === "TR");
  return candidates[0];
}

const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbStrikeoutProps sort modes and row-anywhere click", () => {
  it("renders the page, Edge, Best Value, rank, and related-tool guidance without changing the model controls", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    await renderPage();

    expect(screen.getByRole("heading", { name: "How to use this page" })).toBeTruthy();
    expect(screen.getByText(/This board ranks today's probable starters by K Score/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Understanding Edge" })).toBeTruthy();
    expect(screen.getByText("Edge compares our projected strikeouts to the sportsbook line.")).toBeTruthy();
    expect(screen.getByText(/Best Value ranks the largest differences between the model and sportsbook line/)).toBeTruthy();

    const rankControl = screen.getByRole("button", { name: "Model Rank. This remains fixed even if you sort by another column." });
    expect(rankControl).toHaveAttribute("title", "Model Rank. This remains fixed even if you sort by another column.");

    // Related-tool links now come from the shared, registry-driven
    // RelatedTools component: canonical label is "Game Matchups" (not the
    // old page-local "MLB Hub"), and Strikeout Props is correctly absent
    // from its own related-tools list.
    const relatedTools = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(relatedTools).getByRole("link", { name: "Game Matchups" })).toHaveAttribute("href", "/mlb");
    expect(within(relatedTools).getByRole("link", { name: "HR Props" })).toHaveAttribute("href", "/mlb/hr-props");
    expect(within(relatedTools).getByRole("link", { name: "Batter vs Pitcher" })).toHaveAttribute("href", "/mlb/batter-vs-pitcher");
    expect(within(relatedTools).getByRole("link", { name: "Props Hub" })).toHaveAttribute("href", "/mlb/props");
    expect(within(relatedTools).getByRole("link", { name: "Sin City" })).toHaveAttribute("href", "/mlb/sin-city");
    expect(within(relatedTools).getByRole("link", { name: "Power Rankings" })).toHaveAttribute("href", "/mlb/power-rankings");
    expect(within(relatedTools).queryByRole("link", { name: "Strikeout Props" })).toBeNull();
    expect(within(relatedTools).queryByRole("link", { name: "Numerology" })).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows explicit missing-line and missing-odds messages without removing ranked pitchers", async () => {
    vi.resetModules();
    mockPropsData([baseRow, noMarketRow, lineWithoutOddsRow]);
    await renderPage();

    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).getByText("No line posted yet")).toBeTruthy();
    expect(within(mainTable).getByText("Odds not yet available for this slate.")).toBeTruthy();
    expect(within(mainTable).getByText("No Market Pitcher")).toBeTruthy();
    expect(within(mainTable).getByText("Line Only Pitcher")).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows a slate-level market message when no ranked pitcher has a posted line or odds", async () => {
    vi.resetModules();
    mockPropsData([noMarketRow]);
    await renderPage();

    expect(screen.getByText("No line posted yet. Odds not yet available for this slate.")).toBeTruthy();
    expect(screen.getAllByText("No Market Pitcher").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("clicking anywhere on the desktop row (not just the pitcher name) toggles expansion", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    await renderPage();

    const row = firstDesktopRow("Show recent strikeout details for Dean Kremer");
    expect(row).toHaveAttribute("aria-expanded", "false");

    // Click a cell that is NOT the pitcher name (e.g. the K% cell) to prove the whole row is the click target.
    const kRateCell = within(row).queryByText("22.0%") ?? row;
    fireEvent.click(kRateCell);

    await waitFor(() => {
      expect(firstDesktopRow(/Hide recent strikeout details for Dean Kremer/)).toHaveAttribute("aria-expanded", "true");
    });
  }, SLOW_RENDER_TIMEOUT_MS);

  it("supports keyboard activation (Enter) on the row, not just mouse click", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    await renderPage();

    const row = firstDesktopRow("Show recent strikeout details for Dean Kremer");
    fireEvent.keyDown(row, { key: "Enter" });

    await waitFor(() => {
      expect(firstDesktopRow(/Hide recent strikeout details for Dean Kremer/)).toHaveAttribute("aria-expanded", "true");
    });
  }, SLOW_RENDER_TIMEOUT_MS);

  it("supports keyboard activation (Space) on the row", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    await renderPage();

    const row = firstDesktopRow("Show recent strikeout details for Dean Kremer");
    fireEvent.keyDown(row, { key: " " });

    await waitFor(() => {
      expect(firstDesktopRow(/Hide recent strikeout details for Dean Kremer/)).toHaveAttribute("aria-expanded", "true");
    });
  }, SLOW_RENDER_TIMEOUT_MS);

  it('"Most Strikeouts" sorts rows by projected strikeouts, highest first', async () => {
    vi.resetModules();
    mockPropsData([bigUnderEdgeRow, highKsRow, baseRow]); // deliberately out of order
    await renderPage();

    fireEvent.click(firstTrigger("Most Strikeouts"));

    await waitFor(() => {
      const cells = screen.getAllByText(/Gallen|Valdez|Kremer/);
      const desktopOrder = cells.filter((el) => el.closest("tr")).map((el) => el.textContent);
      // Zac Gallen (9.0 proj) should now appear before Dean Kremer (5.0 proj) in the desktop table body.
      const gallenIndex = desktopOrder.findIndex((t) => t?.includes("Gallen"));
      const kremerIndex = desktopOrder.findIndex((t) => t?.includes("Kremer"));
      expect(gallenIndex).toBeGreaterThanOrEqual(0);
      expect(gallenIndex).toBeLessThan(kremerIndex);
    });
  }, SLOW_RENDER_TIMEOUT_MS);

  it('"Best Value" ranks the largest absolute edge first, so a big UNDER outranks a small OVER even with fewer projected strikeouts', async () => {
    vi.resetModules();
    mockPropsData([highKsRow, baseRow, bigUnderEdgeRow]); // deliberately out of order
    await renderPage();

    fireEvent.click(firstTrigger("Best Value"));

    await waitFor(() => {
      const cells = screen.getAllByText(/Gallen|Valdez|Kremer/);
      const desktopOrder = cells.filter((el) => el.closest("tr")).map((el) => el.textContent);
      const valdezIndex = desktopOrder.findIndex((t) => t?.includes("Valdez")); // -3.0 edge, biggest
      const gallenIndex = desktopOrder.findIndex((t) => t?.includes("Gallen")); // +0.2 edge, smallest
      expect(valdezIndex).toBeGreaterThanOrEqual(0);
      expect(valdezIndex).toBeLessThan(gallenIndex);
    });
  }, SLOW_RENDER_TIMEOUT_MS);

  it("Best Value keeps a row with a missing projection visible but ranked below every row with a real edge", async () => {
    vi.resetModules();
    const noProjectionRow: PitcherStrikeoutTeamRow = { ...baseRow, rank: 4, pitcher: "No Projection Guy", team: "SEA", opponent: "OAK", gameKey: "SEA@OAK", projectedKs: undefined, kLine: 6.5 };
    mockPropsData([noProjectionRow, bigUnderEdgeRow]);
    await renderPage();

    fireEvent.click(firstTrigger("Best Value"));

    await waitFor(() => {
      const cells = screen.getAllByText(/Valdez|No Projection Guy/);
      const desktopOrder = cells.filter((el) => el.closest("tr")).map((el) => el.textContent);
      const valdezIndex = desktopOrder.findIndex((t) => t?.includes("Valdez"));
      const noProjIndex = desktopOrder.findIndex((t) => t?.includes("No Projection Guy"));
      expect(valdezIndex).toBeLessThan(noProjIndex);
      // Still visible, not dropped from the table.
      expect(noProjIndex).toBeGreaterThanOrEqual(0);
    });
  }, SLOW_RENDER_TIMEOUT_MS);
});
