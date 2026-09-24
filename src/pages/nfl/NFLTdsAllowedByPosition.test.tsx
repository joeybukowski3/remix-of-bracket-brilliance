import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TdsAllowedArtifact, TdsAllowedPositionSample, TdsAllowedRow } from "@/lib/nfl/tdsAllowed/types";
import NFLTdsAllowedByPosition from "./NFLTdsAllowedByPosition";

function sample(rank: number | null, total: number | null = rank, perGame: number | null = rank): TdsAllowedPositionSample | null {
  if (rank == null) return null;
  return { rank, gamesSampled: 1, touchdownsAllowedTotal: total, touchdownsAllowedPerGame: perGame, source: "nflverse-player-week" };
}

function row(
  overrides: Partial<TdsAllowedRow> & {
    team: string;
    qb2026?: number;
    qb2026Total?: number | null;
    wr2026?: number;
    wr2026Total?: number | null;
  },
): TdsAllowedRow {
  const { qb2026 = 1, qb2026Total = null, wr2026 = 6, wr2026Total = null, ...rest } = overrides;
  return {
    opponent: null,
    location: null,
    // Rank values are distinct across every column and sample so getByText assertions stay unambiguous.
    samples: {
      "2026": {
        qbPass: sample(qb2026, qb2026Total ?? qb2026),
        qbRush: sample(8),
        rbRush: sample(2),
        rbRec: sample(5),
        wrRec: sample(wr2026, wr2026Total ?? wr2026),
        teRec: sample(3),
      },
      "2025": { qbPass: sample(30), qbRush: sample(27), rbRush: sample(31), rbRec: sample(26), wrRec: sample(29), teRec: sample(32) },
      last5: { qbPass: sample(10), qbRush: sample(18), rbRush: sample(11), rbRec: sample(19), wrRec: sample(9), teRec: sample(12) },
      last8: { qbPass: sample(15), qbRush: sample(21), rbRush: sample(16), rbRec: sample(23), wrRec: sample(14), teRec: sample(17) },
    },
    ...rest,
  };
}

