// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardGame, PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import type { KPropsV2ShadowArtifact, KPropsV2ShadowRow, KPropsV2ShadowState } from "@/hooks/useMlbKPropsV2Shadow";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/hooks/usePitcherRegression", () => ({ usePitcherRegression: () => ({ data: [], loading: false }) }));

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
  vi.resetModules();
  vi.clearAllMocks();
});

const game: HrDashboardGame = {
  gameKey: "TB@TOR",
  matchup: "TB @ TOR",
  awayTeam: "TB",
  homeTeam: "TOR",
  stadium: "Rogers Centre",
  roofType: "Dome",
  temperature: null,
  precipitation: null,
  windSpeed: null,
  windDirection: null,
  conditions: "Roof Closed",
  parkFactor: 1,
};

function makeRow(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "TB@TOR",
    gameId: 822785,
    pitcherId: 669456,
    pitcher: "Shane Bieber",
    team: "TOR",
    opponent: "TB",
    park: "Rogers Centre",
    parkFactor: 1,
    pitcherKRate: 17.6,
    pitcherWhiffRate: 26.3,
    pitcherKVs: 50,
    opponentTeamKRate: 18.9,
    opponentTeamWhiffRate: null,
    opponentTeamXba: null,
    pitcherKSkillScore: 50,
    opponentTeamStrikeoutScore: 50,
    strikeoutMatchupScore: 50,
    whyItRanksWell: "fixture",
    projectedIP: 4.7,
    projectedK9: 7.2,
    projectedKs: 3.8,
    kLine: 4.5,
    kOddsOver: "+121",
    kOddsUnder: "-155",
    kOddsBook: "draftkings",
    workloadRole: "starter",
    ...overrides,
  };
}

const shadowRow: KPropsV2ShadowRow = {
  key: "shane-bieber|tor|tb|2026-07-23",
  slateDate: "2026-07-23",
  game: { gameId: 822785, gameKey: "TB@TOR", gameDate: "2026-07-23T19:07:00Z", venue: "Rogers Centre", pitcherIsHome: true },
  pitcher: { id: 669456, name: "Shane Bieber", team: "TOR", opponent: "TB", handedness: "R" },
  market: { kLine: 4.5, oddsOver: "+121", oddsUnder: "-155", book: "draftkings", slateDate: "2026-07-23" },
  legacy: { projectedIP: 4.7, projectedK9: 7.2, projectedKs: 3.8, projectionSource: "legacy", projectionFallbackReason: "MODE_SHADOW_COMPARISON" },
  v2: {
    modelVersion: "mlb-k-projection-v2-shadow",
    projectedStrikeouts: 4,
    projectedKRate: 0.1768,
    projectedBattersFaced: 22.626,
    projectedInnings: 5.085,
    pitcherSkillRate: 0.1868,
    opponentEnvironmentRate: 0.1887,
    matchupAdjustment: -0.01,
    confidence: "high",
    components: [{ key: "pitcher.seasonSkillRate", label: "Pitcher season K skill", group: "pitcher", value: 0.177, weight: 0.44, normalizedWeight: 0.49, contribution: 0.087, source: "derived" }],
    fallbacks: [],
    warnings: [],
  },
  comparison: { v2MinusLegacyKs: 0.2, legacyEdgeToLine: -0.7, v2EdgeToLine: -0.5 },
  inputs: { details: { pitcherLastFiveSummary: { gamesUsed: 0, totalOuts: null, rows: [] }, opponentLastFiveVsStartersSummary: { gamesUsed: 0, rows: [] } } },
};

const artifact: KPropsV2ShadowArtifact = {
  schemaVersion: 1,
  slateDate: "2026-07-23",
  generatedAt: "2026-07-23T13:17:06.284Z",
  sourceDates: { "hr-props-raw.json": "2026-07-23" },
  modelVersion: "mlb-k-projection-v2-shadow",
  projectionMode: "shadow",
  rows: [shadowRow],
  diagnostics: { totalRows: 1, v2ComputedRows: 1, legacyOnlyRows: 0, warnings: ["mlb-odds.json has no trustworthy date field."] },
};

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: { date: "2026-07-23", generatedAt: "2026-07-23T13:00:00.000Z", games: [game], batters: [] },
      games: [game],
      strikeoutDetailRows: rows,
      status: { kind: "current", slateDate: "2026-07-23", generatedAt: "2026-07-23T13:00:00.000Z" },
    }),
  }));
}

