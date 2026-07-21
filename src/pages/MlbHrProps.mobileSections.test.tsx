/**
 * MlbHrProps.mobileSections.test.tsx
 *
 * Focused tests for the second round of the mobile-first HR Props redesign:
 * collapsed-by-default Park Factors/Slate Note/How to Read/Top HR
 * Environments below the `lg` breakpoint, top-3-then-show-all Overdue
 * Batters/Biggest Mismatches, and incremental Batter View loading.
 * Follows the mocking pattern established in MlbHrProps.freshness.test.tsx:
 * useMlbPropsData is mocked directly so dashboard/bestBets are fixed
 * fixtures, never re-derived from a mocked fetch.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

const gameA: HrDashboardGame = {
  gameKey: "BAL@CHC", matchup: "BAL @ CHC", awayTeam: "BAL", homeTeam: "CHC",
  stadium: "Wrigley Field", roofType: "Open", temperature: 78, precipitation: 0,
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.0,
};
const gameB: HrDashboardGame = {
  gameKey: "NYY@BOS", matchup: "NYY @ BOS", awayTeam: "NYY", homeTeam: "BOS",
  stadium: "Yankee Stadium", roofType: "Open", temperature: 82, precipitation: 0,
  windSpeed: 8, windDirection: "SW", conditions: "Clear", parkFactor: 1.15,
};

const basePitcher: HrDashboardPitcher = {
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
    hrFBRatio: 10, pullRate: 40, xba: 0.26, kRate: 18, bbRate: 10, whiffRate: 24, last7HR: 1,
    last30HR: 3, opposingPitcherHrVs: 55, opposingPitcherHitsVs: 62, opposingPitcherKVs: 50,
    weatherBoost: 0, hrScore: 60, hrScoreRank: 1, angleTags: [],
    ...overrides,
  };
}

// 60 ordinary batters with strictly descending hrScore, so the default sort
// (hrScore desc) makes rank == index and "Batter 51"+ is unambiguously past
// the first page of 50.
// hrScore starts well above the Overdue/Mismatches insight-card threshold
// (58) and the fixed 65 used below, so these 60 rows never interleave with
// the insight-card fixtures in the main sorted list.
const paginationBatters = Array.from({ length: 60 }, (_, i) =>
  makeBatter({
    playerId: 100 + i,
    player: `Batter ${String(i + 1).padStart(2, "0")}`,
    hrScore: 200 - i,
    hrScoreRank: i + 1,
    last7HR: 5, // keep them out of the Overdue Batters insight card
  }),
);

const overdueBatters = Array.from({ length: 5 }, (_, i) =>
  makeBatter({
    playerId: 200 + i,
    player: `Overdue ${i + 1}`,
    hrScore: 65,
    last7HR: 0,
    barrelRate: 15,
    hardHitRate: 30,
  }),
);

const mismatchBatters = Array.from({ length: 5 }, (_, i) =>
  makeBatter({
    playerId: 300 + i,
    player: `Mismatch ${i + 1}`,
    hrScore: 65,
    opposingPitcherHrVs: 60,
    pitcherXera: 5.0,
    last7HR: 5,
  }),
);

const gameEnvironments = [
  { gameKey: "BAL@CHC", matchup: "BAL @ CHC", ballpark: "Wrigley Field", gameHrEnvironmentScore: 82, parkFactor: 1.0, weatherEffect: 1.2, starterVulnerability: 60, qualifyingHitterCount: 4, avgQualifyingHitterScore: 65 },
  { gameKey: "NYY@BOS", matchup: "NYY @ BOS", ballpark: "Yankee Stadium", gameHrEnvironmentScore: 71, parkFactor: 1.15, weatherEffect: 0.5, starterVulnerability: 55, qualifyingHitterCount: 3, avgQualifyingHitterScore: 60 },
];

const dashboardFixture = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
  games: [gameA, gameB],
  pitchers: [basePitcher],
  batters: [...paginationBatters, ...overdueBatters, ...mismatchBatters],
  gameEnvironments,
};

const bestBetsFixture = {
  date: "2026-07-16",
  bestBets: [],
  valueBets: [],
  longshots: [],
  slatePreview: {
    slateOverview:
      "This is a deliberately long slate note sentence written so it clearly wraps past a single line at narrow mobile widths, giving the collapsed preview something real to truncate before the reader clicks to expand it.",
    modelNote: "Model note text.",
  },
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

describe("Batter View incremental loading", () => {
  it("shows only the first 50 batters initially", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    expect(await screen.findByText("Batter 01")).toBeInTheDocument();
    expect(screen.getByText("Batter 50")).toBeInTheDocument();
    expect(screen.queryByText("Batter 51")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it('"Show 50 more" reveals the rest and then hides itself once every row is visible', async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findByText("Batter 01");
    const showMore = screen.getByRole("button", { name: "Show 50 more" });
    fireEvent.click(showMore);

    expect(screen.getByText("Batter 51")).toBeInTheDocument();
    expect(screen.getByText("Batter 60")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show 50 more" })).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not change ranking order -- rows stay sorted by HR Score after expanding", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    const { container } = await renderPage();

    await screen.findByText("Batter 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    const names = Array.from(container.querySelectorAll("table tbody tr td:nth-child(2)"))
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => !!text && text.startsWith("Batter"));
    const scores = names.map((name) => Number(name.replace("Batter ", "")));
    const sorted = [...scores].sort((a, b) => a - b); // ascending index == descending hrScore
    expect(scores).toEqual(sorted);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("resets the visible count back to 50 when the search filter materially changes", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    await screen.findByText("Batter 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(screen.getByText("Batter 60")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search batter, pitcher, or team"), { target: { value: "Batter" } });

    expect(screen.getByText("Batter 01")).toBeInTheDocument();
    expect(screen.queryByText("Batter 51")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 50 more" })).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Overdue Batters -- mobile top-3 with show-all toggle", () => {
  it("shows only the top 3 rows below lg, with a show-all control", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const heading = await screen.findByText("⏳ Overdue Batters");
    const card = within(heading.closest("div#overdue") as HTMLElement);
    expect(card.getByText("Overdue 1")).toBeInTheDocument();
    expect(card.getByText("Overdue 3")).toBeInTheDocument();
    expect(card.queryByText("Overdue 4")).not.toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Click to show all matches" }));
    expect(card.getByText("Overdue 4")).toBeInTheDocument();
    expect(card.getByText("Overdue 5")).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Show top 3" }));
    expect(card.queryByText("Overdue 4")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("preserves the compact stacked mobile layout (no table markup) below lg", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const heading = await screen.findByText("⏳ Overdue Batters");
    const overdueCard = heading.closest("div#overdue");
    expect(overdueCard?.querySelector("table")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Biggest Mismatches -- mobile top-3 with show-all toggle", () => {
  it("shows only the top 3 rows below lg, with a show-all control", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const heading = await screen.findByText("⚔️ Biggest Mismatches");
    const card = within(heading.closest("div#mismatches") as HTMLElement);
    expect(card.getByText("Mismatch 1")).toBeInTheDocument();
    expect(card.getByText("Mismatch 3")).toBeInTheDocument();
    expect(card.queryByText("Mismatch 4")).not.toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Click to show all matches" }));
    expect(card.getByText("Mismatch 4")).toBeInTheDocument();
    expect(card.getByText("Mismatch 5")).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Show top 3" }));
    expect(card.queryByText("Mismatch 4")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Park Factors -- collapsed top-row preview below lg", () => {
  it("shows only the first park in the compact preview below lg, expands with the required copy", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const heading = await screen.findByText("🏟️ Park Factors");
    const section = within(heading.closest("section") as HTMLElement);
    const expandButton = section.getByText("Click to expand");
    expect(expandButton).toBeInTheDocument();

    // Parks are sorted hitter-friendly-first, so Yankee Stadium (1.15) leads
    // Wrigley Field (1.0) -- the 1-row mobile preview shows only the leader.
    const compactGrid = screen.getByTestId("park-factors-compact-grid");
    expect(within(compactGrid).getByText("Yankee Stadium")).toBeInTheDocument();
    expect(within(compactGrid).queryByText("Wrigley Field")).not.toBeInTheDocument();

    fireEvent.click(expandButton);
    expect(section.getByText("Show less")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows every park in the compact preview at lg and above (desktop unchanged)", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const heading = await screen.findByText("🏟️ Park Factors");
    const section = within(heading.closest("section") as HTMLElement);
    const compactGrid = screen.getByTestId("park-factors-compact-grid");
    expect(within(compactGrid).getByText("Wrigley Field")).toBeInTheDocument();
    expect(within(compactGrid).getByText("Yankee Stadium")).toBeInTheDocument();
    expect(section.getByText("Show details")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Slate Note -- one-line preview below lg", () => {
  it("truncates to one line with a Click to expand control below lg, then shows the full note", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const noteLabel = await screen.findByText(/Slate note:/);
    const noteBlock = within(noteLabel.closest("div") as HTMLElement);
    const expandButton = noteBlock.getByRole("button", { name: "Click to expand" });
    expect(expandButton).toBeInTheDocument();

    fireEvent.click(expandButton);
    expect(noteBlock.getByText(/deliberately long slate note sentence/)).toBeInTheDocument();
    expect(noteBlock.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows the complete note with no expand control at lg and above", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const noteLabel = await screen.findByText(/Slate note:/);
    const noteBlock = within(noteLabel.closest("div") as HTMLElement);
    expect(noteBlock.getByText(/deliberately long slate note sentence/)).toBeInTheDocument();
    expect(noteBlock.queryByRole("button", { name: "Click to expand" })).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("How to Read This Page -- relocated, collapsed below lg", () => {
  it("renders after RelatedTools-adjacent content, at the bottom of the page", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const howToRead = await screen.findByText("How to read this page");
    const navHero = screen.getByTestId("nav-hero");
    expect(navHero.compareDocumentPosition(howToRead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const topHrEnvironments = screen.getByTestId("top-hr-environments-section");
    expect(topHrEnvironments.compareDocumentPosition(howToRead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it('shows the "Terminology and Model Explanation" subtitle', async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    expect(await screen.findByText("Terminology and Model Explanation")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("is collapsed by default below lg and expands on click", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const heading = await screen.findByText("How to read this page");
    const section = within(heading.closest("section") as HTMLElement);
    expect(section.queryByText(/Higher scores indicate stronger relative home-run matchups/)).not.toBeInTheDocument();

    fireEvent.click(section.getByRole("button", { name: "Click to expand" }));
    expect(section.getByText(/Higher scores indicate stronger relative home-run matchups/)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("is expanded by default at lg and above, with no collapse control", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const heading = await screen.findByText("How to read this page");
    const section = within(heading.closest("section") as HTMLElement);
    expect(section.getByText(/Higher scores indicate stronger relative home-run matchups/)).toBeInTheDocument();
    expect(section.queryByRole("button")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Top HR Environments -- relocated below Batter View, collapsed to top row below lg", () => {
  it("renders after the Batter View pagination control", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const batterCaption = await screen.findByText(/of \d+ batters/);
    const topHrEnvironments = screen.getByTestId("top-hr-environments-section");
    expect(batterCaption.compareDocumentPosition(topHrEnvironments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows only the top row below lg, with an expand control revealing the rest", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const section = within(await screen.findByTestId("top-hr-environments-section"));
    expect(section.getByText("BAL @ CHC")).toBeInTheDocument();
    expect(section.queryByText("NYY @ BOS")).not.toBeInTheDocument();

    fireEvent.click(section.getByRole("button", { name: "Click to expand" }));
    expect(section.getByText("NYY @ BOS")).toBeInTheDocument();

    fireEvent.click(section.getByRole("button", { name: "Show less" }));
    expect(section.queryByText("NYY @ BOS")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows every environment at lg and above with no collapse control", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData();
    await renderPage();

    const section = within(await screen.findByTestId("top-hr-environments-section"));
    expect(section.getByText("BAL @ CHC")).toBeInTheDocument();
    expect(section.getByText("NYY @ BOS")).toBeInTheDocument();
    expect(section.queryByRole("button")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});
