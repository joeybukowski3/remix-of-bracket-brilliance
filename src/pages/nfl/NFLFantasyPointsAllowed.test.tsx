import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { FantasyAllowedArtifact, FantasyAllowedPositionSample, FantasyAllowedRow } from "@/lib/nfl/fantasyAllowed/types";
import { fantasyAllowedRankTone } from "@/lib/nfl/fantasyAllowed/presentation";
import type { PositionMatchupArtifact, PositionMatchupCell, PositionMatchupCells, PositionMatchupRow } from "@/lib/nfl/positionMatchups/types";
import NFLFantasyPointsAllowed from "./NFLFantasyPointsAllowed";

function renderPage(initialEntry = "/nfl/fantasy-points-allowed") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NFLFantasyPointsAllowed />
    </MemoryRouter>,
  );
}

function sample(
  rank: number | null,
  source: FantasyAllowedPositionSample["source"] = "jkb-full-ppr-player-week",
  perGame: number | null = rank,
): FantasyAllowedPositionSample | null {
  if (rank == null) return null;
  return { rank, gamesSampled: 1, fantasyPointsAllowedTotal: rank == null ? null : rank * 10, fantasyPointsAllowedPerGame: perGame, source };
}

function row(overrides: Partial<FantasyAllowedRow> & { team: string; qb2026?: number; qb2026PerGame?: number | null }): FantasyAllowedRow {
  const { qb2026 = 1, qb2026PerGame = null, ...rest } = overrides;
  const wrRank = overrides.team === "buf" ? 20 : 1;
  const wrPerGame = overrides.team === "buf" ? 5.4 : 18.7;
  return {
    opponent: null,
    location: null,
    samples: {
      "2026": {
        qb: sample(qb2026, "jkb-full-ppr-player-week", qb2026PerGame ?? qb2026),
        rb: sample(2),
        wr: sample(wrRank, "jkb-full-ppr-player-week", wrPerGame),
        te: sample(3),
        wideWr: sample(4, "razzball-slot-wide-snapshot"),
        slotWr: sample(5, "razzball-slot-wide-snapshot"),
      },
      "2025": { qb: sample(30), rb: sample(31), wr: sample(wrRank, "jkb-full-ppr-player-week", wrPerGame), te: sample(32), wideWr: null, slotWr: null },
      last5: { qb: sample(10), rb: sample(11), wr: sample(wrRank, "jkb-full-ppr-player-week", wrPerGame), te: sample(12), wideWr: null, slotWr: null },
      last8: { qb: sample(15), rb: sample(16), wr: sample(wrRank, "jkb-full-ppr-player-week", wrPerGame), te: sample(17), wideWr: null, slotWr: null },
    },
    ...rest,
  };
}

function artifact(): FantasyAllowedArtifact {
  return {
    schemaVersion: "nfl-fantasy-points-allowed-v2",
    generatedAt: "2026-09-17T00:00:00.000Z",
    season: 2026,
    week: 2,
    scoringVersion: "jkb-full-ppr-v1.0.0",
    rows: [
      // Rank is deliberately the inverse of raw per-game value: buf has the worse (higher) rank
      // but the lower per-game value, proving raw-mode sort and display key off different fields than rank mode.
      row({ team: "buf", opponent: "mia", location: "@", qb2026: 20, qb2026PerGame: 5.4 }),
      row({ team: "dal", opponent: "was", location: "vs", qb2026: 1, qb2026PerGame: 18.7 }),
    ],
  };
}

function matchupCell(overrides: Partial<PositionMatchupCell> = {}): PositionMatchupCell {
  return { forRank: null, forPerGame: null, forGamesSampled: 0, allowedRank: null, allowedPerGame: null, allowedGamesSampled: 0, edge: null, rating: null, ...overrides };
}

function matchupCells(overrides: Partial<Record<"qb" | "rb" | "wr" | "te", Partial<PositionMatchupCell>>> = {}): PositionMatchupCells {
  return { qb: matchupCell(overrides.qb), rb: matchupCell(overrides.rb), wr: matchupCell(overrides.wr), te: matchupCell(overrides.te) };
}

function matchupRow(overrides: Partial<PositionMatchupRow> & { team: string; qbCell?: Partial<PositionMatchupCell> }): PositionMatchupRow {
  const { qbCell, ...rest } = overrides;
  return { opponent: null, location: null, samples: { "2026": matchupCells({ qb: qbCell }), "2025": matchupCells(), last5: matchupCells(), last8: matchupCells() }, ...rest };
}