function mockDetails(row: PitcherStrikeoutTeamRow) {
  const key = `${row.pitcher.toLowerCase().replace(/\s+/g, "-")}|${row.team.toLowerCase()}|${row.opponent.toLowerCase()}|2026-07-23`;
  vi.doMock("@/hooks/useMlbStrikeoutPropDetails", async () => {
    const actual = await vi.importActual<typeof import("@/hooks/useMlbStrikeoutPropDetails")>("@/hooks/useMlbStrikeoutPropDetails");
    return {
      ...actual,
      keyForStrikeoutPropRow: () => key,
      useMlbStrikeoutPropDetails: () => ({
        loading: false,
        fileUnavailable: false,
        detailsByKey: new Map([[key, { key, pitcher: row.pitcher, team: row.team, opponent: row.opponent, gameDate: "2026-07-23", pitcherLastFiveStarts: [], opponentLastFiveGames: [], generatedAt: "2026-07-23T13:00:00.000Z", source: "test" }]]),
        detailsDate: "2026-07-23",
      }),
    };
  });
}

function mockShadow(state: Partial<KPropsV2ShadowState>) {
  vi.doMock("@/hooks/useMlbKPropsV2Shadow", () => ({
    useMlbKPropsV2Shadow: (enabled: boolean): KPropsV2ShadowState => ({
      loading: false,
      enabled,
      status: enabled ? "valid" : "idle",
      artifact: enabled ? artifact : null,
      warnings: enabled ? ["mlb-odds.json has no trustworthy date field."] : [],
      diagnostics: { duplicateStableKeys: [], duplicateFallbackKeys: [] },
      findShadowRow: () => (enabled ? shadowRow : null),
      ...state,
    }),
  }));
}

async function renderPage(path: string) {
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MlbStrikeoutProps />
    </MemoryRouter>,
  );
}

describe("MlbStrikeoutProps V2 shadow UI gate", () => {
  it("keeps legacy projected Ks primary and hides V2 in normal public mode", async () => {
    stubMatchMedia(false);
    const publicRow = makeRow();
    mockPropsData([publicRow]);
    mockDetails(publicRow);
    mockShadow({});
    await renderPage("/mlb/strikeout-props");

    const main = within(document.querySelector('[data-x-export="mlb-strikeout-props"]') as HTMLElement);
    expect(main.getByText("3.8")).toBeInTheDocument();
    expect(main.queryByText(/V2 Shadow/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("k-v2-shadow-debug-status")).not.toBeInTheDocument();
  });

  it("shows shadow comparison only under ?debug=k-v2 with experimental labels and signed difference", async () => {
    stubMatchMedia(false);
    const publicRow = makeRow();
    mockPropsData([publicRow]);
    mockDetails(publicRow);
    mockShadow({});
    await renderPage("/mlb/strikeout-props?debug=k-v2");

    expect(await screen.findByTestId("k-v2-shadow-debug-status")).toBeInTheDocument();
    const comparison = screen.getByTestId("k-v2-shadow-row-comparison");
    expect(within(comparison).getByText("Legacy 3.8")).toBeInTheDocument();
    expect(within(comparison).getByText("V2 Shadow 4.0")).toBeInTheDocument();
    expect(within(comparison).getByText("Delta +0.2")).toBeInTheDocument();
    expect(within(comparison).getByText("Experimental")).toBeInTheDocument();
    expect(comparison.textContent).not.toMatch(/recommended|more accurate/i);
  });

  it("renders unmatched warning while preserving legacy row expansion", async () => {
    stubMatchMedia(true);
    const publicRow = makeRow();
    mockPropsData([publicRow]);
    mockDetails(publicRow);
    mockShadow({ findShadowRow: () => null });
    await renderPage("/mlb/strikeout-props?debug=k-v2");

    const rowButton = await screen.findByRole("button", { name: /Show recent strikeout details for Shane Bieber/ });
    expect(within(rowButton).getByText(/No unambiguous V2 shadow match/)).toBeInTheDocument();
    fireEvent.click(rowButton);
    expect(await screen.findByTestId("strikeout-prop-detail")).toBeInTheDocument();
  });
});
