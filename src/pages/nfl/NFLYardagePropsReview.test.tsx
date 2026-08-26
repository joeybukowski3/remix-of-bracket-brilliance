import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFLYardagePropsReview from "./NFLYardagePropsReview";
import type { NflCurrentWeekProjectionArtifact, NflCurrentWeekPassingRow } from "@/lib/nfl/props/types/currentWeekProjection";
import type { NflYardageMarketArtifact } from "@/lib/nfl/props/review/yardageMarketJoin";

function passingRow(overrides: Partial<NflCurrentWeekPassingRow> = {}): NflCurrentWeekPassingRow {
  return {
    schemaVersion: "nfl-current-week-yardage-projection-v1",
    season: 2026,
    week: 1,
    gameId: "2026_01_NE_SEA",
    kickoff: "2026-09-07T17:00:00Z",
    playerId: "gsis:00-0039851",
    playerName: "Drake Maye",
    team: "ne",
    opponent: "sea",
    homeAway: "away",
    position: "QB",
    market: "passing",
    status: "projected",
    historyStatus: "normal",
    generatedAt: "2026-08-26T14:09:24.393Z",
    modelVersion: "v1",
    fallbackProvenance: "historicalVolume",
    roleSource: "historicalVolume",
    roleSourceUpdatedAt: null,
    depthRank: 1,
    starterFlag: true,
    roleConfidence: "inferred",
    projectedYards: 245.3,
    directModelPrediction: 245.3,
    estimatedRange: { estimatedLow: 190, estimatedHigh: 300, nominalLevel: 0.9, intervalVersion: "v1" },
    matchupScore: {
      schemaVersion: "nfl-yardage-matchup-score-v2",
      scoreVersion: "nfl-yardage-matchup-score-phase8-v1",
      referenceDistributionVersion: "nfl-yardage-matchup-reference-2022-2024-v1",
      season: 2026, week: 1, gameId: "2026_01_NE_SEA", playerId: "gsis:00-0039851", playerName: "Drake Maye",
      team: "ne", opponent: "sea", market: "passing", matchupScore: 72, opportunityScore: 60, environmentScore: 55,
      generatedAt: "2026-08-26T14:09:24.393Z",
      components: {
        opportunity: { score: 60, indicatorScores: {} }, opponent: { score: 55, indicatorScores: {} },
        gameEnvironment: { score: 50, indicatorScores: {} }, passingQuality: { score: 70, indicatorScores: {} },
      },
    },
    hardCaseFlags: { noHistory: false, limitedHistory: false, multiQbRoleUncertain: false, committeeRole: false, zeroTargetRisk: false, teamChanged: false, roleUncertain: false },
    featureSnapshot: {
      qbAttemptsPerGame: { seasonPrior: 34.5, last3: 33.2, priorSeason: null },
      yardsPerAttempt: { seasonPrior: 7.2, last3: 7.0, priorSeason: null },
      completionPct: { seasonPrior: 0.65, last3: 0.64, priorSeason: null },
      teamPassAttemptsPerGame: { seasonPrior: 36.1, last3: 35.4, priorSeason: null },
      teamDropbackRate: { seasonPrior: 0.6, last3: 0.59, priorSeason: null },
      earlyDownNeutralPassRate: { seasonPrior: 0.55, last3: 0.54, priorSeason: null },
      passRateOverExpected: { seasonPrior: 0.02, last3: 0.01, priorSeason: null },
      market: { spread: -2.5, total: 45, impliedTeamTotal: 23.75, isDome: false },
    },
    diagnostics: { starterResolution: "sourcedDepthChart", gamesStartedPriorThisSeason: 5, sourceAmbiguous: false },
    ...overrides,
  } as NflCurrentWeekPassingRow;
}

function projectionsArtifact(rows: NflCurrentWeekProjectionArtifact["rows"]): NflCurrentWeekProjectionArtifact {
  return {
    schemaVersion: "nfl-current-week-yardage-projection-v1",
    season: 2026,
    week: 1,
    generatedAt: "2026-08-26T14:09:24.393Z",
    generationMode: "currentWeek",
    temporalContract: "weekly-snapshot-v1",
    modelVersions: { passing: "v1", rushing: "v1", receiving: "v1" },
    scoreVersions: { scoreVersion: "v1", referenceDistributionVersion: "v1" },
    sourceVersions: { trainingSeasons: [2022, 2023, 2024, 2025], rosterSnapshotSeason: 2026, rosterSnapshotWeek: 1, marketSource: "unavailable" },
    depthChartSource: { available: true, stale: false, snapshotAt: "2026-08-25T00:00:00Z", ageHours: 1 },
    rows,
    qa: {} as never,
  };
}

function marketArtifact(): NflYardageMarketArtifact {
  return {
    generatedAt: "2026-08-26T14:09:24.393Z",
    schemaVersion: "nfl-yardage-market-v1",
    canonical: {
      passingYards: {
        "gsis:00-0039851": {
          playerId: "gsis:00-0039851", playerName: "Drake Maye", position: "QB", team: "ne", opponent: "sea",
          gameId: "2026_01_NE_SEA", week: 1, bookmaker: "draftkings", point: 228.5, over: "-112", under: "-112",
          booksAtPoint: 1, lastUpdate: "2026-08-26T13:28:24Z",
        },
      },
      rushingYards: {},
      receivingYards: {},
    },
  };
}

function emptyEpaArtifact() {
  return {
    _meta: { schemaVersion: "v1", generatedAt: "2026-08-26T00:00:00Z", source: "nflverse", notes: [] },
    schemaVersion: "v1", attribution: "nflverse / nflfastR", currentSeason: 2026, priorSeason: 2025, seasonsUsed: [2025],
    metricKeys: [], metricDirections: {}, displayDecimals: 3, windows: {}, provenance: null,
  };
}

