import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import type { StrikeoutPropDetail } from "@/hooks/useMlbStrikeoutPropDetails";

// The page renders a desktop table (hidden below md) and a mobile card list
// (hidden at/above md) side by side in the DOM at the same time — jsdom does
// not evaluate CSS media queries, so both are present and queries that would
// normally match one element match two. Tests use getAllBy* and act on the
// first match (the desktop row) rather than assuming uniqueness.

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/components/mlb/MlbTeamLogo", () => ({ default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span> }));

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
  projectedKs: 5.1,
};

const secondRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 2,
  pitcher: "Zac Gallen",
  team: "AZ",
  opponent: "SD",
  gameKey: "AZ@SD",
};

const availableDetail: StrikeoutPropDetail = {
  key: "dean-kremer|bal|chc|2026-07-08",
  pitcher: "Dean Kremer",
  team: "BAL",
  opponent: "CHC",
  gameDate: "2026-07-08",
  pitcherLastFiveStarts: [
    { date: "2026-07-01", opponent: "CWS", inningsPitched: "6.0", strikeouts: 4 },
    { date: "2026-04-18", opponent: "CLE", inningsPitched: "6.0", strikeouts: 7 },
  ],
  opponentLastFiveGames: [
    { date: "2026-07-07", opponent: "BAL", opposingStartingPitcher: "Shane Baz", opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 3, teamTotalStrikeouts: 5 },
    { date: "2026-07-05", opponent: "STL", opposingStartingPitcher: "Matthew Liberatore", opposingStarterInningsPitched: "5.0", opposingStarterStrikeouts: 3, teamTotalStrikeouts: 7 },
  ],
  generatedAt: "2026-07-08T12:00:00.000Z",
  source: "mlb_stats_api",
};

const dashboardFixture = {
  date: "2026-07-08",
  generatedAt: "2026-07-08T12:00:00.000Z",
  games: [],
  pitchers: [],
  batters: [],
};

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [],
      loading: false,
      strikeoutDetailRows: rows,
    }),
  }));
}

function mockDetails(options: {
  detailsByKey?: Map<string, StrikeoutPropDetail>;
  loading?: boolean;
  fileUnavailable?: boolean;
  /** Defaults to the dashboard fixture's own date so existing tests are unaffected; pass a different date to simulate a stale details file. */
  detailsDate?: string | null;
}) {
  vi.doMock("@/hooks/useMlbStrikeoutPropDetails", async () => {
    const actual = await vi.importActual<typeof import("@/hooks/useMlbStrikeoutPropDetails")>("@/hooks/useMlbStrikeoutPropDetails");
    return {
      ...actual,
      useMlbStrikeoutPropDetails: () => ({
        loading: options.loading ?? false,
        fileUnavailable: options.fileUnavailable ?? false,
        detailsByKey: options.detailsByKey ?? new Map(),
        detailsDate: options.detailsDate === undefined ? dashboardFixture.date : options.detailsDate,
      }),
    };
  });
}

async function renderPage() {
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter>
      <MlbStrikeoutProps />
    </MemoryRouter>
  );
}

/** Desktop row trigger is rendered first in the DOM; act on that one consistently. */
function firstTrigger(name: string | RegExp) {
  return screen.getAllByRole("button", { name })[0];
}

