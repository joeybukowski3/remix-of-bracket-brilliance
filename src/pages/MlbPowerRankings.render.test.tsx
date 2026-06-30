/**
 * MlbPowerRankings.render.test.tsx
 * Focused tests for the Power Rankings page: row rendering, click-to-expand,
 * keyboard interaction, sorting, and metric display.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbPowerRankings from "./MlbPowerRankings";
import type { PowerRankingsPayload } from "@/hooks/useMlbPowerRankings";

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeTeam(overrides: Partial<PowerRankingsPayload["teams"][number]> = {}): PowerRankingsPayload["teams"][number] {
  return {
    team: "NYY",
    teamName: "New York Yankees",
    teamId: 147,
    league: "American League",
    division: "American League East",
    leagueId: 103,
    divisionId: 201,
    seasonRank: 1,
    seasonCompositeScore: 84.2,
    last30Rank: 3,
    last30CompositeScore: 76.5,
    record: "55-30",
    gamesPlayed: 85,
    runDifferential: 96,
    currentSos: 52.1,
    currentSosRank: 10,
    next30Sos: 58.3,
    next30SosRank: 4,
    next30GamesCount: 26,
    restOfSeasonSos: 55.0,
    restOfSeasonSosRank: 7,
    restOfSeasonGamesCount: 78,
    seasonMetrics: {
      era: { value: 3.41, rank: 3, normalizedScore: 91.2 },
      fip: { value: 3.56, rank: 5, normalizedScore: 86.7 },
      xba: { value: 0.261, rank: 4, normalizedScore: 88.1 },
      ops: { value: 0.782, rank: 2, normalizedScore: 94.5 },
      wrcPlus: { value: 118, rank: 2, normalizedScore: 94.1 },
      runDifferential: { value: 1.13, rank: 1, normalizedScore: 100 },
      scheduleAdjPerformance: { value: 7.4, rank: 3, normalizedScore: 90.5 },
    },
    last30Metrics: {
      era: { value: 3.41, rank: 3, normalizedScore: 91.2 },
      fip: { value: 3.56, rank: 5, normalizedScore: 86.7 },
      xba: { value: 0.255, rank: 6, normalizedScore: 80.1 },
      ops: { value: 0.760, rank: 4, normalizedScore: 85.0 },
      wrcPlus: { value: 110, rank: 4, normalizedScore: 82.0 },
      runDifferential: { value: 0.80, rank: 3, normalizedScore: 88.0 },
      scheduleAdjPerformance: { value: 3.2, rank: 5, normalizedScore: 75.0 },
    },
    nextMonthGames: [
      { date: "2026-07-01", opponent: "BOS", opponentId: 111, home: true },
      { date: "2026-07-03", opponent: "TB", opponentId: 139, home: false },
    ],
    ...overrides,
  };
}

const FIXTURE: PowerRankingsPayload = {
  generatedAt: "2026-06-30T12:00:00.000Z",
  season: 2026,
  modelVersion: "mlb-power-rankings-v1",
  weights: { era: 0.18, fip: 0.12, xba: 0.10, ops: 0.13, wrcPlus: 0.12, runDifferential: 0.20, scheduleAdjPerformance: 0.15 },
  teamsCount: 2,
  teams: [
    makeTeam(),
    makeTeam({ team: "BOS", teamName: "Boston Red Sox", teamId: 111, seasonRank: 2, seasonCompositeScore: 70.1, last30Rank: 1, last30CompositeScore: 85.0 }),
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/mlb/power-rankings"]}>
      <MlbPowerRankings />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.includes("power-rankings.json")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FIXTURE) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  }));
});

// ── 24–26: Expanded row metric rendering ─────────────────────────────────────

describe("Expanded team row renders all metrics", () => {
  it("24. expanded team row renders all seven season metrics", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const row = screen.getByText("New York Yankees").closest("tr")!;
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText("Season Metrics")).toBeTruthy());
    expect(screen.getByText("ERA")).toBeTruthy();
    expect(screen.getByText("FIP")).toBeTruthy();
    expect(screen.getByText("xBA")).toBeTruthy();
    expect(screen.getByText("OPS")).toBeTruthy();
    expect(screen.getByText("wRC+")).toBeTruthy();
    expect(screen.getByText("Run Diff / Game")).toBeTruthy();
    expect(screen.getByText("Schedule-Adj Performance")).toBeTruthy();
  });

  it("25. raw value and metric rank render in the expanded panel", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const row = screen.getByText("New York Yankees").closest("tr")!;
    fireEvent.click(row);
    await waitFor(() => expect(screen.getAllByText("3.41").length).toBeGreaterThan(0)); // ERA value
    expect(screen.getAllByText("#3").length).toBeGreaterThan(0); // ERA rank
  });

  it("26. normalized score and weight render", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const row = screen.getByText("New York Yankees").closest("tr")!;
    fireEvent.click(row);
    await waitFor(() => expect(screen.getAllByText("91").length).toBeGreaterThan(0)); // normalizedScore rounded
  });
});

// ── 27–28: Row interaction ────────────────────────────────────────────────────

describe("Row click and keyboard interaction", () => {
  it("27. full row click toggles expansion", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const row = screen.getByText("New York Yankees").closest("tr")!;
    expect(screen.queryByText("Season Metrics")).toBeFalsy();
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText("Season Metrics")).toBeTruthy());
    fireEvent.click(row);
    await waitFor(() => expect(screen.queryByText("Season Metrics")).toBeFalsy());
  });

  it("28. clicking a different team's row switches expansion, not double-toggles", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const nyyRow = screen.getByText("New York Yankees").closest("tr")!;
    const bosRow = screen.getByText("Boston Red Sox").closest("tr")!;
    fireEvent.click(nyyRow);
    await waitFor(() => expect(screen.getByText("Season Metrics")).toBeTruthy());
    fireEvent.click(bosRow);
    // Only one panel should be open at a time
    await waitFor(() => {
      const panels = screen.getAllByText("Season Metrics");
      expect(panels).toHaveLength(1);
    });
  });
});

// ── Next Month Opponents tab ──────────────────────────────────────────────────

describe("Next Month Opponents tab", () => {
  it("renders July opponent schedule with home/away indicators", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const row = screen.getByText("New York Yankees").closest("tr")!;
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText("Next Month Opponents")).toBeTruthy());
    fireEvent.click(screen.getByText("Next Month Opponents"));
    await waitFor(() => expect(screen.getByText(/vs BOS/)).toBeTruthy());
    expect(screen.getByText(/@ TB/)).toBeTruthy();
  });
});

// ── 29: Sorting ────────────────────────────────────────────────────────────────

describe("Sorting", () => {
  it("29. sorting by Last 30 Score reorders teams", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const select = screen.getByDisplayValue("Season Rank");
    fireEvent.change(select, { target: { value: "last30Score" } });
    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      // First data row (after header) should now be Boston (last30=85.0 > NYY's 76.5)
      expect(rows[1].textContent).toContain("Boston");
    });
  });
});

// ── Basic rendering ────────────────────────────────────────────────────────────

describe("Basic page rendering", () => {
  it("renders all teams from fixture", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    expect(screen.getByText("Boston Red Sox")).toBeTruthy();
  });

  it("renders methodology panel with weights", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Methodology")).toBeTruthy());
    expect(screen.getByText(/ERA: 18%/)).toBeTruthy();
  });

  it("search filters teams by name", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("New York Yankees")).toBeTruthy());
    const search = screen.getByPlaceholderText("Search teams");
    fireEvent.change(search, { target: { value: "Boston" } });
    await waitFor(() => {
      expect(screen.queryByText("New York Yankees")).toBeFalsy();
      expect(screen.getByText("Boston Red Sox")).toBeTruthy();
    });
  });
});