function artifact(): TdsAllowedArtifact {
  return {
    schemaVersion: "nfl-tds-allowed-by-position-v2",
    generatedAt: "2026-09-17T00:00:00.000Z",
    season: 2026,
    week: 2,
    rows: [
      // Rank is deliberately the inverse of the raw total: buf has the worse (higher) rank
      // but the lower total, proving raw-mode sort and display key off different fields than rank mode.
      row({ team: "buf", opponent: "mia", location: "@", qb2026: 20, qb2026Total: 4, wr2026: 22, wr2026Total: 7 }),
      row({ team: "dal", opponent: "was", location: "vs", qb2026: 1, qb2026Total: 29, wr2026: 2, wr2026Total: 27 }),
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

  it("renders exactly the six scoring-method columns in order, with no old QB/RB/WR/TE or Wide/Slot WR headers", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const sortButtons = screen
      .getAllByRole("button", { name: /^Sort by / })
      .map((button) => button.getAttribute("aria-label"));
    expect(sortButtons).toEqual([
      "Sort by Team",
      "Sort by Opp",
      "Sort by QB PASS",
      "Sort by QB RUSH",
      "Sort by RB RUSH",
      "Sort by RB REC",
      "Sort by WR REC",
      "Sort by TE REC",
    ]);
    for (const old of ["QB", "RB", "WR", "TE", "Wide WR", "Slot WR"]) {
      expect(screen.queryByRole("button", { name: `Sort by ${old}` })).not.toBeInTheDocument();
    }
  });

  it("renders each scoring-method header as a compact two-line label", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const header = screen.getByRole("button", { name: "Sort by QB RUSH" });
    expect(within(header).getByText("QB")).toBeInTheDocument();
    expect(within(header).getByText("RUSH")).toBeInTheDocument();
  });

  it("explains that a touchdown pass appears in both QB PASS and the receiver column", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByText(/touchdown pass appears in both QB PASS and the receiver's column/)).toBeInTheDocument();
  });

  it("notes that touchdown types outside the six categories are not shown, without adding columns for them", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByText(/outside these six scoring-method categories/)).toHaveTextContent(
      /non-QB passing TDs, WR\/TE rushing TDs, QB receiving TDs, other-position offensive TDs\) are not shown/,
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(8); // Team, Opp + exactly six categories
  });

  it("renders every category cell's rank for a team (2026 sample)", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    for (const rank of ["20", "8", "2", "5", "22", "3"]) {
      expect(within(bufRow).getByText(rank)).toBeInTheDocument();
    }
  });

  it("no longer shows the old Wide/Slot WR unavailable notice", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.queryByText(/Wide\/Slot WR touchdown splits are not currently available\./)).not.toBeInTheDocument();
  });

  it("renders the WR cell's rank value, not a dash, for every position column", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("22")).toBeInTheDocument(); // wr rank for buf
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
    expect(within(bufRowAfter).getByText("29")).toBeInTheDocument(); // wr rank in 2025 sample
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shows a Last 8 sample tab and switches to it without refetching, with WR REC populated", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(artifact()) } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Last 8" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("15")).toBeInTheDocument(); // last8 qb rank for buf
    expect(within(bufRow).getByText("14")).toBeInTheDocument(); // last8 wr rank for buf
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Last 5 also exposes a populated WR REC value", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Last 5" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("9")).toBeInTheDocument(); // last5 wr rank for buf
  });

  it("defaults to Rank display mode", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "Rank" })).toHaveAttribute("aria-pressed", "true");
    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("20")).toBeInTheDocument();
    expect(within(bufRow).queryByText("4")).not.toBeInTheDocument();
  });

  it("Raw mode renders the whole-number total touchdown count with rank in parentheses (no decimal), including WR REC", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    expect(within(bufRow).getByText("4")).toBeInTheDocument();
    expect(within(bufRow).getByText("(20)")).toBeInTheDocument();
    expect(within(bufRow).getByText("7")).toBeInTheDocument(); // wr raw total for buf
    expect(within(bufRow).getByText("(22)")).toBeInTheDocument(); // wr rank in parens
    expect(within(bufRow).queryByText("4.0")).not.toBeInTheDocument();
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

  it("Raw mode position sorting uses the raw total value, not rank", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    // Raw total: buf=4, dal=29 -- ascending should put buf first, the opposite of rank-mode order (dal first).
    fireEvent.click(screen.getByRole("button", { name: "Sort by QB PASS" }));
    expect(bodyTeams()).toEqual(["BUF", "DAL"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort by QB PASS" }));
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });

  it("WR Raw mode sorting uses the raw total value, not rank", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    // WR raw total: buf=3, dal=27 -- ascending should put buf first, the opposite of rank-mode order (dal first, rank 2 vs 22).
    fireEvent.click(screen.getByRole("button", { name: "Sort by WR REC" }));
    expect(bodyTeams()).toEqual(["BUF", "DAL"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort by WR REC" }));
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });

  it("WR Rank mode sorting uses rank, not raw total", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    // WR rank: dal=2, buf=22 -- ascending should put dal first.
    fireEvent.click(screen.getByRole("button", { name: "Sort by WR REC" }));
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });

  it("renders all four sample controls (mobile chip row wraps, never hides options)", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    expect(screen.getByRole("button", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2025" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 8" })).toBeInTheDocument();
  });

  it("Rank mode position sorting uses rank when raw values are present", async () => {
    stubFetch(artifact());
    render(<NFLTdsAllowedByPosition />);
    await waitFor(() => screen.getByText("BUF"));

    const bodyTeams = () => screen.getAllByRole("row").slice(1).map((tr) => within(tr).getByText(/^(BUF|DAL)$/).textContent);

    fireEvent.click(screen.getByRole("button", { name: "Sort by QB PASS" }));
    // Rank ascending: dal (rank 1) before buf (rank 20).
    expect(bodyTeams()).toEqual(["DAL", "BUF"]);
  });
});