// This suite renders the full page (park sidebar, best-bets section, both
// desktop/mobile layouts) under jsdom, which is measurably slower than a
// typical component test. Under the full repo test suite's parallel worker
// load these renders can occasionally exceed vitest's default 5000ms test
// timeout even though nothing is actually hanging (verified: every test
// here passes reliably in isolation and in smaller combined runs) -- so
// each test gets a generous explicit timeout rather than a flaky default.
const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbStrikeoutProps row-detail expansion", () => {
  it("renders the expanded detail panel with correct columns when detail data exists", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockDetails({ detailsByKey: new Map([[availableDetail.key, availableDetail]]) });
    await renderPage();

    const trigger = firstTrigger("Show recent strikeout details for Dean Kremer");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("strikeout-prop-detail")).toBeNull();

    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getAllByTestId("strikeout-prop-detail").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Dean Kremer — last 5 starts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CHC — last 5 games vs SP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shane Baz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6.0").length).toBeGreaterThan(0);

    expect(firstTrigger("Hide recent strikeout details for Dean Kremer")).toHaveAttribute("aria-expanded", "true");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows an unavailable state when the row has no detail data", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockDetails({ detailsByKey: new Map() }); // no entry for this row's key
    await renderPage();

    fireEvent.click(firstTrigger("Show recent strikeout details for Dean Kremer"));
    await waitFor(() => expect(screen.getAllByTestId("strikeout-prop-detail-unavailable").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/not available for Dean Kremer/i).length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows an unavailable state for every row when the details file itself is unavailable", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockDetails({ fileUnavailable: true });
    await renderPage();

    fireEvent.click(firstTrigger("Show recent strikeout details for Dean Kremer"));
    await waitFor(() => expect(screen.getAllByTestId("strikeout-prop-detail-unavailable").length).toBeGreaterThan(0));
  }, SLOW_RENDER_TIMEOUT_MS);

  it("only expands one row at a time (per layout)", async () => {
    vi.resetModules();
    // Only Kremer has detail data; Gallen intentionally has none, so
    // switching to Gallen proves both "only one row expands" (Kremer's
    // panel closes) and the unavailable-state path at once.
    mockPropsData([baseRow, secondRow]);
    mockDetails({ detailsByKey: new Map([[availableDetail.key, availableDetail]]) });
    await renderPage();

    fireEvent.click(firstTrigger("Show recent strikeout details for Dean Kremer"));
    await waitFor(() => expect(screen.getAllByTestId("strikeout-prop-detail").length).toBeGreaterThan(0));

    fireEvent.click(firstTrigger("Show recent strikeout details for Zac Gallen"));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Show recent strikeout details for Dean Kremer" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: "Hide recent strikeout details for Zac Gallen" }).length).toBeGreaterThan(0);
    });
    // Kremer's row collapsed (its detail panel is gone) once Gallen's row expanded.
    expect(screen.queryAllByTestId("strikeout-prop-detail").length).toBe(0);
    expect(screen.queryAllByText("Dean Kremer — last 5 starts").length).toBe(0);
    expect(screen.getAllByTestId("strikeout-prop-detail-unavailable").length).toBeGreaterThan(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("collapses the row when clicked again", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockDetails({ detailsByKey: new Map([[availableDetail.key, availableDetail]]) });
    await renderPage();

    fireEvent.click(firstTrigger("Show recent strikeout details for Dean Kremer"));
    await waitFor(() => expect(screen.getAllByTestId("strikeout-prop-detail").length).toBeGreaterThan(0));

    fireEvent.click(firstTrigger("Hide recent strikeout details for Dean Kremer"));
    await waitFor(() => expect(screen.queryAllByTestId("strikeout-prop-detail").length).toBe(0));
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows a global stale-data warning (not a per-pitcher unavailable message) when the details file's date doesn't match the current slate", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    // The details file loaded successfully and has real data for Kremer,
    // but it was generated for 2026-07-07 while the live slate (dashboardFixture)
    // is 2026-07-08 -- every row key will fail to match by date alone. This is
    // the exact bug reported from the Vercel preview: a stale committed file
    // masquerading as "no details for this pitcher" instead of a global staleness issue.
    mockDetails({ detailsByKey: new Map([[availableDetail.key, availableDetail]]), detailsDate: "2026-07-07" });
    await renderPage();

    // Global banner is visible immediately, before any row is expanded.
    expect(screen.getAllByTestId("strikeout-prop-details-stale-warning").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/out of date/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026-07-07/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026-07-08/).length).toBeGreaterThan(0);

    fireEvent.click(firstTrigger("Show recent strikeout details for Dean Kremer"));

    await waitFor(() => expect(screen.getAllByTestId("strikeout-prop-detail-stale").length).toBeGreaterThan(0));
    // Must NOT show the misleading per-pitcher "not available for Dean Kremer" message.
    expect(screen.queryAllByTestId("strikeout-prop-detail-unavailable").length).toBe(0);
    expect(screen.queryAllByText(/not available for Dean Kremer/i).length).toBe(0);
    // Must NOT render the real (mismatched-date) detail data either.
    expect(screen.queryAllByTestId("strikeout-prop-detail").length).toBe(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not show the stale warning when the details file's date matches the current slate", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockDetails({ detailsByKey: new Map([[availableDetail.key, availableDetail]]) }); // detailsDate defaults to dashboardFixture.date
    await renderPage();

    expect(screen.queryAllByTestId("strikeout-prop-details-stale-warning").length).toBe(0);

    fireEvent.click(firstTrigger("Show recent strikeout details for Dean Kremer"));
    await waitFor(() => expect(screen.getAllByTestId("strikeout-prop-detail").length).toBeGreaterThan(0));
    expect(screen.queryAllByTestId("strikeout-prop-detail-stale").length).toBe(0);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("preserves the base table layout and ranking columns", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    mockDetails({ detailsByKey: new Map() });
    await renderPage();

    expect(screen.getByText("MLB Strikeout Prop Model")).toBeTruthy();
    expect(screen.getAllByText("Dean Kremer").length).toBeGreaterThan(0);
    expect(screen.getByText(/pitchers shown/)).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);
});
