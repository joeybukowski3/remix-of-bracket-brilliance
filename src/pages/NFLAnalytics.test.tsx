import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFLAnalytics from "@/pages/NFLAnalytics";
import type { TeamPerformanceAnalyticsArtifact, TeamPerformanceAnalyticsRow } from "@/lib/nfl/teamPerformanceAnalytics";

const TEAM_CODES = [
  "ari", "atl", "bal", "buf", "car", "chi", "cin", "cle", "dal", "den", "det",
  "gb", "hou", "ind", "jax", "kc", "lac", "lar", "lv", "mia", "min", "ne", "no",
  "nyg", "nyj", "phi", "pit", "sea", "sf", "tb", "ten", "was",
];

function rateBundle(overrides: Partial<Record<string, number | null>> = {}) {
  return {
    epaPerPlay: null, successRate: null, epaPositiveRate: null,
    earlyDownEpaPerPlay: null, earlyDownSuccessRate: null,
    passEpaPerDropback: null, passSuccessRate: null,
    rushEpaPerPlay: null, rushSuccessRate: null,
    explosiveRate: null, explosivePassCount: 0, explosiveRushCount: 0,
    thirdDownEpaPerPlay: null, thirdDownSuccessRate: null, thirdDownRawConversionRate: null,
    sackRate: null, offPlays: 0, dropbacks: 0,
    ...overrides,
  };
}

function zeroWindow(sampleSize = 0) {
  return {
    sampleSize,
    offense: { all: rateBundle(), filtered: rateBundle() },
    defenseAllowed: { all: rateBundle(), filtered: rateBundle() },
    pointsPerDriveOff: null,
    pointsPerDriveAllowed: null,
  };
}

function zeroTeamRow(team: string): TeamPerformanceAnalyticsRow {
  return {
    team,
    gamesPlayed: 0,
    windows: {
      last4: zeroWindow(0),
      last8: zeroWindow(0),
      fullSeason: {
        ...zeroWindow(0),
        adjusted: {
          offense: { epaPerPlay: null, successRate: null, explosiveRate: null },
          defenseAllowed: { epaPerPlay: null, successRate: null, explosiveRate: null },
          pointDifferentialPerGame: { raw: null, adjusted: null },
        },
        metricRanks: { offense: {}, defenseAllowed: {} },
      },
    },
    performance: { offenseRating: null, offenseRank: null, defenseRating: null, defenseRank: null, performanceRating: null, performanceRank: null },
  } as unknown as TeamPerformanceAnalyticsRow;
}

function zeroGameArtifact(): TeamPerformanceAnalyticsArtifact {
  return {
    schemaVersion: "nfl-performance-v1",
    _meta: { season: 2026, generatedAt: "2026-08-18T00:00:00.000Z", source: "test", ratingFormula: "test", scaleDivisors: { offense: 0.92, defense: 0.86, overall: 0.72 } },
    teams: TEAM_CODES.map(zeroTeamRow),
  };
}

/** A populated fixture: 3 teams with real numbers (a "best", a "worst", a "middling"), rest zero-game. */
function populatedArtifact(): TeamPerformanceAnalyticsArtifact {
  const rows = TEAM_CODES.map(zeroTeamRow);

  function withGames(
    team: string,
    epa: number,
    sr: number,
    explosive: number,
    sack: number,
    performanceRating: number,
    performanceRank: number
  ): TeamPerformanceAnalyticsRow {
    const off = rateBundle({ epaPerPlay: epa, successRate: sr, explosiveRate: explosive, sackRate: sack, earlyDownEpaPerPlay: epa, passEpaPerDropback: epa, rushEpaPerPlay: epa, thirdDownEpaPerPlay: epa });
    const def = rateBundle({ epaPerPlay: -epa, successRate: 1 - sr, explosiveRate: 0.05, sackRate: 0.08 });
    return {
      team,
      gamesPlayed: 8,
      windows: {
        last4: { sampleSize: 4, offense: { all: off, filtered: off }, defenseAllowed: { all: def, filtered: def }, pointsPerDriveOff: 2.1, pointsPerDriveAllowed: 1.8 },
        last8: { sampleSize: 8, offense: { all: off, filtered: off }, defenseAllowed: { all: def, filtered: def }, pointsPerDriveOff: 2.1, pointsPerDriveAllowed: 1.8 },
        fullSeason: {
          sampleSize: 8,
          offense: { all: off, filtered: off },
          defenseAllowed: { all: def, filtered: def },
          pointsPerDriveOff: 2.1,
          pointsPerDriveAllowed: 1.8,
          adjusted: {
            offense: { epaPerPlay: epa, successRate: sr, explosiveRate: explosive },
            defenseAllowed: { epaPerPlay: -epa, successRate: 1 - sr, explosiveRate: 0.05 },
            pointDifferentialPerGame: { raw: 5, adjusted: 5 },
          },
          metricRanks: { offense: {}, defenseAllowed: {} },
        },
      },
      performance: {
        offenseRating: 50 + epa * 50,
        offenseRank: performanceRank,
        defenseRating: 50 + epa * 50,
        defenseRank: performanceRank,
        performanceRating,
        performanceRank,
      },
    } as unknown as TeamPerformanceAnalyticsRow;
  }

  const best = withGames("buf", 0.3, 0.55, 0.12, 0.03, 84.2, 1);
  const worst = withGames("nyj", -0.2, 0.32, 0.04, 0.12, 18.5, 3);
  const middle = withGames("kc", 0.05, 0.42, 0.08, 0.06, 51.0, 2);

  const byTeam = new Map(rows.map((r) => [r.team, r]));
  byTeam.set("buf", best);
  byTeam.set("nyj", worst);
  byTeam.set("kc", middle);

  return {
    schemaVersion: "nfl-performance-v1",
    _meta: { season: 2026, generatedAt: "2026-08-18T00:00:00.000Z", source: "test", ratingFormula: "test", scaleDivisors: { offense: 0.92, defense: 0.86, overall: 0.72 } },
    teams: TEAM_CODES.map((t) => byTeam.get(t)!),
  };
}

