import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FantasyAllowedArtifact, FantasyAllowedPositionSample, FantasyAllowedRow } from "@/lib/nfl/fantasyAllowed/types";
import NFLFantasyPointsAllowed from "./NFLFantasyPointsAllowed";

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
  return {
    opponent: null,
    location: null,
    samples: {
      "2026": {
        qb: sample(qb2026, "jkb-full-ppr-player-week", qb2026PerGame ?? qb2026),
        rb: sample(2),
        te: sample(3),
        wideWr: sample(4, "razzball-slot-wide-snapshot"),
        slotWr: sample(5, "razzball-slot-wide-snapshot"),
      },
      "2025": { qb: sample(30), rb: sample(31), te: sample(32), wideWr: null, slotWr: null },
      last5: { qb: sample(10), rb: sample(11), te: sample(12), wideWr: null, slotWr: null },
      last8: { qb: sample(15), rb: sample(16), te: sample(17), wideWr: null, slotWr: null },
    },
    ...rest,
  };
}

function artifact(): FantasyAllowedArtifact {
  return {
    schemaVersion: "nfl-fantasy-points-allowed-v1",
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

function stubFetch(data: FantasyAllowedArtifact) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("NFLFantasyPointsAllowed", () => {
  it("renders the 2026 sample by default with team/opponent formatting", async () => {
    stubFetch(artifact());
    render(<NFLFantasyPointsAllowed />);

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
    render(<NFLFantasyPointsAllowed />);

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
    render(<NFLFantasyPointsAllowed />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("15")).toBeInTheDocument(); // last8 qb rank for buf
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renders em dash for null Wide WR / Slot WR ranks outside the 2026 sample", async () => {
    stubFetch(artifact());
    render(<NFLFantasyPointsAllowed />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "2025" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    const dashCells = within(bufRow).getAllByText("—");
    expect(dashCells.length).toBeGreaterThanOrEqual(2); // wideWr + slotWr
  });

  it("sorts by a position column ascending then descending on repeat clicks", async () => {
    stubFetch(artifact());
    render(<NFLFantasyPointsAllowed />);
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
    render(<NFLFantasyPointsAllowed />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "Rank" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Raw" })).toHaveAttribute("aria-pressed", "false");
    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("20")).toBeInTheDocument();
    expect(within(bufRow).queryByText("5.4")).not.toBeInTheDocument();
  });

  it("Raw mode renders the per-game value with rank in parentheses, one decimal place", async () => {
    stubFetch(artifact());
    render(<NFLFantasyPointsAllowed />);
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
    render(<NFLFantasyPointsAllowed />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("—")).toBeInTheDocument();
    expect(within(bufRow).queryByText(/—\s*\(—\)/)).not.toBeInTheDocument();
  });

  it("switching display mode does not refetch the artifact", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact()) } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    render(<NFLFantasyPointsAllowed />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    fireEvent.click(screen.getByRole("button", { name: "Rank" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sample switching works while in Raw mode", async () => {
    stubFetch(artifact());
    render(<NFLFantasyPointsAllowed />);
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
    render(<NFLFantasyPointsAllowed />);
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
    render(<NFLFantasyPointsAllowed />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2025" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 8" })).toBeInTheDocument();
  });

  it("Rank mode position sorting still uses rank when raw values are present", async () => {
    stubFetch(artifact());
    render(<NFLFantasyPointsAllowed />);
    await waitFor(() => screen.getByText("BUF"));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    // Rank ascending: dal (rank 1) before buf (rank 20).
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });
});
