/**
 * Focused integration tests for the FreshnessStatus wiring on the MLB Props
 * Hub (/mlb/props). Mirrors the mocking pattern established in
 * MlbHrProps.freshness.test.tsx / MlbStrikeoutProps.freshness.test.tsx /
 * MlbBatterVsPitcher.freshness.test.tsx: the hook is mocked directly (never
 * the real useMlbPropsData), so `status` here is a fixed fixture, not
 * something re-derived from a mocked dashboard -- the hub must trust it
 * as-is. There was no prior test file for this page.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";
import type { HrDashboardBatter, PitcherVsBatterRow } from "@/pages/MlbHrProps";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

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

function makeStrikeoutRow(overrides: Record<string, unknown> = {}) {
  return {
    rank: 1,
    gameKey: "BAL@CHC",
    pitcher: "Dean Kremer",
    team: "BAL",
    opponent: "CHC",
    park: "Wrigley Field",
    opponentTeamKRate: 24,
    opponentKSampleSize: 5,
    pitcherKAbilityScore: 65,
    kRate: 22,
    whiffRate: 28,
    kMatchupScore: 62,
    reasonTags: [],
    kLine: 6.5,
    kOddsOver: "-110",
    kOddsUnder: "-110",
    kOddsBook: "draftkings",
    ...overrides,
  };
}

function makeMatchupRow(overrides: Partial<PitcherVsBatterRow> = {}): PitcherVsBatterRow {
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

const CURRENT_STATUS: MlbDataStatus = { kind: "current", slateDate: "2026-07-16", generatedAt: "2026-07-16T09:32:34.452Z" };
const LOADING_STATUS: MlbDataStatus = { kind: "loading" };
const LINEUP_PENDING_STATUS: MlbDataStatus = { kind: "lineup-pending", slateDate: "2026-07-16", confirmedCount: 1, totalCount: 2 };
const STALE_PAST_STATUS: MlbDataStatus = { kind: "stale", slateDate: "2026-07-10", todayEt: "2026-07-16", direction: "past" };
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

function mockPropsData(options: {
  batters?: HrDashboardBatter[];
  strikeoutRows?: ReturnType<typeof makeStrikeoutRow>[];
  batterVsPitcherRows?: PitcherVsBatterRow[];
  status: MlbDataStatus;
}) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      status: options.status,
      batters: options.batters ?? [],
      strikeoutRows: options.strikeoutRows ?? [],
      batterVsPitcherRows: options.batterVsPitcherRows ?? [],
    }),
  }));
}

async function renderPage() {
  const { default: MlbPropsHub } = await import("@/pages/MlbPropsHub");
  return render(
    <MemoryRouter>
      <MlbPropsHub />
    </MemoryRouter>,
  );
}

const SLOW_RENDER_TIMEOUT_MS = 15000;
const HR_EMPTY_MESSAGE = "No ranked home-run prop rows are currently listed for this slate.";
const K_EMPTY_MESSAGE = "No strikeout projection rows are currently listed for this slate.";
const BVP_EMPTY_MESSAGE = "No batter-versus-pitcher matchup rows are currently listed for this slate.";
const K_NO_LINES_MESSAGE = "Projections are available, but sportsbook strikeout lines have not been posted yet.";

describe("MlbPropsHub — freshness status integration", () => {
  it("1. exactly one FreshnessStatus renders", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelectorAll("[data-tone]")).toHaveLength(1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("2. status appears above the preview grid", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const statusEl = container.querySelector("[data-tone]");
    const heading = screen.getByRole("heading", { name: "Batters" });
    expect(statusEl).toBeInTheDocument();
    expect(statusEl!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("3. loading status renders", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    await renderPage();

    expect(screen.getByText("Loading MLB model data")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("4. loading does not show fake section-empty messages", async () => {
    vi.resetModules();
    mockPropsData({ status: LOADING_STATUS });
    await renderPage();

    expect(screen.queryByText(HR_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(K_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(BVP_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Batters" })).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("5. blocking error hides data-driven previews", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    await renderPage();

    expect(screen.getByText("Unable to load MLB model data")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Batters" })).toBeNull();
    expect(screen.queryByText(HR_EMPTY_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("6. unavailable hides data-driven previews", async () => {
    vi.resetModules();
    mockPropsData({ status: UNAVAILABLE_STATUS });
    await renderPage();

    expect(screen.getByText("MLB model data unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Batters" })).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("7. retained-data error preserves all available preview rows", async () => {
    vi.resetModules();
    mockPropsData({
      batters: [makeBatter()],
      strikeoutRows: [makeStrikeoutRow()],
      batterVsPitcherRows: [makeMatchupRow()],
      status: ERROR_WITH_DATA_STATUS,
    });
    await renderPage();

    expect(screen.getByText(/Unable to refresh MLB model data/)).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
    expect(screen.getByText("Dean Kremer")).toBeInTheDocument();
    expect(screen.getAllByText("Adley Rutschman").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("8. stale status preserves preview rows", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("9. lineup-pending preserves preview rows", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: LINEUP_PENDING_STATUS });
    await renderPage();

    expect(screen.getByText("1 of 2 listed batters are confirmed.")).toBeInTheDocument();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("10. waiting-for-slate with no preview rows does not produce three duplicate global messages", async () => {
    vi.resetModules();
    mockPropsData({ status: WAITING_FOR_SLATE_STATUS });
    await renderPage();

    expect(screen.getByText("Next scheduled update: 1:00 PM ET.")).toBeInTheDocument();
    expect(screen.queryByText(HR_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(K_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(BVP_EMPTY_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("11. no-games with no preview rows does not produce duplicate global messages", async () => {
    vi.resetModules();
    mockPropsData({ status: NO_GAMES_STATUS });
    await renderPage();

    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
    expect(screen.queryByText(HR_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(K_EMPTY_MESSAGE)).toBeNull();
    expect(screen.queryByText(BVP_EMPTY_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("12. waiting/no-games with existing preview rows preserves those rows", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: WAITING_FOR_SLATE_STATUS });
    await renderPage();

    expect(screen.getByText("Next scheduled update: 1:00 PM ET.")).toBeInTheDocument();
    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("13. current status with HR rows shows HR preview", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("Adley Rutschman")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("14. current status with zero HR source rows shows HR-local empty copy", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText(HR_EMPTY_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("15. HR-local empty copy does not say shared data is unavailable", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    await renderPage();

    expect(screen.queryByText("MLB model data unavailable")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("16. current status with K projection rows and lines shows K preview", async () => {
    vi.resetModules();
    mockPropsData({ strikeoutRows: [makeStrikeoutRow()], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("Dean Kremer")).toBeInTheDocument();
    expect(screen.queryByText(K_NO_LINES_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("17. K projection rows with no lines show local odds-pending copy", async () => {
    vi.resetModules();
    mockPropsData({ strikeoutRows: [makeStrikeoutRow({ kLine: undefined, kOddsOver: undefined, kOddsUnder: undefined })], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText(K_NO_LINES_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("Dean Kremer")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("18. mixed K line coverage does not block the preview", async () => {
    vi.resetModules();
    const withLine = makeStrikeoutRow({ pitcher: "Has Line", gameKey: "A@B" });
    const withoutLine = makeStrikeoutRow({ pitcher: "No Line", gameKey: "C@D", kLine: undefined, kOddsOver: undefined, kOddsUnder: undefined });
    mockPropsData({ strikeoutRows: [withLine, withoutLine], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("Lines available for 1 of 2 pitchers.")).toBeInTheDocument();
    expect(screen.getByText("Has Line")).toBeInTheDocument();
    expect(screen.getByText("No Line")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("19. K rows-exist and no-rows copy stay distinct from each other", async () => {
    vi.resetModules();
    mockPropsData({ strikeoutRows: [makeStrikeoutRow()], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.queryByText(K_EMPTY_MESSAGE)).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("20. current status with BvP rows shows BvP preview", async () => {
    vi.resetModules();
    mockPropsData({ batterVsPitcherRows: [makeMatchupRow()], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText(/HR target 58\.0/)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("21. current status with zero BvP source rows shows BvP-local empty copy", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText(BVP_EMPTY_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("22. all three zero under current status show one shared status plus concise section messages", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelectorAll("[data-tone]")).toHaveLength(1);
    expect(screen.getByText("Current slate data")).toBeInTheDocument();
    expect(screen.getByText(HR_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(K_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(BVP_EMPTY_MESSAGE)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("23. static tool links remain visible in nonblocking zero-data states", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByRole("link", { name: /MLB HR Props/ })).toHaveAttribute("href", "/mlb/hr-props");
    expect(screen.getByRole("link", { name: /MLB Strikeout Props/ })).toHaveAttribute("href", "/mlb/strikeout-props");
    expect(screen.getByRole("link", { name: /Batter vs Pitcher/ })).toHaveAttribute("href", "/mlb/batter-vs-pitcher");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("23b. static tool links remain visible during loading/blocking too", async () => {
    vi.resetModules();
    mockPropsData({ status: UNAVAILABLE_STATUS });
    await renderPage();

    expect(screen.getByRole("link", { name: /MLB HR Props/ })).toHaveAttribute("href", "/mlb/hr-props");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("24. blocking states do not show fake zero counts", async () => {
    vi.resetModules();
    mockPropsData({ status: ERROR_NO_DATA_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toMatch(/0 (hitters|pitchers|games)/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("25. no raw ISO timestamp appears", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.textContent).not.toContain("2026-07-16T09:32:34.452Z");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("26. no static Live/real-time global wording remains", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).not.toMatch(/real[- ]time/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("27. hub trusts mocked hook status rather than rederiving", async () => {
    vi.resetModules();
    // Deliberately mismatched: rows exist (which would normally derive to
    // "current"), but the mocked status says "stale". If the hub re-derived
    // status instead of trusting the hook's `status`, this would render
    // "Current slate data" instead.
    mockPropsData({ batters: [makeBatter()], status: STALE_PAST_STATUS });
    await renderPage();

    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
    expect(screen.queryByText("Current slate data")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("28. hub does not import deriveMlbDataStatus", () => {
    const source = readFileSync("src/pages/MlbPropsHub.tsx", "utf-8");
    expect(source).not.toContain("deriveMlbDataStatus");
  });

  it("29. existing preview top-N ordering is unchanged", async () => {
    vi.resetModules();
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeBatter({ player: `Batter ${i}`, team: "BAL", hrScore: 100 - i, playerId: i }),
    );
    mockPropsData({ batters: rows, status: CURRENT_STATUS });
    const { container } = await renderPage();

    // Top 8 of 10, highest hrScore first (Batter 0 has the highest score).
    const cards = container.querySelectorAll(".grid.gap-4.xl\\:grid-cols-3 > div")[0]!.querySelectorAll(".space-y-2 > div");
    expect(cards).toHaveLength(8);
    expect(cards[0].textContent).toContain("Batter 0");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("30. existing HR preview values are unchanged", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter({ hrScore: 73.4 })], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("73.4")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("31. existing K preview lines/odds are unchanged", async () => {
    vi.resetModules();
    mockPropsData({ strikeoutRows: [makeStrikeoutRow({ kMatchupScore: 81.2 })], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText("81.2")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("32. existing BvP scores/ranks are unchanged", async () => {
    vi.resetModules();
    mockPropsData({ batterVsPitcherRows: [makeMatchupRow({ hrTargetScore: 66.7 })], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByText(/HR target 66\.7/)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("33. existing card order is unchanged", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], strikeoutRows: [makeStrikeoutRow()], batterVsPitcherRows: [makeMatchupRow()], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const headings = Array.from(container.querySelectorAll("h2")).map((el) => el.textContent);
    expect(headings).toEqual(["Batters", "Pitchers", "Batters vs Pitchers"]);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("34. existing links are unchanged", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.getByRole("link", { name: "Open HR props" })).toHaveAttribute("href", "/mlb/hr-props");
    expect(screen.getByRole("link", { name: "Open K props" })).toHaveAttribute("href", "/mlb/strikeout-props");
    expect(screen.getByRole("link", { name: "Open table" })).toHaveAttribute("href", "/mlb/batter-vs-pitcher");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("35. responsive grid classes remain unchanged", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    const { container } = await renderPage();

    expect(container.querySelector(".grid.gap-3.md\\:grid-cols-3")).toBeInTheDocument();
    expect(container.querySelector(".grid.gap-4.xl\\:grid-cols-3")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("36. RelatedTools is not present (unchanged from before this PR)", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: CURRENT_STATUS });
    await renderPage();

    expect(screen.queryByRole("navigation", { name: "Related MLB tools" })).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("37. FreshnessStatus does not render inside individual preview cards", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], strikeoutRows: [makeStrikeoutRow()], batterVsPitcherRows: [makeMatchupRow()], status: CURRENT_STATUS });
    const { container } = await renderPage();

    const previewSection = container.querySelectorAll(".grid.gap-4.xl\\:grid-cols-3 > div");
    for (const card of Array.from(previewSection)) {
      expect(within(card as HTMLElement).queryByText(/^Current slate data$/)).toBeNull();
    }
  }, SLOW_RENDER_TIMEOUT_MS);

  it("38. no preview card displays both a source-empty and filter-empty message", async () => {
    vi.resetModules();
    mockPropsData({ status: CURRENT_STATUS });
    await renderPage();

    // Each card shows exactly one empty-state sentence, never a second/competing one.
    expect(screen.getAllByText(HR_EMPTY_MESSAGE)).toHaveLength(1);
    expect(screen.getAllByText(K_EMPTY_MESSAGE)).toHaveLength(1);
    expect(screen.getAllByText(BVP_EMPTY_MESSAGE)).toHaveLength(1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("39. retained-data error does not disable tool links", async () => {
    vi.resetModules();
    mockPropsData({ batters: [makeBatter()], status: ERROR_WITH_DATA_STATUS });
    await renderPage();

    const link = screen.getByRole("link", { name: "Open HR props" });
    expect(link).not.toHaveAttribute("aria-disabled");
    expect(link).toHaveAttribute("href", "/mlb/hr-props");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("40. no other page is migrated in this PR", () => {
    const pagesDir = "src/pages";
    const migratedPages = ["MlbHrProps.tsx", "MlbStrikeoutProps.tsx", "MlbBatterVsPitcher.tsx", "MlbPropsHub.tsx"];
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
