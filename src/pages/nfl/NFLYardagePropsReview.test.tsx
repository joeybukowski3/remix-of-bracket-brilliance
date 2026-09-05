import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
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
      "gsis:00-0037toa:rushing": {
        playerId: "gsis:00-0037toa",
        playerName: "Rhamondre Stevenson",
        market: "rushing",
        position: "RB",
        games: [
          {
            gameId: "2025_18_MIA_NE", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
            opponentAbbr: "mia", homeAway: "home", oppDefRank: 9, oppYdsAllowAvg: 98.1,
            stat: { rushAttempts: 18, rushTds: 1 },
            actualYards: 88, gameScore: { result: "W", teamScore: 38, oppScore: 10 }, vegasLine: null,
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
      "sea:rushing:RB": {
        team: "sea",
        market: "rushing",
        position: "RB",
        games: [
          {
            gameId: "2025_18_ARI_SEA", season: 2025, week: 18, dateUtc: "2026-01-04T21:25:00.000Z",
            opponentPlayerId: "00-2", opponentPlayerName: "Test Opp RB", homeAway: "home",
            oppOffRank: 12, oppPlayerYpg: 75.4,
            stat: { rushAttempts: 20, rushTds: 1 },
            yardsAllowed: 95, gameScore: { result: "L", teamScore: 17, oppScore: 24 }, vegasLine: null,
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

type MatchMediaStub = { matches: boolean; media: string; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };

/** Stubs `window.matchMedia` so the page's mobile-viewport default (Line filter = Available) can be exercised deterministically. */
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
    expect(screen.queryByText("Player Last 10")).not.toBeInTheDocument();

    const expandButtons = screen.getAllByRole("button", { name: /expand details for drake maye/i });
    expandButtons[0].click();

    // Player Last 10 is the default-active tab; Show the Work is collapsed inside Projection Details.
    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
    expect(screen.queryByText("QB Attempts/Game")).not.toBeInTheDocument();

    const projectionDetailsButtons = screen.getAllByRole("button", { name: "Projection Details" });
    projectionDetailsButtons[0].click();
    const showWorkButtons = await screen.findAllByRole("button", { name: "Show the Work" });
    showWorkButtons[0].click();

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

    // Player Last 10 renders immediately (default-active tab); Opponent Last 10 needs its tab selected.
    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/SEA Defense — Last 1 vs QB/)).not.toBeInTheDocument();

    const opponentTabs = screen.getAllByRole("tab", { name: "Opponent Last 10" });
    opponentTabs[0].click();
    await waitFor(() => expect(screen.getAllByText(/SEA Defense — Last 1 vs QB/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Drake Maye — Last 1 Games/)).not.toBeInTheDocument();

    // Show the Work lives collapsed inside "Projection Details" at the bottom, below Last 10.
    const projectionDetailsButtons = screen.getAllByRole("button", { name: "Projection Details" });
    projectionDetailsButtons[0].click();
    const showWorkButtons = await screen.findAllByRole("button", { name: "Show the Work" });
    showWorkButtons[0].click();

    await waitFor(() => expect(screen.getAllByText("1. Projected Yards").length).toBeGreaterThan(0));
    expect(screen.getAllByText("2. Sportsbook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3. Diff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4. Matchup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8. Team Edge").length).toBeGreaterThan(0);
    // Diff literal equation: 245.3 - 228.5 = +16.8
    expect(screen.getAllByText(/245\.3.*228\.5/).length).toBeGreaterThan(0);
  });

  it("clicking anywhere on the row body (not just the chevron) expands and collapses the detail panel", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    expect(screen.queryByText("Player Last 10")).not.toBeInTheDocument();

    // The player name cell is plain row content, not the chevron affordance.
    const nameCell = screen.getAllByText("Drake Maye")[0];
    nameCell.click();
    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));

    nameCell.click();
    await waitFor(() => expect(screen.queryByText(/Drake Maye — Last 1 Games/)).not.toBeInTheDocument());
  });

  it("a click on the (decorative) chevron toggles the row exactly once, never twice", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    const { container } = renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    const chevronButton = container.querySelector('tr[role="button"] button[aria-hidden="true"]') as HTMLButtonElement;
    expect(chevronButton).toBeTruthy();

    chevronButton.click();
    // A single toggle expands the panel -- if the row-level click handler also fired (double toggle), it would still be collapsed.
    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
  });

  it("Player Last 10 is the default tab and Opponent Last 10 shows only when its tab is selected", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();

    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/SEA Defense — Last 1 vs QB/)).not.toBeInTheDocument();

    const playerTab = screen.getAllByRole("tab", { name: "Player Last 10" })[0];
    const opponentTab = screen.getAllByRole("tab", { name: "Opponent Last 10" })[0];
    expect(playerTab).toHaveAttribute("aria-selected", "true");
    expect(opponentTab).toHaveAttribute("aria-selected", "false");

    opponentTab.click();
    await waitFor(() => expect(screen.getAllByText(/SEA Defense — Last 1 vs QB/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Drake Maye — Last 1 Games/)).not.toBeInTheDocument();
    expect(opponentTab).toHaveAttribute("aria-selected", "true");

    playerTab.click();
    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/SEA Defense — Last 1 vs QB/)).not.toBeInTheDocument();
  });

  it("Projection Details (Show the Work / Role & Provenance / Notes) is collapsed by default, below Last 10, and preserves every field when opened", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();
    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));

    // Collapsed by default -- none of its nested content renders until opened.
    expect(screen.queryByText("1. Projected Yards")).not.toBeInTheDocument();
    expect(screen.queryByText("Depth Rank")).not.toBeInTheDocument();
    const projectionDetailsButton = screen.getAllByRole("button", { name: "Projection Details" })[0];
    expect(projectionDetailsButton).toHaveAttribute("aria-expanded", "false");

    projectionDetailsButton.click();
    // Show the Work / Role & Provenance / Notes are themselves collapsed accordions inside Projection Details.
    const showWorkButtons = await screen.findAllByRole("button", { name: "Show the Work" });
    const roleButtons = screen.getAllByRole("button", { name: "Role / Provenance" });
    expect(showWorkButtons[0]).toHaveAttribute("aria-expanded", "false");
    expect(roleButtons[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("1. Projected Yards")).not.toBeInTheDocument();
    expect(screen.queryByText("Depth Rank")).not.toBeInTheDocument();

    // Every "Show the Work" field is preserved once opened.
    showWorkButtons[0].click();
    await waitFor(() => expect(screen.getAllByText("1. Projected Yards").length).toBeGreaterThan(0));
    expect(screen.getAllByText("8. Team Edge").length).toBeGreaterThan(0);

    // Every Role/Provenance field is preserved once opened.
    roleButtons[0].click();
    await waitFor(() => expect(screen.getAllByText("Depth Rank").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Role Confidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fallback Provenance").length).toBeGreaterThan(0);
  });

  it("shows the no-sportsbook-line message in the detail panel when no line is available", async () => {
    const unmatchedRow = passingRow({ playerId: "gsis:00-9999999", playerName: "No Line QB" });
    stubFetch(projectionsArtifact([unmatchedRow]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("No Line QB").length).toBeGreaterThan(0));
    const expandButtons = screen.getAllByRole("button", { name: /expand details for no line qb/i });
    expandButtons[0].click();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Projection Details" }).length).toBeGreaterThan(0));

    // Sportsbook detail lives inside the collapsed-by-default Projection Details > Show the Work accordion.
    screen.getAllByRole("button", { name: "Projection Details" })[0].click();
    const showWorkButtons = await screen.findAllByRole("button", { name: "Show the Work" });
    showWorkButtons[0].click();

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

describe("NFLYardagePropsReview mobile table", () => {
  function twoPlayerRows() {
    const maye = passingRow(); // Drake Maye, projectedYards 245.3, matchupScore 72
    const zappe = passingRow({
      playerId: "gsis:00-1111111",
      playerName: "Bailey Zappe",
      projectedYards: 200.0,
      matchupScore: { ...passingRow().matchupScore!, matchupScore: 40, playerId: "gsis:00-1111111", playerName: "Bailey Zappe" },
    });
    return [maye, zappe];
  }

  function twoPlayerMarket(): NflYardageMarketArtifact {
    const market = marketArtifact();
    return {
      ...market,
      canonical: {
        ...market.canonical,
        passingYards: {
          ...market.canonical.passingYards,
          "gsis:00-1111111": {
            playerId: "gsis:00-1111111", playerName: "Bailey Zappe", position: "QB", team: "ne", opponent: "sea",
            gameId: "2026_01_NE_SEA", week: 1, bookmaker: "draftkings", point: 210.0, over: "-110", under: "-110",
            booksAtPoint: 1, lastUpdate: "2026-08-26T13:28:24Z",
          },
        },
      },
    };
  }

  function mobileExpandButtons() {
    const table = screen.getByTestId("nfl-yardage-mobile-table");
    return within(table).getAllByRole("button", { name: /expand details for|collapse details for/i });
  }
  function mobileSortHeader(key: "player" | "matchupScore" | "projectedYards" | "line" | "difference") {
    return screen.getByTestId(`nfl-yardage-mobile-sort-${key}`);
  }

  it("renders a compact Player / Match / Proj / Line / Diff table with no card stack", async () => {
    stubFetch(projectionsArtifact(twoPlayerRows()), twoPlayerMarket());
    renderPage();

    const table = await screen.findByTestId("nfl-yardage-mobile-table");
    expect(within(mobileSortHeader("player")).getByRole("button", { name: /sort by player/i })).toBeInTheDocument();
    expect(within(mobileSortHeader("matchupScore")).getByRole("button", { name: /sort by match/i })).toBeInTheDocument();
    expect(within(mobileSortHeader("projectedYards")).getByRole("button", { name: /sort by proj/i })).toBeInTheDocument();
    expect(within(mobileSortHeader("line")).getByRole("button", { name: /sort by line/i })).toBeInTheDocument();
    expect(within(mobileSortHeader("difference")).getByRole("button", { name: /sort by diff/i })).toBeInTheDocument();

    // Default sort is highest projected yards first: Maye (245.3) before Zappe (200.0).
    const rows = mobileExpandButtons();
    expect(rows[0]).toHaveAccessibleName(/maye/i);
    expect(rows[1]).toHaveAccessibleName(/zappe/i);

    // Both fixture players are away at SEA -- opponent context renders beside the last name.
    expect(within(table).getAllByText(/@ SEA/i).length).toBeGreaterThan(0);
    // Matched sportsbook lines render plainly (no odds/book name) in the Line column.
    expect(within(table).getByText("228.5")).toBeInTheDocument();
    expect(within(table).getByText("210.0")).toBeInTheDocument();
    expect(within(table).queryByText(/-110/)).not.toBeInTheDocument();
    expect(within(table).queryByText(/draftkings/i)).not.toBeInTheDocument();
  });

  it("shows @ OPP for an away game and vs OPP for a home game, from the row's own homeAway field", async () => {
    const awayRow = passingRow(); // homeAway: "away", opponent: "sea"
    const homeRow = passingRow({
      playerId: "gsis:00-2222222",
      playerName: "Home Bird",
      homeAway: "home",
      opponent: "atl",
      matchupScore: { ...passingRow().matchupScore!, playerId: "gsis:00-2222222", playerName: "Home Bird" },
    });
    stubFetch(projectionsArtifact([awayRow, homeRow]), marketArtifact());
    renderPage();

    const table = await screen.findByTestId("nfl-yardage-mobile-table");
    expect(within(table).getByText(/@ SEA/i)).toBeInTheDocument();
    expect(within(table).getByText(/vs ATL/i)).toBeInTheDocument();
  });

  it("renders — in the Line column when no sportsbook line is matched (never a fabricated line)", async () => {
    const unmatchedRow = passingRow({ playerId: "gsis:00-9999999", playerName: "No Line QB" });
    stubFetch(projectionsArtifact([unmatchedRow]), marketArtifact());
    renderPage();

    const table = await screen.findByTestId("nfl-yardage-mobile-table");
    // Line and Diff both render "—" for an unmatched player -- two dashes in the mobile row.
    expect(within(table).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("sorts by Player, toggling direction on repeat clicks", async () => {
    stubFetch(projectionsArtifact(twoPlayerRows()), twoPlayerMarket());
    renderPage();

    await screen.findByTestId("nfl-yardage-mobile-table");
    const playerHeaderButton = within(mobileSortHeader("player")).getByRole("button", { name: /sort by player/i });

    playerHeaderButton.click();
    await waitFor(() => expect(mobileSortHeader("player")).toHaveAttribute("aria-sort", "ascending"));
    expect(mobileExpandButtons()[0]).toHaveAccessibleName(/zappe/i);

    playerHeaderButton.click();
    await waitFor(() => expect(mobileSortHeader("player")).toHaveAttribute("aria-sort", "descending"));
    expect(mobileExpandButtons()[0]).toHaveAccessibleName(/maye/i);
  });

  it("sorts by Match, Proj, and Diff (descending first, matching the shared desktop sort state)", async () => {
    stubFetch(projectionsArtifact(twoPlayerRows()), twoPlayerMarket());
    renderPage();

    await screen.findByTestId("nfl-yardage-mobile-table");

    within(mobileSortHeader("matchupScore")).getByRole("button", { name: /sort by match/i }).click();
    await waitFor(() => expect(mobileSortHeader("matchupScore")).toHaveAttribute("aria-sort", "descending"));
    // Maye's matchup score (72) is higher than Zappe's (40).
    expect(mobileExpandButtons()[0]).toHaveAccessibleName(/maye/i);

    within(mobileSortHeader("projectedYards")).getByRole("button", { name: /sort by proj/i }).click();
    await waitFor(() => expect(mobileSortHeader("projectedYards")).toHaveAttribute("aria-sort", "descending"));
    // Maye's projection (245.3) is higher than Zappe's (200.0).
    expect(mobileExpandButtons()[0]).toHaveAccessibleName(/maye/i);

    within(mobileSortHeader("difference")).getByRole("button", { name: /sort by diff/i }).click();
    await waitFor(() => expect(mobileSortHeader("difference")).toHaveAttribute("aria-sort", "descending"));
    // Maye's diff (245.3 - 228.5 = +16.8) is higher than Zappe's (200.0 - 210.0 = -10.0).
    expect(mobileExpandButtons()[0]).toHaveAccessibleName(/maye/i);
  });

  it("sorts by Line ascending and descending, with unmatched lines sorting last", async () => {
    stubFetch(projectionsArtifact(twoPlayerRows()), twoPlayerMarket());
    renderPage();

    await screen.findByTestId("nfl-yardage-mobile-table");
    const lineHeaderButton = within(mobileSortHeader("line")).getByRole("button", { name: /sort by line/i });

    // Descending is the default direction for a numeric key: Maye's line (228.5) is higher than Zappe's (210.0).
    lineHeaderButton.click();
    await waitFor(() => expect(mobileSortHeader("line")).toHaveAttribute("aria-sort", "descending"));
    expect(mobileExpandButtons()[0]).toHaveAccessibleName(/maye/i);

    lineHeaderButton.click();
    await waitFor(() => expect(mobileSortHeader("line")).toHaveAttribute("aria-sort", "ascending"));
    expect(mobileExpandButtons()[0]).toHaveAccessibleName(/zappe/i);
  });

  it("only one active sort key at a time", async () => {
    stubFetch(projectionsArtifact(twoPlayerRows()), twoPlayerMarket());
    renderPage();

    await screen.findByTestId("nfl-yardage-mobile-table");
    within(mobileSortHeader("projectedYards")).getByRole("button", { name: /sort by proj/i }).click();
    await waitFor(() => expect(mobileSortHeader("projectedYards")).toHaveAttribute("aria-sort", "descending"));

    within(mobileSortHeader("line")).getByRole("button", { name: /sort by line/i }).click();
    await waitFor(() => expect(mobileSortHeader("line")).toHaveAttribute("aria-sort", "descending"));
    expect(mobileSortHeader("projectedYards")).toHaveAttribute("aria-sort", "none");
  });

  it("tapping a mobile row expands it inline", async () => {
    stubFetch(projectionsArtifact(twoPlayerRows()), twoPlayerMarket());
    renderPage();

    await screen.findByTestId("nfl-yardage-mobile-table");
    expect(screen.queryByText(/Drake Maye — Last 1 Games/)).not.toBeInTheDocument();

    // Default sort (highest projection first) puts Maye (245.3, who has Last-10 history in the fixture) first.
    const mayeRow = mobileExpandButtons()[0];
    expect(mayeRow).toHaveAccessibleName(/maye/i);
    mayeRow.click();

    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
    const rowsAfterExpand = mobileExpandButtons();
    expect(rowsAfterExpand[0]).toHaveAttribute("aria-expanded", "true");

    mayeRow.click();
    await waitFor(() => expect(screen.queryByText(/Drake Maye — Last 1 Games/)).not.toBeInTheDocument());
  });

  it("mobile column order is Player, Proj, Line, Diff, Match", async () => {
    stubFetch(projectionsArtifact(twoPlayerRows()), twoPlayerMarket());
    renderPage();

    const table = await screen.findByTestId("nfl-yardage-mobile-table");
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Player", "Proj", "Line", "Diff", "Match"]);
  });
});

describe("NFLYardagePropsReview mobile Diff coloring", () => {
  function diffCells() {
    return screen.getAllByTestId("nfl-yardage-mobile-diff-cell");
  }

  it("positive diff renders bold and green", async () => {
    // 245.3 projected - 228.5 line = +16.8
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(diffCells().length).toBeGreaterThan(0));
    const cell = diffCells()[0];
    expect(cell).toHaveTextContent("+16.8");
    expect(cell.className).toContain("text-emerald-700");
    expect(cell.className).toContain("font-bold");
  });

  it("negative diff renders bold and red", async () => {
    // 245.3 projected - 260.0 line = -14.7
    const belowLineMarket: NflYardageMarketArtifact = {
      ...marketArtifact(),
      canonical: { ...marketArtifact().canonical, passingYards: { "gsis:00-0039851": { ...marketArtifact().canonical.passingYards["gsis:00-0039851"], point: 260.0 } } },
    };
    stubFetch(projectionsArtifact([passingRow()]), belowLineMarket);
    renderPage();

    await waitFor(() => expect(diffCells().length).toBeGreaterThan(0));
    const cell = diffCells()[0];
    expect(cell).toHaveTextContent("-14.7");
    expect(cell.className).toContain("text-rose-700");
    expect(cell.className).toContain("font-bold");
  });

  it("zero diff renders bold and gray, with no leading sign", async () => {
    // 245.3 projected - 245.3 line = 0.0
    const evenMarket: NflYardageMarketArtifact = {
      ...marketArtifact(),
      canonical: { ...marketArtifact().canonical, passingYards: { "gsis:00-0039851": { ...marketArtifact().canonical.passingYards["gsis:00-0039851"], point: 245.3 } } },
    };
    stubFetch(projectionsArtifact([passingRow()]), evenMarket);
    renderPage();

    await waitFor(() => expect(diffCells().length).toBeGreaterThan(0));
    const cell = diffCells()[0];
    expect(cell).toHaveTextContent("0.0");
    expect(cell).not.toHaveTextContent("+0.0");
    expect(cell.className).toContain("text-slate-500");
    expect(cell.className).toContain("font-bold");
  });

  it("unavailable diff renders bold and gray with a dash", async () => {
    const unmatchedRow = passingRow({ playerId: "gsis:00-9999999", playerName: "No Line QB" });
    stubFetch(projectionsArtifact([unmatchedRow]), marketArtifact());
    renderPage();

    await waitFor(() => expect(diffCells().length).toBeGreaterThan(0));
    const cell = diffCells()[0];
    expect(cell).toHaveTextContent("—");
    expect(cell.className).toContain("text-slate-500");
    expect(cell.className).toContain("font-bold");
  });
});

describe("NFLYardagePropsReview mobile prop-type row", () => {
  it("renders Passing/Rushing/Receiving as a dedicated row, separate from Week, and switches markets", async () => {
    const rushingRow = { ...passingRow(), market: "rushing", position: "RB", playerName: "Rhamondre Stevenson", playerId: "gsis:00-0037toa", projectedCarries: 15, projectedYardsPerCarry: 4.1, diagnostics: { gamesWithCarriesPriorThisSeason: 5, recentTeamTopCarryShareConcentration: 0.7 } };
    stubFetch(projectionsArtifact([passingRow(), rushingRow as never]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));

    const propTypeRow = screen.getByRole("group", { name: "Prop type" });
    const passingButton = within(propTypeRow).getByRole("button", { name: "Passing" });
    const rushingButton = within(propTypeRow).getByRole("button", { name: "Rushing" });
    const receivingButton = within(propTypeRow).getByRole("button", { name: "Receiving" });
    expect(passingButton).toHaveAttribute("aria-pressed", "true");
    expect(rushingButton).toHaveAttribute("aria-pressed", "false");
    expect(receivingButton).toHaveAttribute("aria-pressed", "false");

    // The Week control is a separate group, never merged into this row.
    expect(within(propTypeRow).queryByText(/week/i)).not.toBeInTheDocument();

    rushingButton.click();
    await waitFor(() => expect(screen.getAllByText("Rhamondre Stevenson").length).toBeGreaterThan(0));
    expect(screen.queryByText("Drake Maye")).not.toBeInTheDocument();
    expect(rushingButton).toHaveAttribute("aria-pressed", "true");
  });
});

describe("NFLYardagePropsReview mobile filter dropdowns", () => {
  it("renders Matchup/Position/Band/Line as select dropdowns and each one filters", async () => {
    const rbRow = { ...passingRow({ playerId: "gsis:00-0037toa", playerName: "Rhamondre Stevenson" }), position: "RB" };
    stubFetch(projectionsArtifact([passingRow(), rbRow as never]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getByRole("button", { name: /^Filters/ }).click();

    const matchupSelect = screen.getByTestId("nfl-yardage-mobile-filter-matchup") as HTMLSelectElement;
    const positionSelect = screen.getByTestId("nfl-yardage-mobile-filter-position") as HTMLSelectElement;
    const bandSelect = screen.getByTestId("nfl-yardage-mobile-filter-band") as HTMLSelectElement;
    const lineSelect = screen.getByTestId("nfl-yardage-mobile-filter-line") as HTMLSelectElement;
    expect(matchupSelect.tagName).toBe("SELECT");
    expect(positionSelect.tagName).toBe("SELECT");
    expect(bandSelect.tagName).toBe("SELECT");
    expect(lineSelect.tagName).toBe("SELECT");

    // Position dropdown filters down to the RB candidate only.
    fireEvent.change(positionSelect, { target: { value: "RB" } });
    await waitFor(() => expect(screen.queryByText("Drake Maye")).not.toBeInTheDocument());
    expect(screen.getAllByText("Rhamondre Stevenson").length).toBeGreaterThan(0);
    fireEvent.change(positionSelect, { target: { value: "all" } });
    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));

    // Matchup dropdown filters by gameId (both fixture rows share "2026_01_NE_SEA").
    expect(within(matchupSelect).getByText(/NE @ SEA|SEA @ NE/i)).toBeInTheDocument();

    // Band dropdown offers every band option.
    expect(within(bandSelect).getByText("All Bands")).toBeInTheDocument();
    expect(within(bandSelect).getByText("Elite")).toBeInTheDocument();

    // Line dropdown filters to unmatched-only, hiding both matched fixture rows.
    fireEvent.change(lineSelect, { target: { value: "unavailable" } });
    await waitFor(() => expect(screen.queryByText("Drake Maye")).not.toBeInTheDocument());
  });
});

describe("NFLYardagePropsReview mobile Line filter default", () => {
  it("defaults to Line Available on a mobile viewport, hiding unmatched candidates", async () => {
    stubMatchMedia(true);
    const unmatchedRow = passingRow({ playerId: "gsis:00-9999999", playerName: "No Line QB" });
    stubFetch(projectionsArtifact([passingRow(), unmatchedRow]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    expect(screen.queryByText("No Line QB")).not.toBeInTheDocument();

    screen.getByRole("button", { name: /^Filters/ }).click();
    const lineSelect = screen.getByTestId("nfl-yardage-mobile-filter-line") as HTMLSelectElement;
    expect(lineSelect.value).toBe("available");

    fireEvent.change(lineSelect, { target: { value: "all" } });
    await waitFor(() => expect(screen.getAllByText("No Line QB").length).toBeGreaterThan(0));

    fireEvent.change(lineSelect, { target: { value: "unavailable" } });
    await waitFor(() => expect(screen.queryByText("Drake Maye")).not.toBeInTheDocument());
    expect(screen.getAllByText("No Line QB").length).toBeGreaterThan(0);
  });

  it("defaults to All Lines on a desktop viewport (unchanged behavior)", async () => {
    stubMatchMedia(false);
    const unmatchedRow = passingRow({ playerId: "gsis:00-9999999", playerName: "No Line QB" });
    stubFetch(projectionsArtifact([passingRow(), unmatchedRow]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    expect(screen.getAllByText("No Line QB").length).toBeGreaterThan(0);
  });
});

describe("NFLYardagePropsReview content order", () => {
  it("keeps the freshness status near the top and moves the Projection preview notice to the bottom", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    const { container } = renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    const freshness = screen.getByTestId("nfl-yardage-freshness-status");
    const mobileTable = screen.getByTestId("nfl-yardage-mobile-table");
    const notice = screen.getByText(/Projection preview/i).closest("p") as HTMLElement;

    const position = freshness.compareDocumentPosition(notice);
    // freshness precedes notice
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tablePosition = mobileTable.compareDocumentPosition(notice);
    // table precedes notice
    expect(tablePosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeTruthy();
  });
});

describe("NFLYardagePropsReview default sort", () => {
  function twoRows() {
    const high = passingRow(); // Drake Maye, projectedYards 245.3
    const low = passingRow({
      playerId: "gsis:00-1111111",
      playerName: "Bailey Zappe",
      projectedYards: 200.0,
      matchupScore: null,
    });
    return [high, low];
  }

  it("initial sort is projectedYards descending -- highest projection shown first", async () => {
    stubFetch(projectionsArtifact(twoRows()), marketArtifact());
    renderPage();

    const header = await screen.findByTestId("nfl-yardage-mobile-sort-projectedYards");
    expect(header).toHaveAttribute("aria-sort", "descending");

    const table = screen.getByTestId("nfl-yardage-mobile-table");
    const rows = within(table).getAllByRole("button", { name: /expand details for/i });
    expect(rows[0]).toHaveAccessibleName(/maye/i); // 245.3 > 200.0
  });

  it("changing market resets sort back to projectedYards descending, even after a user picked a different column", async () => {
    const rushingRow = { ...passingRow(), market: "rushing", position: "RB", playerName: "Rhamondre Stevenson", playerId: "gsis:00-0037toa", projectedCarries: 15, projectedYardsPerCarry: 4.1, diagnostics: { gamesWithCarriesPriorThisSeason: 5, recentTeamTopCarryShareConcentration: 0.7 } };
    stubFetch(projectionsArtifact([passingRow(), rushingRow as never]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    within(screen.getByTestId("nfl-yardage-mobile-sort-player")).getByRole("button", { name: /sort by player/i }).click();
    await waitFor(() => expect(screen.getByTestId("nfl-yardage-mobile-sort-player")).toHaveAttribute("aria-sort", "ascending"));

    const rushingButton = within(screen.getByRole("group", { name: "Prop type" })).getByRole("button", { name: "Rushing" });
    rushingButton.click();

    await waitFor(() => expect(screen.getAllByText("Rhamondre Stevenson").length).toBeGreaterThan(0));
    expect(screen.getByTestId("nfl-yardage-mobile-sort-projectedYards")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("nfl-yardage-mobile-sort-player")).toHaveAttribute("aria-sort", "none");
  });
});

describe("NFLYardagePropsReview Last 10 tab colors and compact metric grid", () => {
  it("Player Last 10 and Opponent Last 10 tabs carry distinct color identities, indicated by more than color alone", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();
    await waitFor(() => expect(screen.getAllByRole("tab", { name: "Player Last 10" }).length).toBeGreaterThan(0));

    const playerTab = screen.getAllByRole("tab", { name: "Player Last 10" })[0];
    const opponentTab = screen.getAllByRole("tab", { name: "Opponent Last 10" })[0];

    // Player Last 10 (selected by default) carries the sky accent; Opponent carries light violet.
    expect(playerTab.className).toContain("sky");
    expect(opponentTab.className).toContain("violet");
    // aria-selected -- not color alone -- communicates which tab is active.
    expect(playerTab).toHaveAttribute("aria-selected", "true");
    expect(opponentTab).toHaveAttribute("aria-selected", "false");

    opponentTab.click();
    await waitFor(() => expect(opponentTab).toHaveAttribute("aria-selected", "true"));
    expect(opponentTab.className).toContain("violet");
  });

  it("renders the compact metric-grid rows (replacing the old stat tiles), player/offense-labeled, never opponent-allowed data under a player label", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();

    await waitFor(() => expect(screen.getAllByText("Last 10 Pass Yds/Gm").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Last 5 Pass Yds/Gm").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team Pass EPA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yards / Attempt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team Pass Success Rate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pass vs Defense Edge").length).toBeGreaterThan(0);
    // Never the old (incorrect) opponent-allowed framing.
    expect(screen.queryByText(/Season Pass Yds Allowed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EPA Pass Allowed/)).not.toBeInTheDocument();

    // Last 10/Last 5 Yds/Gm come from Drake Maye's own history-log game (actualYards 191), not the
    // opponent's yards-allowed fixture value (which this fixture leaves empty/unset entirely).
    expect(screen.getAllByText("191.0").length).toBeGreaterThan(0);
  });

  it("does not render a fabricated rank for a metric with no matching opponent/EPA/success artifact data", async () => {
    // The test fixtures' epa/success/production-allowed artifacts are all empty, so every
    // metric-grid rank must resolve to "no rank shown" -- never a fake "(1st)".
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();

    await waitFor(() => expect(screen.getAllByText("Last 10 Pass Yds/Gm").length).toBeGreaterThan(0));
    const last10RowLabel = screen.getAllByText("Last 10 Pass Yds/Gm")[0];
    const last10RowValue = last10RowLabel.closest("div")?.querySelector("span:last-child");
    expect(last10RowValue?.textContent).not.toContain("(");

    const teamEpaLabel = screen.getAllByText("Team Pass EPA")[0];
    const teamEpaValue = teamEpaLabel.closest("div")?.querySelector("span:last-child");
    expect(teamEpaValue?.textContent).not.toContain("(");
  });
});

describe("NFLYardagePropsReview Opponent Last 10 defensive result columns", () => {
  it("passing: mobile Opponent Last 10 shows Cmp/Att and TD/INT columns", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();
    await waitFor(() => expect(screen.getAllByRole("tab", { name: "Opponent Last 10" }).length).toBeGreaterThan(0));
    screen.getAllByRole("tab", { name: "Opponent Last 10" })[0].click();

    await waitFor(() => expect(screen.getAllByText(/SEA Defense — Last 1 vs QB/).length).toBeGreaterThan(0));
    expect(screen.getAllByText("Cmp/Att").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TD/INT").length).toBeGreaterThan(0);
  });

  it("rushing: mobile Opponent Last 10 shows Att and TD columns", async () => {
    const rushingRow = {
      ...passingRow(),
      market: "rushing",
      position: "RB",
      playerName: "Rhamondre Stevenson",
      playerId: "gsis:00-0037toa",
      projectedCarries: 15,
      projectedYardsPerCarry: 4.1,
      diagnostics: { gamesWithCarriesPriorThisSeason: 5, recentTeamTopCarryShareConcentration: 0.7 },
      featureSnapshot: {
        carriesPerGame: { seasonPrior: 15.2, last3: 14.8, priorSeason: null },
        carryShare: { seasonPrior: 0.55, last3: 0.52, priorSeason: null },
        rollingYardsPerCarry: { seasonPrior: 4.3, last3: 4.1, priorSeason: null },
        teamRushAttemptsPerGame: { seasonPrior: 27.0, last3: 26.5, priorSeason: null },
        teamDropbackRate: { seasonPrior: 0.6, last3: 0.59, priorSeason: null },
        teamPassRateOverExpected: { seasonPrior: 0.02, last3: 0.01, priorSeason: null },
        opponentRushAttemptsAllowedPerGame: { seasonPrior: 26.0, last3: 25.4, priorSeason: null },
        market: { spread: -2.5, total: 45, impliedTeamTotal: 23.75, isDome: false },
      },
    };
    stubFetch(projectionsArtifact([rushingRow as never]), marketArtifact());
    renderPage();

    // Passing is the default market tab; this fixture only has a rushing candidate.
    await waitFor(() => expect(screen.getByText(/no passing candidates match/i)).toBeInTheDocument());
    within(screen.getByRole("group", { name: "Prop type" })).getByRole("button", { name: "Rushing" }).click();
    await waitFor(() => expect(screen.getAllByText("Rhamondre Stevenson").length).toBeGreaterThan(0));

    screen.getAllByRole("button", { name: /expand details for rhamondre stevenson/i })[0].click();
    await waitFor(() => expect(screen.getAllByRole("tab", { name: "Opponent Last 10" }).length).toBeGreaterThan(0));
    screen.getAllByRole("tab", { name: "Opponent Last 10" })[0].click();

    await waitFor(() => expect(screen.getAllByText("Att").length).toBeGreaterThan(0));
    expect(screen.getAllByText("TD").length).toBeGreaterThan(0);
  });
});

describe("NFLYardagePropsReview WR alignment (no fabricated data)", () => {
  it("never renders Slot/Outside alignment context -- no canonical alignment data source exists in this repo", async () => {
    const receivingRow = {
      ...passingRow(),
      market: "receiving",
      position: "WR",
      playerName: "Test Wideout",
      playerId: "gsis:00-9876543",
      projectedTargets: 8,
      projectedYardsPerTarget: 8.5,
      diagnostics: { gamesWithTargetsPriorThisSeason: 5, recentTeamTopTargetShareConcentration: 0.3 },
      featureSnapshot: {
        targetsPerGame: { seasonPrior: 8.2, last3: 7.9, priorSeason: null },
        targetShare: { seasonPrior: 0.24, last3: 0.22, priorSeason: null },
        rollingYardsPerTarget: { seasonPrior: 8.5, last3: 8.1, priorSeason: null },
        teamPassAttemptsPerGame: { seasonPrior: 36.1, last3: 35.4, priorSeason: null },
        teamDropbackRate: { seasonPrior: 0.6, last3: 0.59, priorSeason: null },
        teamPassRateOverExpected: { seasonPrior: 0.02, last3: 0.01, priorSeason: null },
        targetConcentration: { seasonPrior: 0.22, last3: 0.21, priorSeason: null },
        opponentTargetsAllowedPerGame: { seasonPrior: 34.0, last3: 33.5, priorSeason: null },
        market: { spread: -2.5, total: 45, impliedTeamTotal: 23.75, isDome: false },
      },
    };
    stubFetch(projectionsArtifact([receivingRow as never]), marketArtifact());
    renderPage();

    // Passing is the default market tab; this fixture only has a receiving candidate.
    await waitFor(() => expect(screen.getByText(/no passing candidates match/i)).toBeInTheDocument());
    within(screen.getByRole("group", { name: "Prop type" })).getByRole("button", { name: "Receiving" }).click();
    await waitFor(() => expect(screen.getAllByText("Test Wideout").length).toBeGreaterThan(0));

    screen.getAllByRole("button", { name: /expand details for test wideout/i })[0].click();
    await waitFor(() => expect(screen.getAllByRole("tab", { name: "Player Last 10" }).length).toBeGreaterThan(0));

    // Honest fallback: no fabricated Slot/Outside labels or percentages anywhere in the expanded view.
    expect(screen.queryByText(/slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/outside/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Opponent Last 10").length).toBeGreaterThan(0);
  });
});

describe("NFLYardagePropsReview projection values are unchanged", () => {
  it("all UI refinements leave projectedYards, matchupScore, and raw difference exactly as sourced", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    // 245.3 projected yards, 228.5 sportsbook line, +16.8 raw difference -- unchanged from the fixture.
    expect(screen.getAllByText(/245\.3/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/228\.5/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+16\.8/).length).toBeGreaterThan(0);
  });
});

describe("NFLYardagePropsReview Player Stats / Opponent Stats tabs", () => {
  async function expandDrakeMaye() {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();
    await waitFor(() => expect(screen.getAllByRole("tab", { name: "Player Stats" }).length).toBeGreaterThan(0));
  }

  it("Player Stats is the default tab, in a separate tablist from Player Last 10 / Opponent Last 10", async () => {
    await expandDrakeMaye();

    const statsTablist = screen.getByRole("tablist", { name: "Stats" });
    const historyTablist = screen.getByRole("tablist", { name: "Last 10 history" });
    expect(statsTablist).not.toBe(historyTablist);

    const playerStatsTab = within(statsTablist).getByRole("tab", { name: "Player Stats" });
    const opponentStatsTab = within(statsTablist).getByRole("tab", { name: "Opponent Stats" });
    expect(playerStatsTab).toHaveAttribute("aria-selected", "true");
    expect(opponentStatsTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getAllByText("Last 10 Pass Yds/Gm").length).toBeGreaterThan(0);
  });

  it("switching to Opponent Stats shows opponent-oriented rows, never the player-oriented labels", async () => {
    await expandDrakeMaye();

    const statsTablist = screen.getByRole("tablist", { name: "Stats" });
    within(statsTablist).getByRole("tab", { name: "Opponent Stats" }).click();

    await waitFor(() => expect(screen.getAllByText("Season Pass Yds Allowed/Gm").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Last 5 Pass Yds Allowed/Gm").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pass EPA Allowed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pass Success Rate Allowed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Matchup Rating").length).toBeGreaterThan(0);
    // Never invented -- no such field is loaded anywhere on this page.
    expect(screen.queryByText(/Yards\s*\/\s*Attempt Allowed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sack|Pressure/i)).not.toBeInTheDocument();
    // The player-oriented tab's rows are gone while Opponent Stats is active.
    expect(screen.queryByText("Last 10 Pass Yds/Gm")).not.toBeInTheDocument();
  });

  it("the Stats tab and the Last-10 history tab track state independently", async () => {
    await expandDrakeMaye();

    within(screen.getByRole("tablist", { name: "Stats" })).getByRole("tab", { name: "Opponent Stats" }).click();
    within(screen.getByRole("tablist", { name: "Last 10 history" })).getByRole("tab", { name: "Opponent Last 10" }).click();

    await waitFor(() => expect(screen.getAllByRole("tab", { name: "Opponent Last 10" })[0]).toHaveAttribute("aria-selected", "true"));
    // Both switched independently -- neither reset the other.
    expect(within(screen.getByRole("tablist", { name: "Stats" })).getByRole("tab", { name: "Opponent Stats" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Season Pass Yds Allowed/Gm").length).toBeGreaterThan(0);
  });
});

describe("NFLYardagePropsReview vs Defense Edge -- both offense and defense ranks", () => {
  it("shows both Off and Def ordinal ranks together, never a single misleading rank suffix", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("yardage-history.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(yardageHistoryArtifact()) } as Response);
      if (url.includes("yardage-projections.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(projectionsArtifact([passingRow()])) } as Response);
      if (url.includes("nfl-yardage-market.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(marketArtifact()) } as Response);
      if (url.includes("matchup-epa.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...emptyEpaArtifact(),
              windows: {
                "season-blend": {
                  mode: "season",
                  includePriorSeason: true,
                  teams: {
                    ne: { gamesIncluded: 8, gameIds: [], seasons: [2025], through: { season: 2025, week: 18, dateUtc: null }, metrics: { "off.epaPerPass": [0.12, 9] }, totals: { offense: {}, defense: {} } },
                    sea: { gamesIncluded: 8, gameIds: [], seasons: [2025], through: { season: 2025, week: 18, dateUtc: null }, metrics: { "def.epaPerPassAllowed": [-0.05, 3] }, totals: { offense: {}, defense: {} } },
                  },
                },
              },
            }),
        } as Response);
      }
      if (url.includes("matchup-success-rates.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(emptySuccessArtifact()) } as Response);
      if (url.includes("matchup-production-allowed.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(emptyProductionAllowedArtifact()) } as Response);
      if (url.includes("teams.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(emptyTeamsArtifact()) } as Response);
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();

    // Edge = defenseRank(3) - offenseRank(9) = -6.
    await waitFor(() => expect(screen.getAllByText(/9th Off vs 3rd Def/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/-6/).length).toBeGreaterThan(0);
  });
});

describe("NFLYardagePropsReview Player Last 10 added columns by market", () => {
  it("passing: mobile Player Last 10 shows Cmp/Att and TD/INT columns", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();

    await waitFor(() => expect(screen.getAllByText(/Drake Maye — Last 1 Games/).length).toBeGreaterThan(0));
    expect(screen.getAllByText("Cmp/Att").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TD/INT").length).toBeGreaterThan(0);
  });
});

describe("NFLYardagePropsReview Opponent Last 10 home/away context", () => {
  it("shows @/vs + opponent abbreviation under the opposing player's name when the historical record has homeAway", async () => {
    stubFetch(projectionsArtifact([passingRow()]), marketArtifact());
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Drake Maye").length).toBeGreaterThan(0));
    screen.getAllByRole("button", { name: /expand details for drake maye/i })[0].click();
    await waitFor(() => expect(screen.getAllByRole("tab", { name: "Opponent Last 10" }).length).toBeGreaterThan(0));
    screen.getAllByRole("tab", { name: "Opponent Last 10" })[0].click();

    // Fixture: sea:passing:QB game has homeAway "home" (the defense, SEA, hosted) -- so the visiting
    // offense ("Test Opp QB") played @ SEA.
    await waitFor(() => expect(screen.getAllByText("Test Opp QB").length).toBeGreaterThan(0));
    expect(screen.getAllByText("@ SEA").length).toBeGreaterThan(0);
  });
});