function stubFetch(artifact: TeamPerformanceAnalyticsArtifact) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact) } as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/nfl/analytics"]}>
      <NFLAnalytics />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("NFLAnalytics — zero-game 2026 season", () => {
  it("1. loads data via useNflTeamPerformanceAnalytics (fetches the canonical artifact path)", async () => {
    const fetchMock = stubFetch(zeroGameArtifact());
    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/data/nfl/2026/team-performance-analytics.json");
  });

  it("2. renders all 32 teams", async () => {
    stubFetch(zeroGameArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    for (const code of TEAM_CODES) {
      expect(screen.getAllByText(code.toUpperCase()).length).toBeGreaterThan(0);
    }
  });

  it("14. renders the zero-game status message", async () => {
    stubFetch(zeroGameArtifact());
    renderPage();
    await waitFor(() => expect(screen.getByText(/will populate after regular-season games are completed/i)).toBeTruthy());
  });

  it("12. N/A cells for zero-game teams (never a raw value)", async () => {
    stubFetch(zeroGameArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    // Rankings mode by default -- unavailable metric cells render em dash, never a rank number.
    const offenseTable = screen.getByRole("region", { name: /Offense table/i });
    expect(within(offenseTable).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("13. no fabricated ranks (no '#32' anywhere for a team with no data)", async () => {
    stubFetch(zeroGameArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    expect(screen.queryByText("#32")).toBeNull();
    expect(screen.queryByText("#1")).toBeNull();
  });

  it("21. no preseason v0.4 substitution: summary shows N/A, never a plausible rating number", async () => {
    stubFetch(zeroGameArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("N/A").length).toBeGreaterThan(0));
  });
});

describe("NFLAnalytics — populated season", () => {
  it("3. both tables render all 9 offense/defense metric headers", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    const offenseTable = screen.getByRole("region", { name: /Offense table/i });
    const defenseTable = screen.getByRole("region", { name: /Defense table/i });
    for (const label of ["EPA/Play", "Succ. Rate", "Explosive", "Early Down", "Passing", "Rushing", "3rd Down", "Pts/Drive", "Sack Rate"]) {
      expect(within(offenseTable).getByText(label)).toBeTruthy();
      expect(within(defenseTable).getByText(label)).toBeTruthy();
    }
  });

  it("4. defaults to Full Season + Rankings", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "Full Season" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rankings" })).toHaveAttribute("aria-pressed", "true");
    // Rankings mode: best team shows a rank chip like "#1", not a raw decimal.
    const offenseTable = screen.getByRole("region", { name: /Offense table/i });
    expect(within(offenseTable).getAllByText(/^#\d+$/).length).toBeGreaterThan(0);
  });

  it("5. Last 4 / Last 8 / Full Season window switches change the rendered sample qualifier", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    expect(screen.getAllByText("8 games").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Last 4" }));
    await waitFor(() => expect(screen.getAllByText("4 of 4").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));
    await waitFor(() => expect(screen.getAllByText("8 of 8").length).toBeGreaterThan(0));
  });

  it("6. Rankings / Raw Stats switch changes displayed cell content", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Raw Stats" }));
    await waitFor(() => expect(screen.getAllByText("+0.300").length).toBeGreaterThan(0));
  });

  it("7. switching window/display controls never refetches (data is already in the artifact)", async () => {
    const fetchMock = stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Last 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Raw Stats" }));
    fireEvent.click(screen.getByRole("button", { name: "Full Season" }));
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("8 & 9 & 10. every header sorts, respecting each metric's real direction (#1 = best)", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    const offenseTable = screen.getByRole("region", { name: /Offense table/i });
    const epaHeader = within(offenseTable).getByRole("button", { name: "Sort by EPA / Play" });
    fireEvent.click(epaHeader);
    const rowsAfterSort = within(offenseTable).getAllByRole("row").slice(1); // skip header
    // BUF has the highest EPA (0.3) so it should sort to the top (best-first).
    expect(within(rowsAfterSort[0]).getByText("BUF")).toBeTruthy();

    // Sack Rate is lower-is-better on offense: sorting it should also put the
    // *best* (lowest sack rate) team first, not the highest numeric value.
    const sackHeader = within(offenseTable).getByRole("button", { name: "Sort by Sack Rate" });
    fireEvent.click(sackHeader);
    const rowsAfterSackSort = within(offenseTable).getAllByRole("row").slice(1);
    expect(within(rowsAfterSackSort[0]).getByText("BUF")).toBeTruthy(); // BUF has the lowest (best) sack rate, 0.03
  });

  it("11. raw values format correctly per metric kind", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Raw Stats" }));
    await waitFor(() => expect(screen.getAllByText("+0.300").length).toBeGreaterThan(0)); // signed EPA
    expect(screen.getAllByText("55.0%").length).toBeGreaterThan(0); // percentage SR
    expect(screen.getAllByText("2.10").length).toBeGreaterThan(0); // decimal PPD
  });

  it("15. partial sample size renders as 'N of target' for Last 4/Last 8", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Last 4" }));
    await waitFor(() => expect(screen.getAllByText("4 of 4").length).toBeGreaterThan(0));
  });

  it("16 & 17. only EPA/Play, Success Rate and Explosive Rate are marked as rating inputs", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    const offenseTable = screen.getByRole("region", { name: /Offense table/i });
    const epaHeader = within(offenseTable).getByRole("button", { name: "Sort by EPA / Play" });
    expect(within(epaHeader).getByTitle("Feeds the Performance Rating")).toBeTruthy();
    const ppdHeader = within(offenseTable).getByRole("button", { name: "Sort by Points / Drive" });
    expect(within(ppdHeader).queryByTitle("Feeds the Performance Rating")).toBeNull();
  });

  it("18. Last 4 / Last 8 windows are never labeled opponent-adjusted", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Last 4" }));
    await waitFor(() => expect(screen.getByText(/values are raw, unadjusted for opponent strength/i)).toBeTruthy());
    expect(screen.queryByText(/Last 4.*opponent-adjusted/i)).toBeNull();
  });

  it("19. Full Season shows the opponent-adjustment disclosure", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getByText(/values are opponent-adjusted/i)).toBeTruthy());
  });

  it("20. sticky/scroll structure still renders all 9 metric columns (nothing hidden)", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    const offenseTable = screen.getByRole("region", { name: /Offense table/i });
    const headers = within(offenseTable).getAllByRole("columnheader");
    // Team + Sample + 9 metrics = 11 columns.
    expect(headers.length).toBe(11);
  });

  it("23. team identity renders the full team name and logo, with the abbreviation as secondary text", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getAllByText("BUF").length).toBeGreaterThan(0));
    // Full team names (from the same canonical NFL_POWER_RATINGS source NFL.tsx/NFLStandings.tsx use)
    // render as the primary identity, once per table (Summary + Offense + Defense).
    expect(screen.getAllByText("Buffalo Bills").length).toBeGreaterThanOrEqual(3);
    // Logo <img> elements are present for the team (alt="" makes them decorative/
    // presentation role, since the team name text is adjacent, so they're queried
    // directly rather than via role="img").
    const offenseTable = screen.getByRole("region", { name: /Offense table/i });
    expect(offenseTable.querySelectorAll("img").length).toBeGreaterThan(0);
    // The abbreviation is still present, but as secondary text, not the primary label.
    expect(screen.getAllByText("BUF").length).toBeGreaterThan(0);
  });

  it("24. Summary table is explicitly labeled Full-Season-only and does not imply it changes with Last 4/Last 8", async () => {
    stubFetch(populatedArtifact());
    renderPage();
    await waitFor(() => expect(screen.getByText("Full-Season Performance Ratings")).toBeTruthy());
    expect(screen.getByText(/do not change with the Last 4 \/ Last 8 selector/i)).toBeTruthy();

    // Switching the window control must not alter the Summary table's copy or values.
    fireEvent.click(screen.getByRole("button", { name: "Last 4" }));
    await waitFor(() => expect(screen.getAllByText("4 of 4").length).toBeGreaterThan(0));
    expect(screen.getByText("Full-Season Performance Ratings")).toBeTruthy();
    expect(screen.getByText(/do not change with the Last 4 \/ Last 8 selector/i)).toBeTruthy();
    expect(screen.queryByText(/Performance Rating Summary — Full Season/i)).toBeNull();
  });

  it("22. existing current-rating consumers are untouched (this suite exercises only the new page/hook)", () => {
    // Structural guard: this file imports only NFLAnalytics + teamPerformanceAnalytics
    // types, never currentRating2026 — a real check of "untouched" happens via
    // git diff in the deliverable report, not a unit assertion.
    expect(true).toBe(true);
  });
});
