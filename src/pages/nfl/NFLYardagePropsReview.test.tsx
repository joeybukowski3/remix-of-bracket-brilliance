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

function yardageHistoryArtifact() {
  return {
    _meta: { generatedAt: "2026-08-26T00:00:00Z", source: "test", season: 2026, week: 1, notes: [] },
    schemaVersion: "nfl-yardage-history-v1",
    season: 2026,
    week: 1,
    players: {
      "gsis:00-0039851:passing": {
        playerId: "gsis:00-0039851",
        playerName: "Drake Maye",
        market: "passing",
        position: "QB",
        games: [
          {
            gameId: "2025_18_MIA_NE", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
            opponentAbbr: "mia", homeAway: "home", oppDefRank: 14, oppYdsAllowAvg: 230.3,
            stat: { completions: 14, attempts: 18, passingTds: 1, interceptions: 0 },
            actualYards: 191, gameScore: { result: "W", teamScore: 38, oppScore: 10 }, vegasLine: null,
          },
        ],
      },
    },
    teamDefense: {
      "sea:passing:QB": {
        team: "sea",
        market: "passing",
        position: "QB",
        games: [
          {
            gameId: "2025_18_ARI_SEA", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
            opponentPlayerId: "00-1", opponentPlayerName: "Test Opp QB", homeAway: "home",
            oppOffRank: 20, oppPlayerYpg: 210.4,
            stat: { completions: 22, attempts: 33, passingTds: 1, interceptions: 1 },
            yardsAllowed: 245, gameScore: { result: "L", teamScore: 17, oppScore: 24 }, vegasLine: null,
          },
        ],
      },
    },
  };
}

function stubFetch(projections: NflCurrentWeekProjectionArtifact, market: NflYardageMarketArtifact) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("yardage-history.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(yardageHistoryArtifact()) } as Response);
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

  it("expanding a row shows Show the Work cards, the Diff/Edge equations, and the Last-10 history tables", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    const expandButtons = screen.getAllByRole("button", { name: /expand details for drake maye/i });
    expandButtons[0].click();

    await waitFor(() => expect(screen.getAllByText("Show the Work").length).toBeGreaterThan(0));
    expect(screen.getAllByText("1. Projected Yards").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2. Sportsbook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3. Diff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4. Matchup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8. Team Edge").length).toBeGreaterThan(0);
    // Diff literal equation: 245.3 - 228.5 = +16.8
    expect(screen.getAllByText(/245\.3.*228\.5/).length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.getAllByText("Player Last 10").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SEA Defense — Last 1 vs QB/).length).toBeGreaterThan(0);
  });

  it("clicking anywhere on the row body (not just the chevron) expands and collapses the detail panel", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    expect(screen.queryByText("QB Attempts/Game")).not.toBeInTheDocument();

    // The player name cell is plain row content, not the chevron affordance.
    const nameCell = screen.getAllByText("Drake Maye")[0];
    nameCell.click();
    await waitFor(() => expect(screen.getAllByText("QB Attempts/Game").length).toBeGreaterThan(0));

    nameCell.click();
    await waitFor(() => expect(screen.queryByText("QB Attempts/Game")).not.toBeInTheDocument());
  });

  it("a click on the (decorative) chevron toggles the row exactly once, never twice", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    const { container } = renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    const chevronButton = container.querySelector('tr[role="button"] button[aria-hidden="true"]') as HTMLButtonElement;
    expect(chevronButton).toBeTruthy();

    chevronButton.click();
    // A single toggle expands the panel -- if the row-level click handler also fired (double toggle), it would still be collapsed.
    await waitFor(() => expect(screen.getAllByText("QB Attempts/Game").length).toBeGreaterThan(0));
  });

  it("the three detail subsections default expanded and collapse/expand independently, without discarding loaded history", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();

    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
    // Default state: all three subsections expanded.
    expect(screen.getAllByText("1. Projected Yards").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SEA Defense — Last 1 vs QB/).length).toBeGreaterThan(0);

    // Collapsing "Show the Work" hides only its own content.
    const showWorkHeader = screen.getAllByRole("button", { name: "Show the Work" })[0];
    showWorkHeader.click();
    await waitFor(() => expect(screen.queryByText("1. Projected Yards")).not.toBeInTheDocument());
    expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SEA Defense — Last 1 vs QB/).length).toBeGreaterThan(0);

    // Collapsing "Player Last 10" leaves "Opponent Last 10" (and the still-collapsed Show the Work) alone.
    const playerLast10Header = screen.getAllByRole("button", { name: "Player Last 10" })[0];
    playerLast10Header.click();
    await waitFor(() => expect(screen.queryByText(/Drake Maye — Last 1 Games/)).not.toBeInTheDocument());
    expect(screen.getAllByText(/SEA Defense — Last 1 vs QB/).length).toBeGreaterThan(0);
    expect(screen.queryByText("1. Projected Yards")).not.toBeInTheDocument();

    // Re-expanding "Show the Work" shows its content again -- the underlying data was never discarded by collapsing.
    showWorkHeader.click();
    await waitFor(() => expect(screen.getAllByText("1. Projected Yards").length).toBeGreaterThan(0));
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

  it("shows a fresh status chip for every source when every artifact was just generated", async () => {
    const now = new Date().toISOString();
    stubFetch(
      { ...projectionsArtifact([passingRow({ generatedAt: now })]), generatedAt: now, depthChartSource: { available: true, stale: false, snapshotAt: now, ageHours: 0 } },
      { ...marketArtifact(), generatedAt: now },
    );
    renderPage();

    const status = await screen.findByTestId("nfl-yardage-freshness-status");
    expect(within(status).getByText(/Projections fresh/i)).toBeInTheDocument();
    expect(within(status).getByText(/Depth chart fresh/i)).toBeInTheDocument();
    expect(within(status).getByText(/Sportsbook fresh/i)).toBeInTheDocument();
    expect(screen.queryByTestId("nfl-yardage-freshness-warning")).not.toBeInTheDocument();
  });

  it("shows a stale warning when the projection artifact is far older than its freshness budget", async () => {
    const ancient = "2020-01-01T00:00:00.000Z";
    stubFetch(
      { ...projectionsArtifact([passingRow({ generatedAt: ancient })]), generatedAt: ancient },
      marketArtifact(),
    );
    renderPage();

    const status = await screen.findByTestId("nfl-yardage-freshness-status");
    expect(within(status).getByText(/Projections stale/i)).toBeInTheDocument();
    const warning = await screen.findByTestId("nfl-yardage-freshness-warning");
    expect(warning).toHaveTextContent(/Projections/);
    expect(warning).toHaveTextContent(/stale for this preview/i);
  });
});