function matchupArtifact(): PositionMatchupArtifact {
  return {
    schemaVersion: "nfl-fantasy-position-matchups-v1",
    generatedAt: "2026-09-17T00:00:00.000Z",
    season: 2026,
    week: 2,
    scoringVersion: "jkb-full-ppr-v1.0.0",
    rows: [
      matchupRow({ team: "buf", opponent: "mia", location: "@", qbCell: { forRank: 25, forPerGame: 22.4, allowedRank: 29, allowedPerGame: 25.1, edge: 21, rating: "very-strong" } }),
      matchupRow({ team: "dal", opponent: "was", location: "vs", qbCell: { forRank: 3, forPerGame: 8.2, allowedRank: 4, allowedPerGame: 9.1, edge: -26, rating: "very-weak" } }),
    ],
  };
}

/** Routes fetch by URL: the Points Allowed and Matchup Comparison views hit different artifact paths. */
function stubFetch(data: FantasyAllowedArtifact, matchup: PositionMatchupArtifact = matchupArtifact()) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(String(url).includes("fantasy-position-matchups") ? matchup : data),
      } as Response),
    ),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("NFLFantasyPointsAllowed", () => {
  it("renders the 2026 sample by default with team/opponent formatting", async () => {
    stubFetch(artifact());
    renderPage();

    const bufRow = await waitFor(() => screen.getByText("BUF").closest("tr"));
    expect(bufRow).not.toBeNull();
    expect(within(bufRow as HTMLElement).getByText("@ MIA")).toBeInTheDocument();
    expect(within(bufRow as HTMLElement).getByText("20")).toBeInTheDocument(); // qb rank in 2026 sample

    const dalRow = screen.getByText("DAL").closest("tr") as HTMLElement;
    expect(within(dalRow).getByText("vs WAS")).toBeInTheDocument();
  });

  it("switches sample values when a tab is clicked, without refetching", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact()) } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();

    await waitFor(() => screen.getByText("BUF"));
    // 2026 QB rank for BUF is 20
    expect(within(screen.getByText("BUF").closest("tr") as HTMLElement).getByText("20")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2025" }));

    const bufRowAfter = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRowAfter).getByText("30")).toBeInTheDocument(); // 2025 QB rank
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shows a Last 8 sample tab and switches to it without refetching", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact()) } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("15")).toBeInTheDocument(); // last8 qb rank for buf
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each(["2025", "Last 5", "Last 8"])("renders combined WR and no unsupported splits for %s", async (sampleLabel) => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "Sort by Wide WR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Slot WR" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sort by WR" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: sampleLabel }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(screen.getByRole("button", { name: "Sort by WR" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sort by Wide WR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sort by Slot WR" })).not.toBeInTheDocument();
    expect(within(bufRow).getByText("20")).toBeInTheDocument();
  });

  it("shows WR raw PPG with rank, sorts by raw or rank, and colors by rank", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    const teamOrder = () => [...screen.getAllByRole("row")].slice(1).map((tr) => tr.querySelector("td")?.textContent?.trim());
    const wrCell = (team: string) => {
      const bodyRow = screen.getByText(team).closest("tr") as HTMLElement;
      return within(bodyRow).getAllByRole("cell")[4] as HTMLElement; // Team, Opp, QB, RB, WR
    };
    expect(wrCell("BUF")).toHaveStyle({ backgroundColor: fantasyAllowedRankTone(20).style?.backgroundColor });
    expect(wrCell("DAL")).toHaveStyle({ backgroundColor: fantasyAllowedRankTone(1).style?.backgroundColor });
    fireEvent.click(screen.getByRole("button", { name: "Sort by WR" }));
    expect(teamOrder()).toEqual(["DAL", "BUF"]); // rank 1 before rank 20
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(within(wrCell("BUF")).getByText("5.4")).toBeInTheDocument();
    expect(within(wrCell("BUF")).getByText("(20)")).toBeInTheDocument();
    expect(teamOrder()).toEqual(["BUF", "DAL"]); // PPG 5.4 before 18.7
    expect(wrCell("BUF")).toHaveStyle({ backgroundColor: fantasyAllowedRankTone(20).style?.backgroundColor });
  });

  it("explains that other samples use combined WR", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));
    expect(screen.getByText("Wide/Slot WR splits are available for 2026; other samples use combined WR.")).toBeInTheDocument();
  });

  it("sorts by a position column ascending then descending on repeat clicks", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    // Default team-name sort: BUF before DAL is not guaranteed (alphabetical puts BUF before DAL).
    expect(bodyTeams()).toEqual(["BUF", "DAL"]);

    // 2026 QB ranks: dal=1, buf=20 -- ascending should put dal first.
    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);

    // Clicking again toggles to descending.
    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    expect(bodyTeams()).toEqual(["BUF", "DAL"]);
  });

  it("defaults to Rank display mode", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "Rank" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Raw" })).toHaveAttribute("aria-pressed", "false");
    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("20")).toBeInTheDocument();
    expect(within(bufRow).queryByText("5.4")).not.toBeInTheDocument();
  });

  it("Raw mode renders the per-game value with rank in parentheses, one decimal place", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("5.4")).toBeInTheDocument();
    expect(within(bufRow).getByText("(20)")).toBeInTheDocument();
  });

  it("renders a bare em dash (never '— (—)') for a null raw value", async () => {
    const data = artifact();
    // Null out BUF's QB sample entirely for the 2026 slice.
    data.rows[0].samples["2026"].qb = null;
    stubFetch(data);
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("—")).toBeInTheDocument();
    expect(within(bufRow).queryByText(/—\s*\(—\)/)).not.toBeInTheDocument();
  });

  it("switching display mode does not refetch the artifact", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact()) } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    fireEvent.click(screen.getByRole("button", { name: "Rank" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sample switching works while in Raw mode", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    fireEvent.click(screen.getByRole("button", { name: "2025" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    // 2025 sample's qb rank/per-game is 30 in the fixture -> "30.0 (30)".
    expect(within(bufRow).getByText("30.0")).toBeInTheDocument();
    expect(within(bufRow).getByText("(30)")).toBeInTheDocument();
  });

  it("Raw mode position sorting uses the raw per-game value, not rank", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    // Raw per-game: buf=5.4, dal=18.7 -- ascending should put buf first, the opposite of rank-mode order (dal first).
    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    expect(bodyTeams()).toEqual(["BUF", "DAL"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });

  it("renders all four sample controls (mobile chip row wraps, never hides options)", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2025" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 8" })).toBeInTheDocument();
  });

  it("Rank mode position sorting still uses rank when raw values are present", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    // Rank ascending: dal (rank 1) before buf (rank 20).
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });
});

