/**
 * Focused integration tests for the FreshnessStatus wiring on the public
 * Batter vs Pitcher page. Mirrors the mocking pattern established in
 * MlbHrProps.freshness.test.tsx / MlbStrikeoutProps.freshness.test.tsx: the
 * hook is mocked directly (never the real useMlbPropsData), so `status`
 * here is a fixed fixture, not something re-derived from a mocked
 * dashboard -- the page must trust it as-is.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";
import type { PitcherVsBatterRow } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/components/mlb/MlbTeamLogo", () => ({ default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span> }));

function makeRow(overrides: Partial<PitcherVsBatterRow> = {}): PitcherVsBatterRow {
  return {
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
    ...overrides,
  };
}

const baseRow = makeRow();
const secondRow = makeRow({ rank: 2, player: "Gunnar Henderson", team: "SEA", opposingPitcher: "Different Pitcher", gameKey: "SEA@OAK", bestMatchupScore: 40.2 });

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

const dashboardFixture = { date: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z", games: [], pitchers: [], batters: [] };

const CURRENT_STATUS: MlbDataStatus = { kind: "current", slateDate: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z" };
const LOADING_STATUS: MlbDataStatus = { kind: "loading" };
const LINEUP_PENDING_STATUS: MlbDataStatus = { kind: "lineup-pending", slateDate: "2026-07-16", confirmedCount: 1, totalCount: 2 };
const STALE_PAST_STATUS: MlbDataStatus = { kind: "stale", slateDate: "2026-07-10", todayEt: "2026-07-16", direction: "past" };
const STALE_FUTURE_STATUS: MlbDataStatus = { kind: "stale", slateDate: "2026-07-20", todayEt: "2026-07-16", direction: "future" };
const UNAVAILABLE_STATUS: MlbDataStatus = { kind: "unavailable" };
const ERROR_NO_DATA_STATUS: MlbDataStatus = { kind: "error", message: "HTTP 500", hasLastKnownData: false };
const ERROR_WITH_DATA_STATUS: MlbDataStatus = {
  kind: "error",
  message: "HTTP 500",
  hasLastKnownData: true,
  slateDate: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
};
const WAITING_FOR_SLATE_STATUS: MlbDataStatus = {
  kind: "waiting-for-slate",
  slateDate: "2026-07-16",
  nextRunAt: { time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" },
};
const NO_GAMES_STATUS: MlbDataStatus = { kind: "no-games-scheduled", slateDate: "2026-07-16" };

function mockPropsData(options: { rows?: PitcherVsBatterRow[]; games?: (typeof baseGame)[]; status: MlbDataStatus }) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: options.games ?? [baseGame],
      batterVsPitcherRows: options.rows ?? [],
      pitchers: [],
      status: options.status,
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

const NO_MATCHUP_ROWS_MESSAGE = "MLB model data is available, but no batter-versus-pitcher matchup rows are currently listed for this slate.";
const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbBatterVsPitcher — freshness status integration", () => {
  it("1. loading renders shared loading status", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    await renderPage();

    expect(screen.getByText("Loading MLB model data")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("2. loading hides filters and tables", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    const { container } = await renderPage();

    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.queryByText(/No batters match/)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("3. blocking error hides controls and table", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("Unable to load MLB model data")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("4. unavailable hides controls and table", async () => {
    vi.resetModules();
    mockPropsData({ status: UNAVAILABLE_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("MLB model data unavailable")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("5. current status renders above matchup rows", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector('[data-tone="positive"]');
    const table = container.querySelector("table");
    expect(statusEl).toBeInTheDocument();
    expect(table).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("6. current rows remain visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("7. lineup-pending status keeps rows visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: LINEUP_PENDING_STATUS });
    await renderPage();

    expect(screen.getByText("1 of 2 listed batters are confirmed.")).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("8. stale-past keeps rows visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("9. stale-future keeps rows visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: STALE_FUTURE_STATUS });
    await renderPage();

    expect(screen.getByText("Showing a future MLB slate")).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("10. retained-data error keeps rows and filters interactive", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    expect(screen.getByText(/Unable to refresh MLB model data/)).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
    const search = screen.getByPlaceholderText("Search batter, pitcher, park");
    expect(search).not.toBeDisabled();
    const sortButton = screen.getAllByRole("button", { name: /Matchup Score/ })[0];
    expect(sortButton).not.toBeDisabled();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("11. waiting-for-slate with no rows shows only shared status", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("Next scheduled update: 1:00 PM ET.")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(screen.queryByText(NO_MATCHUP_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("12. waiting-for-slate with rows preserves rows", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: WAITING_FOR_SLATE_STATUS });
    await renderPage();

    expect(screen.getByText("Next scheduled update: 1:00 PM ET.")).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("13. no-games with no rows shows only shared status", async () => {
    vi.resetModules();
    mockPropsData({ status: NO_GAMES_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(screen.queryByText(NO_MATCHUP_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("14. no-games with rows preserves rows", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: NO_GAMES_STATUS });
    await renderPage();

    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("15. current + zero BvP rows shows subordinate no-matchup-row message", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("Current slate data")).toBeInTheDocument();
    expect(screen.getByText(NO_MATCHUP_ROWS_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("16. lineup-pending + zero rows shows subordinate message", async () => {
    vi.resetModules();
    mockPropsData({ status: LINEUP_PENDING_STATUS });
    await renderPage();

    expect(screen.getByText("Lineups still updating")).toBeInTheDocument();
    expect(screen.getByText(NO_MATCHUP_ROWS_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("17. stale + zero rows shows subordinate message", async () => {
    vi.resetModules();
    mockPropsData({ status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.getByText(NO_MATCHUP_ROWS_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("18. retained-data error + zero rows shows subordinate message", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    expect(screen.getByText(/Unable to refresh MLB model data/)).toBeInTheDocument();
    expect(screen.getByText(NO_MATCHUP_ROWS_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("19a. blocking/unavailable does not show the subordinate message", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    await renderPage();

    expect(screen.queryByText(NO_MATCHUP_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("19b. waiting/no-games/loading do not show the subordinate message", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    await renderPage();
    expect(screen.queryByText(NO_MATCHUP_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("20. rows exist but filtered to zero shows existing filter message", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    await renderPage();

    const search = screen.getByPlaceholderText("Search batter, pitcher, park");
    fireEvent.change(search, { target: { value: "Nonexistent Player Name" } });

    expect(screen.getByText("No batters match the current filters.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("21. filtered-zero does not show the no-row message", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    await renderPage();

    const search = screen.getByPlaceholderText("Search batter, pitcher, park");
    fireEvent.change(search, { target: { value: "Nonexistent Player Name" } });

    expect(screen.queryByText(NO_MATCHUP_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("22. FreshnessStatus renders exactly once", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelectorAll("[data-tone]")).toHaveLength(1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("23. status appears before filters/table in DOM order", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector("[data-tone]");
    const searchInput = screen.getByPlaceholderText("Search batter, pitcher, park");
    expect(statusEl).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("24. no raw ISO timestamp appears", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toContain("2026-07-16T09:32:34.452Z");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("25. no static Live/real-time wording appears", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).not.toMatch(/real[- ]time/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("26. page trusts mocked hook status rather than rederiving from row/date shape", async () => {
    vi.resetModules();
    // Deliberately mismatched: rows + today's dashboard date would normally
    // derive to "current", but the mocked status says "stale". If the page
    // re-derived status instead of trusting the hook's `status`, this would
    // render "Current slate data" instead.
    mockPropsData({ rows: [baseRow], status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.queryByText("Current slate data")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("27. page does not import deriveMlbDataStatus", () => {
    const source = readFileSync("src/pages/MlbBatterVsPitcher.tsx", "utf-8");
    expect(source).not.toContain("deriveMlbDataStatus");
  });

  it("28. default sort remains unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [secondRow, baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    // Default sort is bestMatchupScore desc -- baseRow (61.5) before secondRow (40.2).
    const rows = container.querySelectorAll("table tbody tr");
    expect(rows[0].textContent).toContain("Adley Rutschman");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("29. sort interaction remains unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [secondRow, baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const matchupScoreHeader = screen.getAllByRole("button", { name: /Matchup Score/ })[0];
    fireEvent.click(matchupScoreHeader);

    const rows = container.querySelectorAll("table tbody tr");
    expect(rows[0].textContent).toContain("Gunnar Henderson");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("30. score/rank values remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow, secondRow], status: CURRENT_STATUS });
    await renderPage();

    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).getByText("61.5")).toBeInTheDocument();
    expect(within(mainTable).getByText("40.2")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("31. filters remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow, secondRow], status: CURRENT_STATUS });
    await renderPage();

    const teamFilter = screen.getByDisplayValue("All teams");
    fireEvent.change(teamFilter, { target: { value: "BAL" } });

    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Gunnar Henderson")).toHaveLength(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("32. mobile/table overflow wrappers remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("33. RelatedTools remains unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByRole("navigation", { name: "Related MLB tools" })).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("34. existing links remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [baseRow], status: CURRENT_STATUS });
    await renderPage();

    const relatedTools = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(relatedTools).getByRole("link", { name: "HR Props" })).toHaveAttribute("href", "/mlb/hr-props");
    expect(within(relatedTools).getByRole("link", { name: "Strikeout Props" })).toHaveAttribute("href", "/mlb/strikeout-props");
    expect(screen.getAllByRole("link", { name: "Back to MLB" })[0]).toHaveAttribute("href", "/mlb");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("no other page component is modified for this freshness migration", () => {
    const pagesDir = "src/pages";
    const migratedPages = ["MlbHrProps.tsx", "MlbStrikeoutProps.tsx", "MlbBatterVsPitcher.tsx"];
    const otherPageFiles = readdirSync(pagesDir).filter(
      (name) => name.endsWith(".tsx") && !name.includes(".test.") && !migratedPages.includes(name),
    );
    for (const file of otherPageFiles) {
      const source = readFileSync(`${pagesDir}/${file}`, "utf-8");
      expect(source).not.toContain("@/components/mlb/FreshnessStatus");
      expect(source).not.toMatch(/\bFreshnessStatus\b/);
    }
  });
});
