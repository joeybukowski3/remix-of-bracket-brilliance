import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TdsAllowedArtifact, TdsAllowedPositionSample, TdsAllowedRow } from "@/lib/nfl/tdsAllowed/types";
import NFLTdsAllowedByPosition from "./NFLTdsAllowedByPosition";

function sample(rank: number | null, perGame: number | null = rank): TdsAllowedPositionSample | null {
  if (rank == null) return null;
  return { rank, gamesSampled: 1, touchdownsAllowedTotal: rank, touchdownsAllowedPerGame: perGame, source: "nflverse-player-week" };
}

function row(overrides: Partial<TdsAllowedRow> & { team: string; qb2026?: number; qb2026PerGame?: number | null }): TdsAllowedRow {
  const { qb2026 = 1, qb2026PerGame = null, ...rest } = overrides;
  return {
    opponent: null,
    location: null,
    samples: {
      "2026": {
        qb: sample(qb2026, qb2026PerGame ?? qb2026),
        rb: sample(2),
        te: sample(3),
        wideWr: null,
        slotWr: null,
      },
      "2025": { qb: sample(30), rb: sample(31), te: sample(32), wideWr: null, slotWr: null },
      last5: { qb: sample(10), rb: sample(11), te: sample(12), wideWr: null, slotWr: null },
    },
    ...rest,
  };
}

function artifact(): TdsAllowedArtifact {
  return {
    schemaVersion: "nfl-tds-allowed-by-position-v1",
    generatedAt: "2026-09-17T00:00:00.000Z",
    season: 2026,
    week: 2,
    rows: [
      // Rank is deliberately the inverse of raw per-game value: buf has the worse (higher) rank
      // but the lower per-game value, proving raw-mode sort and display key off different fields than rank mode.
      row({ team: "buf", opponent: "mia", location: "@", qb2026: 20, qb2026PerGame: 0.4 }),
      row({ team: "dal", opponent: "was", location: "vs", qb2026: 1, qb2026PerGame: 2.6 }),
    ],
  };
}

function stubFetch(data: TdsAllowedArtifact) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("NFLTdsAllowedByPosition", () => {
  it("renders the 2026 sample by default with team/opponent formatting", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);

    const bufRow = await waitFor(() => screen.getByText("BUF").closest("tr"));
    expect(bufRow).not.toBeNull();
    expect(within(bufRow as HTMLElement).getByText("@ MIA")).toBeInTheDocument();
    expect(within(bufRow as HTMLElement).getByText("20")).toBeInTheDocument();

    const dalRow = screen.getByText("DAL").closest("tr") as HTMLElement;
    expect(within(dalRow).getByText("vs WAS")).toBeInTheDocument();
  });

  it("shows the Wide/Slot WR unavailable notice once at the page level, not per cell", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getAllByText("Wide/Slot WR touchdown splits are not currently available.")).toHaveLength(1);
  });

  it("renders em dash for null Wide WR / Slot WR ranks", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    const dashCells = within(bufRow).getAllByText("—");
    expect(dashCells.length).toBeGreaterThanOrEqual(2); // wideWr + slotWr
  });

  it("switches sample values when a tab is clicked, without refetching", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact()) } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    render(<NFLTdsAllowedByPosition />);

    await waitFor(() => screen.getByText("BUF"));
    expect(within(screen.getByText("BUF").closest("tr") as HTMLElement).getByText("20")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2025" }));

    const bufRowAfter = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRowAfter).getByText("30")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("defaults to Rank display mode", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "Rank" })).toHaveAttribute("aria-pressed", "true");
    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("20")).toBeInTheDocument();
    expect(within(bufRow).queryByText("0.4")).not.toBeInTheDocument();
  });

  it("Raw mode renders the per-game value with rank in parentheses, one decimal place", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("0.4")).toBeInTheDocument();
    expect(within(bufRow).getByText("(20)")).toBeInTheDocument();
  });

  it("switching display mode does not refetch the artifact", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact()) } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    fireEvent.click(screen.getByRole("button", { name: "Rank" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Raw mode position sorting uses the raw per-game value, not rank", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    // Raw per-game: buf=0.4, dal=2.6 -- ascending should put buf first, the opposite of rank-mode order (dal first).
    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    expect(bodyTeams()).toEqual(["BUF", "DAL"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });

  it("Rank mode position sorting uses rank when raw values are present", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    fireEvent.click(screen.getByRole("button", { name: "Sort by QB" }));
    // Rank ascending: dal (rank 1) before buf (rank 20).
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });
});
