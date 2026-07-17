/**
 * Focused integration tests for the FreshnessStatus wiring on the public
 * Strikeout Props page. Mirrors the mocking pattern established in
 * MlbStrikeoutProps.sorting.test.tsx / MlbHrProps.freshness.test.tsx: the
 * hook is mocked directly (never the real useMlbPropsData), so `status`
 * here is a fixed fixture, not something re-derived from a mocked
 * dashboard -- the page must trust it as-is.
 *
 * This page has a SECOND, independent freshness-like signal
 * (`useMlbStrikeoutPropDetails`'s own loading/unavailable/stale state for
 * the per-row detail panel) that is intentionally left alone here --
 * every test below stubs it to a fixed "resolved, available" state so it
 * never interferes with the shared FreshnessStatus assertions.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";
import type { HrDashboardGame, PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

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
    useMlbStrikeoutPropDetails: () => ({ loading: false, fileUnavailable: false, detailsByKey: new Map(), detailsDate: "2026-07-16" }),
  };
});

function makeRow(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
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
    ...overrides,
  };
}

const rowWithLine = makeRow({
  pitcher: "Dean Kremer",
  gameKey: "BAL@CHC",
  kLine: 6.5,
  kOddsOver: "-110",
  kOddsUnder: "-110",
  projectedKs: 5.0,
  strikeoutMatchupScore: 62,
});

const rowNoLine = makeRow({
  rank: 2,
  pitcher: "No Market Pitcher",
  team: "SEA",
  opponent: "OAK",
  gameKey: "SEA@OAK",
  kLine: undefined,
  kOddsOver: undefined,
  kOddsUnder: undefined,
  strikeoutMatchupScore: 55,
});

const highScoreNoLineRow = makeRow({
  rank: 1,
  pitcher: "Top Ranked No Line",
  team: "NYY",
  opponent: "BOS",
  gameKey: "NYY@BOS",
  kLine: undefined,
  kOddsOver: undefined,
  kOddsUnder: undefined,
  strikeoutMatchupScore: 70,
});

// kLine === projectedKs -> zero edge, never clears the 0.4-strikeout Best Bets threshold.
const noEdgeRow = makeRow({
  pitcher: "No Edge Pitcher",
  gameKey: "BAL@CHC",
  kLine: 5.0,
  kOddsOver: "-110",
  kOddsUnder: "-110",
  projectedKs: 5.0,
});

const lowConfidenceRow = makeRow({
  rank: 3,
  pitcher: "Patrick Sandoval",
  team: "BOS",
  opponent: "CWS",
  gameKey: "BOS@CWS",
  pitcherKRate: null,
  pitcherWhiffRate: null,
  kLine: 4.5,
  kOddsOver: "+121",
  kOddsUnder: "-154",
  kOddsBook: "draftkings",
  projectedIP: null,
  projectedK9: null,
  projectedKs: null,
  workloadConfidenceGrade: "D",
  workloadConfidenceScore: 0.3,
  workloadFlags: ["NO_STARTS_AVAILABLE", "PITCHER_RECENT_K_RATE_MISSING"],
});

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

const dashboardFixture = { date: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z", games: [], pitchers: [], batters: [] };

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

function mockPropsData(options: { rows?: PitcherStrikeoutTeamRow[]; games?: HrDashboardGame[]; status: MlbDataStatus }) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: options.games ?? [],
      strikeoutDetailRows: options.rows ?? [],
      status: options.status,
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

describe("MlbStrikeoutProps — freshness status integration", () => {
  it("1. loading shared status appears before data controls", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("Loading MLB model data")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("2. loading does not show no-lines or no-value messaging", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    await renderPage();

    expect(screen.queryByText(/No line posted yet/)).toBeNull();
    expect(screen.queryByText(/No pitchers currently meet/)).toBeNull();
    expect(screen.queryByText("No pitchers match the current filters.")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("3. hardcoded live/current freshness wording is absent", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toMatch(/\blive\b/i);
    expect(container.textContent).not.toMatch(/active slate/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("4. current status renders above projection data", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector('[data-tone="positive"]');
    const table = container.querySelector("table");
    expect(statusEl).toBeInTheDocument();
    expect(table).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("5. current projection rows still render", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getAllByText("Dean Kremer").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("6. current rows with K lines still show lines and odds", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).getByText("6.5")).toBeInTheDocument();
    expect(within(mainTable).getByText(/O -110 · U -110/)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("7. current rows without lines show existing row-level unavailable treatment", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine, rowNoLine], status: CURRENT_STATUS });
    await renderPage();

    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).getByText("No line posted yet")).toBeInTheDocument();
    expect(within(mainTable).getByText("No Market Pitcher")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("8. current slate with projection rows but zero lines shows truthful page-local odds-pending messaging", async () => {
    vi.resetModules();
    mockPropsData({ rows: [highScoreNoLineRow], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("No line posted yet. Odds not yet available for this slate.")).toBeInTheDocument();
    expect(screen.getAllByText("Top Ranked No Line").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("9. odds-pending messaging does not say model data is unavailable", async () => {
    vi.resetModules();
    mockPropsData({ rows: [highScoreNoLineRow], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.queryByText("MLB model data unavailable")).toBeNull();
    expect(screen.queryByText(/model data.*unavailable/i)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("10. some rows with lines and some without do not trigger a blocking page message", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine, rowNoLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getByText("Current slate data")).toBeInTheDocument();
    expect(screen.queryByText("MLB model data unavailable")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("11. current slate with lines but zero qualifying value plays shows the existing model-specific empty state", async () => {
    vi.resetModules();
    // A zero-edge row (kLine === projectedKs) never clears the Best Bets
    // threshold on either side -- the existing (unchanged) KBestBetsSection
    // renders nothing at all in that case rather than a misleading banner;
    // the main table stays fully visible and functional regardless.
    mockPropsData({ rows: [noEdgeRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(screen.queryByText("Best K Prop Bets")).toBeNull();
    expect(screen.queryByText("No Over currently clears the value threshold.")).toBeNull();
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getAllByText("No Edge Pitcher").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("12. user filters producing zero rows remain distinct from no-games or data-unavailable states", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    const search = screen.getByPlaceholderText("Search pitcher, team, park");
    fireEvent.change(search, { target: { value: "Nonexistent Pitcher Name" } });

    expect(screen.getByText("No pitchers match the current filters.")).toBeInTheDocument();
    expect(screen.queryByText("No MLB games currently listed")).toBeNull();
    expect(screen.queryByText("MLB model data unavailable")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("13. low-confidence rows and messaging remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine, lowConfidenceRow], status: CURRENT_STATUS });
    await renderPage();

    const lowConfidenceHeading = screen.getByText("Low Confidence");
    const lowConfidenceSection = lowConfidenceHeading.closest("section") as HTMLElement;
    expect(within(lowConfidenceSection).getAllByText("Patrick Sandoval").length).toBeGreaterThan(0);
    expect(within(lowConfidenceSection).getAllByText(/Insufficient data/i).length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("14. recommendation-ineligible rows and explanations remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine, lowConfidenceRow], status: CURRENT_STATUS });
    await renderPage();

    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).queryByText("Patrick Sandoval")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("15. lineup-pending status renders while rows remain visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: LINEUP_PENDING_STATUS });
    await renderPage();

    expect(screen.getByText("1 of 2 listed batters are confirmed.")).toBeInTheDocument();
    expect(screen.getAllByText("Dean Kremer").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("16. stale-past status renders while rows remain visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.getAllByText("Dean Kremer").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("17. stale-future status renders while rows remain visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: STALE_FUTURE_STATUS });
    await renderPage();

    expect(screen.getByText("Showing a future MLB slate")).toBeInTheDocument();
    expect(screen.getAllByText("Dean Kremer").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("18. retained-data refresh error renders while projections and controls remain visible", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    expect(screen.getByText(/Unable to refresh MLB model data/)).toBeInTheDocument();
    expect(screen.getAllByText("Dean Kremer").length).toBeGreaterThan(0);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search pitcher, team, park")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("19. retained-data refresh error does not disable sorting or filters", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    const search = screen.getByPlaceholderText("Search pitcher, team, park");
    expect(search).not.toBeDisabled();

    const mostStrikeoutsButton = screen.getByRole("button", { name: "Most Strikeouts" });
    expect(mostStrikeoutsButton).not.toBeDisabled();
    fireEvent.click(mostStrikeoutsButton);
    expect(mostStrikeoutsButton).toHaveAttribute("aria-pressed", "true");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("20. initial blocking error hides tables and filters", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("Unable to load MLB model data")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("21. unavailable status hides tables and odds-specific empty messages", async () => {
    vi.resetModules();
    mockPropsData({ status: UNAVAILABLE_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("MLB model data unavailable")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(screen.queryByText(/No line posted yet/)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("22. waiting-for-slate displays nextRunAt.label", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    await renderPage();

    expect(screen.getByText("Next scheduled update: 1:00 PM ET.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("23. waiting-for-slate does not show duplicate no-K-props messaging", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    const { container } = await renderPage();

    expect(screen.queryByText("Data Not Available")).toBeNull();
    expect(screen.queryByText(/No pitchers match/)).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("24. no-games-scheduled shows the shared message only", async () => {
    vi.resetModules();
    mockPropsData({ status: NO_GAMES_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
    expect(screen.queryByText("Data Not Available")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("25. FreshnessStatus renders exactly once", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelectorAll("[data-tone]")).toHaveLength(1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("26. status appears before the first major filter/table region in DOM order", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector("[data-tone]");
    const searchInput = screen.getByPlaceholderText("Search pitcher, team, park");
    expect(statusEl).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("27. no raw ISO timestamp appears", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toContain("2026-07-16T09:32:34.452Z");
  }, SLOW_RENDER_TIMEOUT_MS);

  it('28. no "Live," "real-time," or "up to the minute" freshness wording appears', async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).not.toMatch(/real[- ]time/i);
    expect(text).not.toMatch(/up to the minute/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("29. page trusts mocked hook status rather than rederiving from row/date shape", async () => {
    vi.resetModules();
    // Deliberately mismatched: rowWithLine + dashboardFixture's today's date
    // would normally derive to "current", but the mocked status says
    // "stale". If the page re-derived status instead of trusting the
    // hook's `status`, this would render "Current slate data" instead.
    mockPropsData({ rows: [rowWithLine], status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.queryByText("Current slate data")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("30. page source does not import deriveMlbDataStatus", () => {
    const source = readFileSync("src/pages/MlbStrikeoutProps.tsx", "utf-8");
    expect(source).not.toContain("deriveMlbDataStatus");
  });

  it("31. existing default sorting is unchanged", async () => {
    vi.resetModules();
    const lowerScoreRow = makeRow({ rank: 2, pitcher: "Lower Score Pitcher", team: "SEA", opponent: "OAK", gameKey: "SEA@OAK", strikeoutMatchupScore: 40 });
    mockPropsData({ rows: [lowerScoreRow, rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const rows = container.querySelectorAll("table tbody tr");
    expect(rows[0].textContent).toContain("Dean Kremer");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("32. existing sort interaction is unchanged", async () => {
    vi.resetModules();
    const lowerScoreRow = makeRow({ rank: 2, pitcher: "Lower Score Pitcher", team: "SEA", opponent: "OAK", gameKey: "SEA@OAK", strikeoutMatchupScore: 40 });
    mockPropsData({ rows: [lowerScoreRow, rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const scoreHeader = screen.getAllByRole("button", { name: /K Score/ })[0];
    fireEvent.click(scoreHeader);

    const rows = container.querySelectorAll("table tbody tr");
    expect(rows[0].textContent).toContain("Lower Score Pitcher");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("33. existing model/value selection is unchanged", async () => {
    vi.resetModules();
    const highKsRow = makeRow({ rank: 2, pitcher: "High Ks Pitcher", team: "SEA", opponent: "OAK", gameKey: "SEA@OAK", projectedKs: 9.0, kLine: 8.8, kOddsOver: "-110", kOddsUnder: "-110" });
    mockPropsData({ rows: [rowWithLine, highKsRow], status: CURRENT_STATUS });
    const { container } = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Most Strikeouts" }));

    const rows = container.querySelectorAll("table tbody tr");
    expect(rows[0].textContent).toContain("High Ks Pitcher");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("34. existing projection differences (edge) are unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    // rowWithLine: projectedKs 5.0, kLine 6.5 -> -1.5 UNDER
    expect(screen.getAllByText("-1.5 UNDER").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("35. existing line and odds formatting is unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).getByText("6.5")).toBeInTheDocument();
    expect(within(mainTable).getByText(/O -110 · U -110/)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("36. existing recommendation eligibility behavior is unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine, lowConfidenceRow], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.queryByText("Low Confidence")).not.toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("37. existing low-confidence table behavior is unchanged (absent when every row is valid)", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.queryByText("Low Confidence")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("38. existing RelatedTools links remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    const relatedTools = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(relatedTools).getByRole("link", { name: "Game Matchups" })).toHaveAttribute("href", "/mlb");
    expect(within(relatedTools).getByRole("link", { name: "HR Props" })).toHaveAttribute("href", "/mlb/hr-props");
    expect(within(relatedTools).queryByRole("link", { name: "Strikeout Props" })).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("39. table overflow wrappers remain intact", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("40. no other page component is imported or modified for freshness migration", () => {
    const pagesDir = "src/pages";
    const migratedPages = ["MlbHrProps.tsx", "MlbStrikeoutProps.tsx", "MlbBatterVsPitcher.tsx"];
    const otherPageFiles = readdirSync(pagesDir).filter(
      (name) => name.endsWith(".tsx") && !name.includes(".test.") && !migratedPages.includes(name),
    );
    for (const file of otherPageFiles) {
      const source = readFileSync(`${pagesDir}/${file}`, "utf-8");
      // Matches the shared component's own import path/named import, not
      // unrelated identifiers that merely contain the substring (e.g. the
      // pre-existing PgaFreshnessStatusPanel).
      expect(source).not.toContain("@/components/mlb/FreshnessStatus");
      expect(source).not.toMatch(/\bFreshnessStatus\b/);
    }
  });
});

const NO_PROJECTION_ROWS_MESSAGE = "Strikeout model data is available, but no pitcher projection rows are currently listed for this slate.";

describe("MlbStrikeoutProps — zero-projection-rows page-local message", () => {
  it("41. current status + zero rows: shows current status, the zero-projection message, and no table/filters", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(screen.getByText("Current slate data")).toBeInTheDocument();
    expect(screen.getByText(NO_PROJECTION_ROWS_MESSAGE)).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("42. lineup-pending status + zero rows: shows lineup status and the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: LINEUP_PENDING_STATUS });
    await renderPage();

    expect(screen.getByText("Lineups still updating")).toBeInTheDocument();
    expect(screen.getByText(NO_PROJECTION_ROWS_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("43. stale-past status + zero rows: shows stale status and the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.getByText(NO_PROJECTION_ROWS_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("44. retained-data refresh error + zero rows: shows the retained-data warning and the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    expect(screen.getByText(/Unable to refresh MLB model data/)).toBeInTheDocument();
    expect(screen.getByText(NO_PROJECTION_ROWS_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("45. waiting-for-slate + zero rows: does not show the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    await renderPage();

    expect(screen.getByText("Waiting for today’s slate")).toBeInTheDocument();
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("46. no-games-scheduled + zero rows: does not show the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: NO_GAMES_STATUS });
    await renderPage();

    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("47. unavailable + zero rows: does not show the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: UNAVAILABLE_STATUS });
    await renderPage();

    expect(screen.getByText("MLB model data unavailable")).toBeInTheDocument();
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("48. blocking error (no retained data) + zero rows: does not show the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    await renderPage();

    expect(screen.getByText("Unable to load MLB model data")).toBeInTheDocument();
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("49. loading: does not show the zero-projection message", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    await renderPage();

    expect(screen.getByText("Loading MLB model data")).toBeInTheDocument();
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("50. projection rows exist but no sportsbook lines: existing odds-pending copy remains, zero-projection message absent", async () => {
    vi.resetModules();
    mockPropsData({ rows: [highScoreNoLineRow], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("No line posted yet. Odds not yet available for this slate.")).toBeInTheDocument();
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("51. projection rows exist but no qualifying value plays: zero-projection message absent", async () => {
    vi.resetModules();
    mockPropsData({ rows: [noEdgeRow], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getAllByText("No Edge Pitcher").length).toBeGreaterThan(0);
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("52. user filters produce zero visible rows: existing filtered message remains, zero-projection message absent", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    const search = screen.getByPlaceholderText("Search pitcher, team, park");
    fireEvent.change(search, { target: { value: "Nonexistent Pitcher Name" } });

    expect(screen.getByText("No pitchers match the current filters.")).toBeInTheDocument();
    expect(screen.queryByText(NO_PROJECTION_ROWS_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("MlbStrikeoutProps — ModelSummaryHeader timestamp de-duplication", () => {
  it("38. passes showUpdatedAt={false} to ModelSummaryHeader", () => {
    const source = readFileSync("src/pages/MlbStrikeoutProps.tsx", "utf-8");
    const modelSummaryHeaderCalls = source.match(/<ModelSummaryHeader\b[^]*?\/>/g) ?? [];
    expect(modelSummaryHeaderCalls.length).toBeGreaterThan(0);
    for (const call of modelSummaryHeaderCalls) {
      expect(call).toContain("showUpdatedAt={false}");
    }
  });

  it("39. current status no longer shows a duplicate 'Last updated' timestamp cell", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], status: CURRENT_STATUS });
    await renderPage();

    // FreshnessStatus owns the "Model updated ..." sentence for the current
    // state; ModelSummaryHeader's own "Last updated" cell must not also render.
    expect(screen.queryByText("Last updated")).toBeNull();
    expect(screen.getByText(/Model updated .+ ET\.$/)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("MlbStrikeoutProps — table width and Park Factors layout", () => {
  it("no longer uses a two-column park-sidebar/main-content grid", () => {
    const source = readFileSync("src/pages/MlbStrikeoutProps.tsx", "utf-8");
    expect(source).not.toContain("xl:grid-cols-[260px_minmax(0,1fr)]");
  });

  it("Park Factors still renders", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getAllByText("🏟️ Park Factors").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("Park Factors appears before the page filters/table, and FreshnessStatus appears before Park Factors", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector("[data-tone]");
    const parkSection = Array.from(container.querySelectorAll("section")).find((el) => el.querySelector(":scope > details"));
    const table = container.querySelector("table");

    expect(statusEl).toBeInTheDocument();
    expect(parkSection).toBeTruthy();
    expect(table).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(parkSection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(parkSection!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("main table retains an .overflow-x-auto wrapper", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("existing Park Factor value renders unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getAllByText("1.00").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("existing roof/weather info still renders inside Park Factors once expanded", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    await renderPage();

    fireEvent.click(screen.getByText("Show details"));

    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("78°").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("existing header columns and sticky rank/pitcher cells remain present", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(screen.getAllByRole("button", { name: /K Score/ }).length).toBeGreaterThan(0);
    expect(container.querySelector("th.sticky")).toBeInTheDocument();
    expect(container.querySelector("td.sticky")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("RelatedTools remains unchanged", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByRole("navigation", { name: "Related MLB tools" })).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("no page-level horizontal-overflow-hiding class was introduced on the main wrapper", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const main = container.querySelector("main");
    expect(main?.className).not.toMatch(/overflow-x-(hidden|scroll)/);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("Park Factors is not wrapped in a fixed-width sidebar column on mobile", async () => {
    vi.resetModules();
    mockPropsData({ rows: [rowWithLine], games: [baseGame], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const parkSection = Array.from(container.querySelectorAll("section")).find((el) => el.querySelector(":scope > details"));
    expect(parkSection?.className).not.toMatch(/w-\[\d+px\]/);
  }, SLOW_RENDER_TIMEOUT_MS);
});