function emptySuccessArtifact() {
  return {
    _meta: {
      schemaVersion: "v1", generatedAt: "2026-08-26T00:00:00Z", source: "RBSDM", attribution: "RBSDM / Ben Baldwin",
      endpoint: "https://rbsdm.com/stats", currentSeason: 2026, priorSeason: 2025, completedGameCounts: {}, notes: [],
    },
    periods: {},
  };
}

function emptyProductionAllowedArtifact() {
  return {
    _meta: { schemaVersion: "v1", generatedAt: "2026-08-26T00:00:00Z", source: "nflverse", season: 2025, notes: [] },
    schemaVersion: "nfl-matchup-production-allowed-v1", sourceSeason: 2025,
    marketPositions: { passing: ["QB"], rushing: ["ALL", "RB"], receiving: ["WR", "TE", "RB"] },
    teams: {}, coverage: {},
  };
}

function emptyTeamsArtifact() {
  return { teams: [{ abbr: "ne", nflverseAbbr: "NE" }, { abbr: "sea", nflverseAbbr: "SEA" }] };
}

function stubFetch(projections: NflCurrentWeekProjectionArtifact, market: NflYardageMarketArtifact) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("yardage-projections.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(projections) } as Response);
    if (url.includes("nfl-yardage-market.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(market) } as Response);
    if (url.includes("matchup-epa.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(emptyEpaArtifact()) } as Response);
    if (url.includes("matchup-success-rates.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(emptySuccessArtifact()) } as Response);
    if (url.includes("matchup-production-allowed.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(emptyProductionAllowedArtifact()) } as Response);
    if (url.includes("teams.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(emptyTeamsArtifact()) } as Response);
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/nfl/yardage-props-review"]}>
      <NFLYardagePropsReview />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("NFLYardagePropsReview", () => {
  it("renders the research notice", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();
    expect(
      screen.getByText(/sportsbook-relative performance has not yet been validated/i),
    ).toBeInTheDocument();
  });

  it("shows the passing candidate joined to its sportsbook line and raw difference", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/228\.5/).length).toBeGreaterThan(0);
    // projectedYards 245.3 - line 228.5 = +16.8
    expect(screen.getAllByText(/\+16\.8/).length).toBeGreaterThan(0);
  });

  it("shows a player with no matching sportsbook line as unavailable, never inferred", async () => {
    const unmatchedRow = passingRow({ playerId: "gsis:00-9999999", playerName: "No Line QB" });
    stubFetch(projectionsArtifact([unmatchedRow]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("No Line QB").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });

  it("renders an empty state when no candidates match the active market", async () => {
    stubFetch(projectionsArtifact([]), marketArtifact());
    renderPage();
    await waitFor(() => expect(screen.getByText(/no passing candidates match/i)).toBeInTheDocument());
  });

  it("switching to the Rushing tab shows rushing candidates instead of passing", async () => {
    const rushingRow = {
      ...passingRow(),
      market: "rushing",
      position: "RB",
      playerName: "Rhamondre Stevenson",
      playerId: "gsis:00-0037toa",
      projectedCarries: 15,
      projectedYardsPerCarry: 4.1,
      diagnostics: { gamesWithCarriesPriorThisSeason: 5, recentTeamTopCarryShareConcentration: 0.7 },
    };
    stubFetch(projectionsArtifact([passingRow(), rushingRow as never]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    expect(screen.queryByText("Rhamondre Stevenson")).not.toBeInTheDocument();

    const rushingTab = within(screen.getByRole("group", { name: "Market" })).getByRole("button", { name: "Rushing" });
    rushingTab.click();

    await waitFor(() => expect(screen.getAllByText("Rhamondre Stevenson").length).toBeGreaterThan(0));
    expect(screen.queryByText("Drake Maye")).not.toBeInTheDocument();
  });

  it("expanding a row shows the detail panel with market-specific components; collapsing hides it again", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));

    // Detail panel content is not rendered before expansion.
    expect(screen.queryByText("QB Attempts/Game")).not.toBeInTheDocument();

    const expandButtons = screen.getAllByRole("button", { name: /expand details for drake maye/i });
    expandButtons[0].click();

    await waitFor(() => expect(screen.getAllByText("QB Attempts/Game").length).toBeGreaterThan(0));
    // Market-specific passing fields render; rushing/receiving-only fields never appear for a passing row.
    expect(screen.getAllByText("YPA").length).toBeGreaterThan(0);
    expect(screen.queryByText("Shrunk YPC")).not.toBeInTheDocument();
    expect(screen.queryByText("Shrunk YPT")).not.toBeInTheDocument();
    // Sportsbook section reflects the joined line, not a re-fetch or recomputation.
    expect(screen.getAllByText("draftkings").length).toBeGreaterThan(0);

    const collapseButtons = screen.getAllByRole("button", { name: /collapse details for drake maye/i });
    collapseButtons[0].click();

    await waitFor(() => expect(screen.queryByText("QB Attempts/Game")).not.toBeInTheDocument());
  });

  it("shows the no-sportsbook-line message in the detail panel when no line is available", async () => {
    const unmatchedRow = passingRow({ playerId: "gsis:00-9999999", playerName: "No Line QB" });
    stubFetch(projectionsArtifact([unmatchedRow]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("No Line QB").length).toBeGreaterThan(0));
    const expandButtons = screen.getAllByRole("button", { name: /expand details for no line qb/i });
    expandButtons[0].click();

    await waitFor(() => expect(screen.getAllByText(/no approved sportsbook line available/i).length).toBeGreaterThan(0));
  });
});
