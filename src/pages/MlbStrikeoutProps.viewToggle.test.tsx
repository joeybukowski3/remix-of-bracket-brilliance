import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import type { KPlusEvArtifact } from "@/lib/mlb/kPlusEvSourceAdapter";

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

const scoreRow: PitcherStrikeoutTeamRow = {
  rank: 1,
  gameKey: "BAL@CHC",
  pitcher: "K Score Only Starter",
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
  workloadConfidenceGrade: "A",
};

const dashboardFixture = { date: "2026-07-09", generatedAt: "2026-07-09T12:00:00.000Z", games: [], pitchers: [], batters: [] };

const evArtifact: KPlusEvArtifact = {
  schemaVersion: 1,
  generatorVersion: "test",
  date: "2026-07-09",
  generatedAt: "2026-07-09T12:00:00.000Z",
  pitchers: [
    {
      pitcher: "Eligible EV Starter",
      team: "DET",
      opponent: "CLE",
      pitcherHand: "L",
      isHome: true,
      starterConfirmed: true,
      season: { strikeouts: 200, outs: 540, pitches: 2800, starts: 26 },
      last8: { strikeouts: 60, outs: 144, pitches: 850, starts: 8 },
      last4: { strikeouts: 30, outs: 72, pitches: 420, starts: 4 },
      home: { strikeouts: 100, outs: 270, starts: 13 },
      away: { strikeouts: 100, outs: 270, starts: 13 },
      opponentKRatio: 1.05,
      opponentKRatioSource: "LINEUP",
      opponentKRateVsHand: 0.24,
      leagueKRateVsHand: 0.228,
      kLine: 6.5,
      kOddsOverRaw: "-130",
      kOddsUnderRaw: "+105",
      kOddsBook: "fanduel",
    },
    {
      // No sportsbook line -> row.available === false -> must be excluded
      // from the +EV table (display filter only, not an eligibility-formula
      // change) and counted in the "excluded" summary.
      pitcher: "No Market EV Starter",
      team: "SEA",
      opponent: "HOU",
      pitcherHand: "R",
      isHome: false,
      starterConfirmed: true,
      season: { strikeouts: 180, outs: 510, pitches: 2600, starts: 24 },
      last8: { strikeouts: 50, outs: 138, pitches: 800, starts: 8 },
      last4: { strikeouts: 25, outs: 69, pitches: 400, starts: 4 },
      home: { strikeouts: 90, outs: 255, starts: 12 },
      away: { strikeouts: 90, outs: 255, starts: 12 },
      opponentKRatio: 1.0,
      opponentKRatioSource: "TEAM_FALLBACK",
      opponentKRateVsHand: 0.22,
      leagueKRateVsHand: 0.228,
      kLine: null,
      kOddsOverRaw: null,
      kOddsUnderRaw: null,
      kOddsBook: null,
    },
  ],
};

function mockPropsData() {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [],
      loading: false,
      strikeoutDetailRows: [scoreRow],
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
  }));
  vi.doMock("@/hooks/useMlbKPlusEv", () => ({
    useMlbKPlusEv: () => ({ loading: false, status: "valid", artifact: evArtifact }),
  }));
}

async function renderPage(initialEntry = "/mlb/strikeout-props") {
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MlbStrikeoutProps />
    </MemoryRouter>,
  );
}

// Matches the 15s convention used by other MlbStrikeoutProps/MlbHrProps test
// files (see e.g. MlbStrikeoutProps.sorting.test.tsx) -- full-page renders
// on this suite are slow enough under parallel test-file execution to flake
// against Vitest's 5000ms default.
const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbStrikeoutProps K Score / +EV view toggle", () => {
  it("defaults to K Score and shows only the K Score table region", async () => {
    vi.resetModules();
    mockPropsData();
    await renderPage();

    expect(screen.getByRole("tab", { name: "K Score" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "+EV" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getAllByText("K Score Only Starter").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-k-plus-ev-table]')).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("switches to the +EV table on click and shows only one primary table region at a time", async () => {
    vi.resetModules();
    mockPropsData();
    await renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "+EV" }));

    expect(screen.getByRole("tab", { name: "+EV" })).toHaveAttribute("aria-selected", "true");
    // K Score's filters/sort toolbar (unique to that region) is gone.
    expect(screen.queryByPlaceholderText("Search pitcher, team, park")).toBeNull();
    expect(document.querySelector('[data-k-plus-ev-table]')).not.toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("+EV mode only lists pitchers with a complete valuation, with an eligibility summary above the table", async () => {
    vi.resetModules();
    mockPropsData();
    await renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "+EV" }));

    expect(screen.getByText(/1 of 2 starters eligible for \+EV modeling/i)).toBeInTheDocument();
    expect(screen.getByText(/1 excluded due to insufficient season or split data/i)).toBeInTheDocument();
    expect(screen.getAllByText("Eligible EV Starter").length).toBeGreaterThan(0);
    expect(screen.queryByText("No Market EV Starter")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("opens directly into the +EV view when the URL has ?view=ev (deep link)", async () => {
    vi.resetModules();
    mockPropsData();
    await renderPage("/mlb/strikeout-props?view=ev");

    expect(screen.getByRole("tab", { name: "+EV" })).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector('[data-k-plus-ev-table]')).not.toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);
});
