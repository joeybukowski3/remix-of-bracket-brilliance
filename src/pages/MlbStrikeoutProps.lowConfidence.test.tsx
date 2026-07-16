import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

// Same jsdom caveat as MlbStrikeoutProps.sorting.test.tsx: the page renders
// a desktop table and a mobile card list simultaneously, so single-match
// queries can match twice. Tests scope into the desktop table via `within`.

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
  pitcher: "Valid Pitcher",
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

// Jack Perkins audit regression: an incoherent two-sided market from an
// unranked/DFS book (+881 over / -100 under implies ~60.2% combined).
const perkinsRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 2,
  pitcher: "Jack Perkins",
  team: "ATH",
  opponent: "DET",
  gameKey: "ATH@DET",
  kLine: 2.5,
  kOddsOver: "+881",
  kOddsUnder: "-100",
  kOddsBook: "underdog",
  projectedIP: 8,
  projectedK9: 11.5,
  projectedKs: 10.2,
};

// Patrick Sandoval audit regression: no real workload data (grade D, zero
// K%/Whiff%) with a real market line still posted.
const sandovalRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
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
};

const dashboardFixture = { date: "2026-07-09", generatedAt: "2026-07-09T12:00:00.000Z", games: [], pitchers: [], batters: [] };

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [],
      loading: false,
      strikeoutDetailRows: rows,
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
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

describe("MlbStrikeoutProps Low Confidence table", () => {
  it("moves Jack Perkins (invalid odds) and Patrick Sandoval (insufficient data) out of the main table into Low Confidence", async () => {
    vi.resetModules();
    mockPropsData([baseRow, perkinsRow, sandovalRow]);
    await renderPage();

    const lowConfidenceHeading = screen.getByText("Low Confidence");
    const lowConfidenceSection = lowConfidenceHeading.closest("section");
    expect(lowConfidenceSection).not.toBeNull();

    // Perkins and Sandoval appear inside the Low Confidence section...
    expect(within(lowConfidenceSection as HTMLElement).getAllByText("Jack Perkins").length).toBeGreaterThan(0);
    expect(within(lowConfidenceSection as HTMLElement).getAllByText("Patrick Sandoval").length).toBeGreaterThan(0);

    // ...and the main table (rendered before the Low Confidence section)
    // shows the valid pitcher but not Perkins/Sandoval.
    const mainTable = screen.getAllByRole("table")[0];
    expect(within(mainTable).getAllByText("Valid Pitcher").length).toBeGreaterThan(0);
    expect(within(mainTable).queryByText("Jack Perkins")).toBeNull();
    expect(within(mainTable).queryByText("Patrick Sandoval")).toBeNull();
  });

  it("shows an exclusion reason badge for each Low Confidence row", async () => {
    vi.resetModules();
    mockPropsData([baseRow, perkinsRow, sandovalRow]);
    await renderPage();

    const lowConfidenceSection = screen.getByText("Low Confidence").closest("section") as HTMLElement;
    expect(within(lowConfidenceSection).getAllByText(/Invalid odds/i).length).toBeGreaterThan(0);
    expect(within(lowConfidenceSection).getAllByText(/Insufficient data/i).length).toBeGreaterThan(0);
  });

  it("shows N/A (not a fabricated number) for Sandoval's missing K%/Whiff%", async () => {
    vi.resetModules();
    mockPropsData([baseRow, sandovalRow]);
    await renderPage();

    const lowConfidenceSection = screen.getByText("Low Confidence").closest("section") as HTMLElement;
    const sandovalNameCells = within(lowConfidenceSection).getAllByText("Patrick Sandoval");
    const desktopRow = sandovalNameCells.map((el) => el.closest("tr")).find((tr) => tr);
    expect(desktopRow).toBeTruthy();
    // K%/Whiff% render as the DASH placeholder, not "0.0%".
    expect(within(desktopRow as HTMLElement).queryByText("0.0%")).toBeNull();
  });

  it("does not render a Low Confidence section at all when every row is VALID", async () => {
    vi.resetModules();
    mockPropsData([baseRow]);
    await renderPage();

    expect(screen.queryByText("Low Confidence")).toBeNull();
  });
});