describe("NFLFantasyPointsAllowed view tabs", () => {
  it("defaults to the Points Allowed tab", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "Points Allowed" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Matchup Comparison" })).toHaveAttribute("aria-pressed", "false");
    // Points Allowed-only column header ("Allow" for Wide/Slot WR positions doesn't exist on the matchup table).
    expect(screen.getByRole("button", { name: "Sort by QB" })).toBeInTheDocument();
  });

  it("switches to the Matchup Comparison tab and renders its table", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Matchup Comparison" }));

    const bufRow = await waitFor(() => screen.getByText("BUF").closest("tr"));
    expect(within(bufRow as HTMLElement).getByText("25")).toBeInTheDocument(); // QB FOR rank
    expect(within(bufRow as HTMLElement).getByText("29")).toBeInTheDocument(); // QB ALLOWED rank
    expect(within(bufRow as HTMLElement).getByText("Very Strong (+21)")).toBeInTheDocument(); // combined EDGE cell
  });

  it("hides the Points Allowed table once the Matchup Comparison tab is active", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));
    expect(screen.getByRole("button", { name: "Sort by QB" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Matchup Comparison" }));
    await waitFor(() => screen.getByText("Very Strong (+21)"));

    expect(screen.queryByRole("button", { name: "Sort by QB" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rank heat legend")).not.toBeInTheDocument();
  });

  it("switches back to the Points Allowed tab and restores its table", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Matchup Comparison" }));
    await waitFor(() => screen.getByText("Very Strong (+21)"));

    fireEvent.click(screen.getByRole("button", { name: "Points Allowed" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Sort by QB" })).toBeInTheDocument());
    expect(screen.queryByText("Very Strong (+21)")).not.toBeInTheDocument();
  });

  it("loads directly into the Matchup Comparison tab from ?view=matchups", async () => {
    stubFetch(artifact());
    renderPage("/nfl/fantasy-points-allowed?view=matchups");

    const bufRow = await waitFor(() => screen.getByText("BUF").closest("tr"));
    expect(within(bufRow as HTMLElement).getByText("Very Strong (+21)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Matchup Comparison" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shares the sample selection across tabs", async () => {
    stubFetch(artifact());
    renderPage();
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));
    fireEvent.click(screen.getByRole("button", { name: "Matchup Comparison" }));

    await waitFor(() => screen.getByText("BUF"));
    expect(screen.getByRole("button", { name: "Last 8" })).toHaveAttribute("aria-pressed", "true");
  });
});
