/**
 * MlbNumerologyPage.render.test.tsx
 *
 * Render-level regression tests for /mlb/numerology.
 * These tests catch runtime crashes that TypeScript, unit tests, and build
 * checks miss — specifically broken imports, undefined component references,
 * and unsafe data access on real-shaped fixture data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="site-shell">{children}</div>,
}));

vi.mock("@/components/mlb/MlbPlayerHeadshot", () => ({
  default: ({ name }: { name: string }) => <img data-testid="headshot" alt={name} />,
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

// ── Fixture data ───────────────────────────────────────────────────────────────

const DAILY_PROFILE = {
  universalDayRawSum: 24,
  universalDayCompound: 24,
  universalDayMaster: null,
  universalDayRoot: 6,
  universalDayTrace: ["2", "0", "2", "6", "0", "6", "2", "6"],
  calendarDayCompound: 26,
  calendarDayRoot: 8,
  universalYear: 9,
  universalMonth: 6,
  structuralEcho: null,
  primaryFamily: [6, 24],
  secondaryFamily: [3, 12, 33],
  balancingComplement: [5],
  countercurrent: [7],
  repeatedDigits: [],
  interpretation: "Test interpretation",
};

const EXACT_PLAYER = {
  playerId: 12345,
  playerName: "Test Player A",
  team: "NYY",
  opponent: "BOS",
  opposingPitcher: "Test Pitcher",
  lineupStatus: "confirmed" as const,
  battingOrder: 3,
  jerseyNumber: 24,
  numerologyScore: 72,
  baseballScore: 65,
  finalScore: 68,
  matches: [{ field: "jersey", value: 24, label: "Jersey #24" }],
  candidateSource: "hr_model",
  recommendedMarket: "Home run",
  marketScore: null,
  hrScore: 78,
  recentActivity: null,
};

const ROOT_PLAYER = {
  ...EXACT_PLAYER,
  playerId: 67890,
  playerName: "Test Player B",
  jerseyNumber: 6,
  numerologyScore: 58,
  matches: [{ field: "jersey", value: 6, label: "Jersey #6" }],
};

const WATCHLIST_PLAYER = {
  rank: 1,
  playerName: "Watchlist Player",
  team: "LAD",
  opponent: "SF",
  lineupStatus: "unknown" as const,
  battingOrder: null,
  jerseyNumber: 24,
  recommendedMarket: "Home run",
  numerologyScore: 49,
  baseballScore: 68,
  finalScore: 49,
  primarySignal: "Personal Day root 6",
  missingData: [],
  summary: null,
};

const FULL_DATA = {
  date: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  timezone: "America/New_York",
  methodologyVersion: "3.1",
  scheduledFor: "09:36 ET",
  generatedAt: new Date().toISOString(),
  generationMode: "live" as const,
  narrativeSource: "fallback" as const,
  dataStatus: "confirmed" as const,
  dailyProfile: DAILY_PROFILE,
  exactNumberMatches: [EXACT_PLAYER],
  rootNumberMatches: [ROOT_PLAYER],
  featuredPlays: [],
  bestAvailable: [],
  watchlist: [WATCHLIST_PLAYER],
  countercurrents: [],
  scoringConfiguration: { weights: {}, methodologyVersion: "3.1", rankingBasis: "numerology", baseballContextOnly: false },
  sources: {},
  narrative: { closingObservation: null },
};

// ── Hook mock setup ───────────────────────────────────────────────────────────

function mockHook(overrides: Record<string, unknown> = {}) {
  vi.doMock("@/hooks/useMLBNumerology", () => ({
    useMLBNumerology: () => ({
      data: FULL_DATA,
      loading: false,
      error: null,
      isStale: false,
      ...overrides,
    }),
  }));
}

// Because vi.doMock is call-order sensitive, we use dynamic import inside tests
async function renderPage() {
  const { default: MlbNumerologyPage } = await import("@/pages/MlbNumerologyPage");
  return render(
    <MemoryRouter initialEntries={["/mlb/numerology"]}>
      <MlbNumerologyPage />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MlbNumerologyPage — render safety", () => {
  beforeEach(() => {
    vi.resetModules();
    // Mock hr-props-raw.json fetch (stats API)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ batters: [] }),
    });
  });

  it("renders without crashing with full production-shaped data", async () => {
    mockHook();
    const { container } = await renderPage();
    expect(container.firstChild).toBeTruthy();
    // No error boundary text
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
    expect(screen.queryByText(/page couldn't load/i)).toBeNull();
  });

  it("renders the page heading", async () => {
    mockHook();
    await renderPage();
    expect(screen.getByText("MLB Numerical Alignment")).toBeTruthy();
  });

  it("renders exact match section with player names", async () => {
    mockHook();
    await renderPage();
    expect(screen.getAllByText("Test Player A").length).toBeGreaterThan(0);
  });

  it("renders root match section", async () => {
    mockHook();
    await renderPage();
    expect(screen.getAllByText("Test Player B").length).toBeGreaterThan(0);
  });

  it("renders loading state without crashing", async () => {
    mockHook({ data: null, loading: true });
    const { container } = await renderPage();
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it("renders error state without crashing", async () => {
    mockHook({ data: null, loading: false, error: "HTTP 404" });
    const { container } = await renderPage();
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it("renders empty data without crashing", async () => {
    mockHook({
      data: {
        ...FULL_DATA,
        exactNumberMatches: [],
        rootNumberMatches: [],
        featuredPlays: [],
        bestAvailable: [],
        watchlist: [],
        countercurrents: [],
      },
      loading: false,
    });
    const { container } = await renderPage();
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it("renders with null/missing metrics on players without crashing", async () => {
    mockHook({
      data: {
        ...FULL_DATA,
        exactNumberMatches: [{
          ...EXACT_PLAYER,
          playerId: null,
          jerseyNumber: null,
          battingOrder: null,
          baseballScore: null,
          matches: [],
        }],
      },
    });
    const { container } = await renderPage();
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it("renders with no HR model matches without crashing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ batters: [] }),
    });
    mockHook();
    const { container } = await renderPage();
    expect(container.firstChild).toBeTruthy();
  });

  it("renders stale data banner when data is from a previous date", async () => {
    mockHook({
      data: { ...FULL_DATA, date: "2020-01-01" },
      isStale: true,
    });
    await renderPage();
    expect(screen.getByText(/previous analysis/i)).toBeTruthy();
  });

  it("does not render error boundary for null data", async () => {
    mockHook({ data: null, loading: false, error: null });
    const { container } = await renderPage();
    // Should show the 'not available' message, not a crash
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it("MlbPlayerHeadshot renders when playerId is a number", async () => {
    mockHook({
      data: {
        ...FULL_DATA,
        featuredPlays: [{
          rank: 1,
          playerId: 12345,
          playerName: "Featured Player",
          team: "NYY",
          opponent: "BOS",
          lineupStatus: "confirmed" as const,
          battingOrder: 3,
          jerseyNumber: 24,
          recommendedMarket: "Home run",
          odds: "+350",
          numerologyScore: 80,
          baseballScore: 70,
          finalScore: 75,
          formula: "N:80 B:70",
          confidence: "high" as const,
          positiveSignals: [],
          counterSignals: [],
          missingData: [],
          summary: null,
        }],
      },
    });
    await renderPage();
    const headshots = screen.queryAllByTestId("headshot");
    expect(headshots.length).toBeGreaterThan(0);
  });
});
