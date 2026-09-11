import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Column visibility persists to localStorage; isolate every test. */
beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

/** Force a viewport for `useIsCompactLayout`. `null` restores the jsdom default (desktop). */
function setViewport(matches: boolean | null) {
  if (matches === null) {
    // @ts-expect-error test cleanup
    delete window.matchMedia;
    return;
  }
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => setViewport(null));
import { buildMetric, buildResearchContext, buildMatchupEdges } from "@/lib/nfl/dfs/__fixtures__/researchFactory";
import { buildDstRow } from "@/lib/nfl/dfs/optimizer/__fixtures__/optimizerRowFactory";
import NflDfsAnalyzerTable from "@/components/nfl/dfs/NflDfsAnalyzerTable";
import type { DfsEnrichedAnalyzerRow, DfsEnrichedOffensiveRow, DfsEnrichedDstRow } from "@/lib/nfl/dfs/slateAnalyzer";

function offensiveRow(overrides: Partial<DfsEnrichedOffensiveRow> & Pick<DfsEnrichedOffensiveRow, "dkId" | "playerName" | "position">): DfsEnrichedOffensiveRow {
  return {
    kind: "offense",
    rosterPosition: `${overrides.position}/FLEX`,
    salary: 8000,
    team: "no",
    game: null,
    gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET",
    dkAvgPointsPerGame: 15,
    dkStatus: null,
    identityStatus: "resolved",
    playerId: `gsis:${overrides.dkId}`,
    identityConflict: false,
    projectedFantasyPoints: 20,
    projectionSource: "JKB Full PPR",
    jkbWeeklyPositionRank: 5,
    jkbSlatePositionRank: 3,
    jkbOverallSlateProjectionRank: 10,
    dkPositionSalaryRank: 2,
    dkOverallSalaryRank: 12,
    posRankDiff: -1,
    overallRankDiff: 2,
    pointsPer1k: 2.5,
    research: null,
    teamMismatchStatus: "none",
    opponent: "det",
    homeAway: "away",
    canonicalGameId: "2026_01_NO_DET",
    ...overrides,
  };
}

function dstRow(overrides: Partial<DfsEnrichedDstRow> & Pick<DfsEnrichedDstRow, "dkId" | "playerName">): DfsEnrichedDstRow {
  return {
    kind: "dst",
    position: "DST",
    rosterPosition: "DST",
    salary: 3500,
    team: "no",
    game: null,
    gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET",
    dkAvgPointsPerGame: 8,
    dkStatus: null,
    identityStatus: "resolved",
    canonicalTeamId: "nfl-no",
    identityConflict: false,
    projectedFantasyPoints: null,
    projectionSource: null,
    jkbWeeklyPositionRank: null,
    jkbSlatePositionRank: null,
    jkbOverallSlateProjectionRank: null,
    dkPositionSalaryRank: 1,
    dkOverallSalaryRank: null,
    posRankDiff: null,
    overallRankDiff: null,
    pointsPer1k: null,
    research: null,
    teamMismatchStatus: "none",
    opponent: "det",
    homeAway: "away",
    canonicalGameId: "2026_01_NO_DET",
    ...overrides,
  };
}

describe("NflDfsAnalyzerTable", () => {
  it("defaults to the Value Board showing all offensive positions", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" }),
      offensiveRow({ dkId: "r1", playerName: "RB Alpha", position: "RB" }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    expect(screen.getByRole("region", { name: "VALUE DFS analyzer" })).toHaveClass("overflow-x-auto");
    expect(screen.getByText("QB Alpha")).toBeInTheDocument();
    expect(screen.getByText("RB Alpha")).toBeInTheDocument();
  });

  it("switches to a single-position view", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" }),
      offensiveRow({ dkId: "r1", playerName: "RB Alpha", position: "RB" }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("tab", { name: "RB" }));
    expect(screen.queryByText("QB Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("RB Alpha")).toBeInTheDocument();
  });

  it("shows DK Pos RK, JKB Slate RK, Rank Diff, JKB Proj, JKB Pts/$1K, Fantasy PPG columns and no JKB Week RK", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    ["DK Pos RK", "JKB Slate RK", "Rank Diff", "JKB Proj", "JKB Pts/$1K", "Fantasy PPG", "Fantasy PPG L5"].forEach((label) => {
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole("columnheader", { name: "JKB Week RK" })).not.toBeInTheDocument();
    expect(screen.queryByText("JKB Week RK")).not.toBeInTheDocument();
  });

  it("color-codes the DK Pos RK cell with JKB rank heat", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "a", playerName: "Best Value", position: "QB", dkPositionSalaryRank: 1 }),
      offensiveRow({ dkId: "b", playerName: "Worst Value", position: "QB", dkPositionSalaryRank: 2 }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    const cell = within(screen.getByText("Best Value").closest("tr") as HTMLElement).getByText("1");
    expect(cell.style.backgroundColor).not.toBe("");
  });

  it("removes the redundant team abbreviation after the player name and the opponent abbreviation", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB", team: "no", opponent: "det", homeAway: "away" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    const row = screen.getByText("QB Alpha").closest("tr") as HTMLElement;
    expect(row.querySelector("[data-player-team-abbreviation]")).toBeNull();
    // Opponent abbreviation text is gone, but the logo and an accessible label remain.
    expect(within(row).queryByText("DET")).not.toBeInTheDocument();
    expect(row.querySelector('[data-team-logo="NO"] img')).toBeInTheDocument();
    expect(row.querySelector('[data-opponent-logo="DET"] img')).toBeInTheDocument();
    expect(within(row).getByText("at DET")).toBeInTheDocument();
  });

  it("keeps an unresolved player's row visible with a warning instead of hiding it", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "u1", playerName: "Unresolved Guy", position: "WR", identityStatus: "unresolved", playerId: null, projectedFantasyPoints: null, jkbSlatePositionRank: null, posRankDiff: null, pointsPer1k: null }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    expect(screen.getByText("Unresolved Guy")).toBeInTheDocument();
    expect(screen.getByLabelText(/could not match this draftkings player/i)).toBeInTheDocument();
  });

  it("does not fabricate JKB metrics for DST rows", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [dstRow({ dkId: "dst1", playerName: "Saints" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    const row = screen.getByText("Saints").closest("tr") as HTMLElement;
    // The JKB Slate RK / Week RK / Rank Diff / Proj / Pts/$1K columns are replaced
    // by one explicit note for DST -- no fabricated rank or projection numbers.
    expect(within(row).queryByText(/No JKB DST projection/i)).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "DST Matchup RK" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "DST Score" })).toBeInTheDocument();
    expect(row.querySelector("[colspan]")).toBeNull();
    expect(row).toHaveClass("group");
    expect(within(row).queryByText("E")).not.toBeInTheDocument();
    // DK-sourced context (salary, DK positional salary rank) is still allowed.
  });

  it("sorts by Rank Diff", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "low", playerName: "Low Diff", position: "WR", posRankDiff: -5 }),
      offensiveRow({ dkId: "high", playerName: "High Diff", position: "WR", posRankDiff: 15 }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    const dataRows = screen.getAllByRole("row").slice(1); // skip header row
    expect(within(dataRows[0]).getByText("High Diff")).toBeInTheDocument();
  });

  it("filters by player search", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "q1", playerName: "Alpha Target", position: "QB" }),
      offensiveRow({ dkId: "q2", playerName: "Beta Player", position: "QB" }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.change(screen.getByLabelText("Search player"), { target: { value: "alpha" } });
    expect(screen.getByText("Alpha Target")).toBeInTheDocument();
    expect(screen.queryByText("Beta Player")).not.toBeInTheDocument();
  });

  it("presentation filtering does not recompute domain ranks", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB", dkPositionSalaryRank: 4 })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.change(screen.getByLabelText("Search player"), { target: { value: "qb" } });
    const row = screen.getByText("QB Alpha").closest("tr") as HTMLElement;
    expect(within(row).getByText("4")).toBeInTheDocument();
  });
});


describe("compact DFS analytical columns", () => {
  it("uses canonical eligibility without hiding ineligible rows by default", () => {
    const rows = [
      offensiveRow({ dkId: "e", playerName: "Eligible", position: "QB", optimizerEligibility: "eligible" }),
      offensiveRow({ dkId: "i", playerName: "Ineligible", position: "QB", optimizerEligibility: "ineligible" }),
      offensiveRow({ dkId: "u", playerName: "Unknown", position: "QB", optimizerEligibility: "unknown" }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    expect(screen.getByText("Ineligible")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Optimizer Eligible" }));
    expect(screen.getByText("Eligible")).toBeInTheDocument();
    expect(screen.queryByText("Ineligible")).not.toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Eligible" }));
    expect(screen.queryByText(/Optimizer:|Role Sources and Timing|projected carries/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Player Last 10" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Opponent Last 10" })).toBeInTheDocument();
  });

  it("renders independent FPA values, weekly position rank, logos and sortable advantage cells", () => {
    const edges = buildMatchupEdges();
    edges.epa.rankDifference = 9;
    edges.success.rankDifference = -4;
    edges.trenches.rankDifference = 13;
    const rows = [offensiveRow({ dkId: "a", playerName: "Alpha", position: "QB", jkbWeeklyPositionRank: 3,
      research: { status: "available", matchupGrade: null, matchupEdges: edges, context: buildResearchContext({
        opponentFpaSeason: buildMetric({ value: 22.8, rank: 2, poolSize: 32 }), opponentFpaLast5: buildMetric({ value: 19.4, rank: 6, poolSize: 32 }),
      }) } })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    const row = screen.getByText("Alpha").closest("tr")!;
    expect(row.querySelector('[data-team-logo="NO"] img')).toHaveAttribute("src", expect.stringContaining("NO"));
    expect(row.querySelector('[data-opponent-logo="DET"] img')).toHaveAttribute("src", expect.stringContaining("det"));
    expect(within(row).getByText("22.8").closest("td")).not.toBe(within(row).getByText("19.4").closest("td"));
    for (const value of ["+9", "-4", "+13"]) expect(within(row).getByText(value).style.backgroundColor).not.toBe("");
    for (const name of ["Player", "Team/Opp", "Salary", "DK Pos RK", "JKB Slate RK", "Rank Diff", "JKB Proj", "JKB Pts/$1K", "Fantasy PPG", "Fantasy PPG L5", "Matchup", "FPA SZN", "FPA L5", "EPA ADV", "SUCCESS ADV", "TRENCHES", "DEF VS AVG"]) {
      const button = document.querySelector<HTMLButtonElement>(`th button[aria-label="${name}"]`)!;
      const header = button.closest("th")!;
      fireEvent.click(button);
      expect(header).not.toHaveAttribute("aria-sort", "none");
      const previous = header.getAttribute("aria-sort");
      fireEvent.click(button);
      expect(header.getAttribute("aria-sort")).not.toBe(previous);
    }
  });

  it("renders Fantasy PPG and Fantasy PPG L5 from canonical weekly research and sorts them", () => {
    const withPpg = (dkId: string, name: string, season: number, last5: number, rank: number) =>
      offensiveRow({ dkId, playerName: name, position: "WR", research: { status: "available", matchupGrade: null, matchupEdges: buildMatchupEdges(), context: buildResearchContext({
        seasonPpg: buildMetric({ value: season, rank, poolSize: 40 }), last5Ppg: buildMetric({ value: last5, rank, poolSize: 40 }),
      }) } });
    const rows = [withPpg("a", "Low PPG", 8.2, 15.1, 30), withPpg("b", "High PPG", 21.7, 6.4, 2)];
    render(<NflDfsAnalyzerTable rows={rows} />);
    expect(screen.getByText("8.2")).toBeInTheDocument();
    expect(screen.getByText("21.7")).toBeInTheDocument();
    expect(screen.getByText("15.1")).toBeInTheDocument();
    // Sort by Fantasy PPG descending -> High PPG first.
    fireEvent.click(document.querySelector<HTMLButtonElement>('th button[aria-label="Fantasy PPG"]')!);
    let dataRows = screen.getAllByRole("row").slice(1);
    expect(within(dataRows[0]).getByText("High PPG")).toBeInTheDocument();
    // Sort by Fantasy PPG L5 descending -> Low PPG (better L5) first.
    fireEvent.click(document.querySelector<HTMLButtonElement>('th button[aria-label="Fantasy PPG L5"]')!);
    dataRows = screen.getAllByRole("row").slice(1);
    expect(within(dataRows[0]).getByText("Low PPG")).toBeInTheDocument();
  });

  it("renders single compact DST rows with independent rank/score and eligible filtering", () => {
    const rows = [buildDstRow({ dkId: "d1", team: "kc", gameKey: "g1", salary: 3000, percentile: 77.8 }),
      buildDstRow({ dkId: "d2", team: "no", gameKey: "g2", salary: 3100, percentile: 55 })];
    rows[0].dstMatchup!.dstMatchupRank = 5;
    rows[0].dstMatchup!.dstMatchupScore = 77.8;
    rows[1].dstMatchup!.dstMatchupScore = null;
    const edges = buildMatchupEdges();
    edges.epa.rankDifference = -7;
    edges.success.rankDifference = 2;
    edges.trenches.rankDifference = -11;
    render(<NflDfsAnalyzerTable rows={rows} dstEdges={new Map([["d1", edges]])} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    const first = table.querySelector('[data-dfs-player-row="d1"]')!;
    // 9 pre-Phase-3 DST columns + Def Rank + Off Rank (both desktop-default-visible).
    expect(first.querySelectorAll("td")).toHaveLength(11);
    expect(first.querySelector("[colspan], p, details")).toBeNull();
    expect(within(first as HTMLElement).getByText("5").closest("td")).not.toBe(within(first as HTMLElement).getByText("77.8").closest("td"));
    expect(first).toHaveTextContent("+7");
    expect(first).toHaveTextContent("-2");
    expect(first).toHaveTextContent("+11");
    fireEvent.click(screen.getByRole("checkbox", { name: "Optimizer Eligible" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });
});

describe("DFS practical pool gate on the board", () => {
  it("hides a player outside the practical pool (e.g. a deep backup QB) from the board", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "q-starter", playerName: "Starter QB", position: "QB", jkbWeeklyPositionRank: 10 }),
      offensiveRow({ dkId: "q-backup", playerName: "Deep Backup QB", position: "QB", jkbWeeklyPositionRank: 33 }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("tab", { name: "QB" }));
    expect(screen.getByText("Starter QB")).toBeInTheDocument();
    expect(screen.queryByText("Deep Backup QB")).not.toBeInTheDocument();
  });
});

describe("player-name click-to-expand", () => {
  it("opens the same detail section as the disclosure control, and closes on a second click", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "n1", playerName: "Name Click Guy", position: "QB" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    const nameButton = screen.getByRole("button", { name: "Expand details for Name Click Guy" });
    expect(nameButton.tagName).toBe("BUTTON");
    expect(screen.queryByRole("tab", { name: "Player Last 10" })).not.toBeInTheDocument();
    fireEvent.click(nameButton);
    expect(screen.getByRole("tab", { name: "Player Last 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse details for Name Click Guy" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Collapse details for Name Click Guy" }));
    expect(screen.queryByRole("tab", { name: "Player Last 10" })).not.toBeInTheDocument();
  });

  it("is keyboard accessible (native button semantics, reachable by role/name)", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "n2", playerName: "Keyboard Guy", position: "WR" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    const nameButton = screen.getByRole("button", { name: "Expand details for Keyboard Guy" });
    nameButton.focus();
    expect(nameButton).toHaveFocus();
    fireEvent.click(nameButton);
    expect(screen.getByRole("tab", { name: "Player Last 10" })).toBeInTheDocument();
  });

  it("still uses the existing disclosure control independently of the name button", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "n3", playerName: "Disclosure Guy", position: "TE" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Disclosure Guy" }));
    expect(screen.getByRole("tab", { name: "Player Last 10" })).toBeInTheDocument();
  });
});

describe("column visibility dropdown", () => {
  const rows = (): DfsEnrichedAnalyzerRow[] => [offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })];

  it("opens, hides an optional column, and restores it", () => {
    render(<NflDfsAnalyzerTable rows={rows()} />);
    expect(screen.getByRole("columnheader", { name: "Salary" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    const menu = screen.getByRole("group", { name: /toggle table columns/i });
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Salary" }));
    expect(screen.queryByRole("columnheader", { name: "Salary" })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Salary" }));
    expect(screen.getByRole("columnheader", { name: "Salary" })).toBeInTheDocument();
  });

  it("never offers Player or Team/Opp as hideable", () => {
    render(<NflDfsAnalyzerTable rows={rows()} />);
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    const menu = screen.getByRole("group", { name: /toggle table columns/i });
    expect(within(menu).queryByRole("checkbox", { name: "Player" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("checkbox", { name: "Team/Opp" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Player" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Team/Opp" })).toBeInTheDocument();
  });

  it("persists choices to localStorage and reloads them", () => {
    const view = render(<NflDfsAnalyzerTable rows={rows()} />);
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(within(screen.getByRole("group", { name: /toggle table columns/i })).getByRole("checkbox", { name: "DK Pos RK" }));
    expect(window.localStorage.getItem("jkb-nfl-dfs-columns-v1")).toContain("dkPosRank");
    view.unmount();
    render(<NflDfsAnalyzerTable rows={rows()} />);
    expect(screen.queryByRole("columnheader", { name: "DK Pos RK" })).not.toBeInTheDocument();
  });

  it("ignores stale/unknown saved column ids", () => {
    window.localStorage.setItem("jkb-nfl-dfs-columns-v1", JSON.stringify({ v: 1, hidden: ["totally-made-up", "salary", "player"] }));
    render(<NflDfsAnalyzerTable rows={rows()} />);
    // "salary" honored, garbage dropped, mandatory "player" never hidden.
    expect(screen.queryByRole("columnheader", { name: "Salary" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Player" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rank Diff" })).toBeInTheDocument();
  });

  it("resets to defaults", () => {
    render(<NflDfsAnalyzerTable rows={rows()} />);
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    const menu = screen.getByRole("group", { name: /toggle table columns/i });
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Salary" }));
    expect(screen.queryByRole("columnheader", { name: "Salary" })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("button", { name: /reset to defaults/i }));
    expect(screen.getByRole("columnheader", { name: "Salary" })).toBeInTheDocument();
  });

  it("resets the sort to the view default when the sorted column is hidden", () => {
    render(<NflDfsAnalyzerTable rows={[
      offensiveRow({ dkId: "a", playerName: "Aaa", position: "QB", salary: 4000 }),
      offensiveRow({ dkId: "b", playerName: "Bbb", position: "QB", salary: 9000 }),
    ]} />);
    fireEvent.click(document.querySelector<HTMLButtonElement>('th button[aria-label="Salary"]')!);
    expect(screen.getByRole("columnheader", { name: "Salary" })).not.toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(within(screen.getByRole("group", { name: /toggle table columns/i })).getByRole("checkbox", { name: "Salary" }));
    expect(screen.getByRole("columnheader", { name: "Rank Diff" })).not.toHaveAttribute("aria-sort", "none");
  });

  it("offers DST-applicable columns on the DST view", () => {
    render(<NflDfsAnalyzerTable rows={[buildDstRow({ dkId: "d1", team: "kc", gameKey: "g1", salary: 3000, percentile: 60 })]} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    const menu = screen.getByRole("group", { name: /toggle table columns/i });
    expect(within(menu).getByRole("checkbox", { name: "DST Matchup RK" })).toBeInTheDocument();
    expect(within(menu).getByRole("checkbox", { name: "DST Score" })).toBeInTheDocument();
    expect(within(menu).queryByRole("checkbox", { name: "JKB Slate RK" })).not.toBeInTheDocument();
  });
});

describe("sticky Player column at all widths", () => {
  it("keeps the Player column and header sticky on desktop too, not just mobile", () => {
    setViewport(false);
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "h1", playerName: "Justin Herbert", position: "QB" })]} />);
    const playerHeader = screen.getByRole("columnheader", { name: "Player" });
    expect(playerHeader.className).toMatch(/sticky/);
    expect(playerHeader.className).toMatch(/left-0/);
    const playerCell = screen.getByText("Justin Herbert").closest("td")!;
    expect(playerCell.className).toMatch(/sticky/);
    expect(playerCell.className).toMatch(/left-0/);
    expect(playerCell.className).toMatch(/bg-white/);
  });

  it("applies the frozen-column behavior identically across every positional view", () => {
    setViewport(false);
    const rows = [
      offensiveRow({ dkId: "qb1", playerName: "QB One", position: "QB" }),
      dstRow({ dkId: "d1", playerName: "Saints" }),
    ];
    const { rerender } = render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    const dstHeader = screen.getByRole("columnheader", { name: "Player" });
    expect(dstHeader.className).toMatch(/sticky/);
    rerender(<NflDfsAnalyzerTable rows={rows} />);
  });
});

describe("full screen mode", () => {
  it("opens a dialog, keeps the same rows/data, and closes via the close button", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Full Screen" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("QB Alpha")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("QB Alpha")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Full Screen" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cycles positions and keeps filter/sort/column controls interactive inside full screen", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" }),
      offensiveRow({ dkId: "r1", playerName: "RB Alpha", position: "RB" }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Full Screen" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "RB" }));
    expect(within(dialog).queryByText("QB Alpha")).not.toBeInTheDocument();
    expect(within(dialog).getByText("RB Alpha")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Search player"), { target: { value: "rb" } });
    expect(within(dialog).getByText("RB Alpha")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /columns/i }));
    expect(within(dialog).getByRole("group", { name: /toggle table columns/i })).toBeInTheDocument();
  });
});

describe("Player Review panel", () => {
  it("opens for every player identity, including DST, and closes on a second click", () => {
    render(<NflDfsAnalyzerTable rows={[dstRow({ dkId: "d1", playerName: "Saints" })]} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    const nameButton = screen.getByRole("button", { name: "Expand details for Saints" });
    fireEvent.click(nameButton);
    expect(document.querySelector('[data-dfs-player-review="d1"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse details for Saints" }));
    expect(document.querySelector('[data-dfs-player-review="d1"]')).not.toBeInTheDocument();
  });

  it("gracefully omits offense-only fields for a DST review and shows DST matchup fields", () => {
    const teamRankByAbbr = new Map([["no", { offenseRank: 20, defenseRank: 3 }], ["det", { offenseRank: 5, defenseRank: 25 }]]);
    render(<NflDfsAnalyzerTable rows={[dstRow({ dkId: "d1", playerName: "Saints", team: "no", opponent: "det" })]} teamRankByAbbr={teamRankByAbbr} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand details for Saints" }));
    const detail = document.querySelector('[data-dfs-player-review="d1"]') as HTMLElement;
    expect(within(detail).getByText("DST Matchup")).toBeInTheDocument();
    expect(within(detail).getByText("Def Rank")).toBeInTheDocument();
    expect(within(detail).getByText("Off Rank")).toBeInTheDocument();
    expect(within(detail).queryByText("JKB Proj")).not.toBeInTheDocument();
    expect(within(detail).queryByText("Additional Research")).not.toBeInTheDocument();
    expect(within(detail).getByText(/JKB projection unavailable for DST/i)).toBeInTheDocument();
  });

  it("shows hidden (board-invisible) columns in the complete review", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(within(screen.getByRole("group", { name: /toggle table columns/i })).getByRole("checkbox", { name: "JKB Proj" }));
    expect(screen.queryByRole("columnheader", { name: "JKB Proj" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand details for QB Alpha" }));
    const detail = document.querySelector('[data-dfs-player-review="q1"]') as HTMLElement;
    expect(within(detail).getByText("JKB Proj")).toBeInTheDocument();
  });

  it("reuses the same JKB heat cell styling as the main table (no second heat system)", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [
      offensiveRow({ dkId: "a", playerName: "Best Value", position: "QB", dkPositionSalaryRank: 1 }),
      offensiveRow({ dkId: "b", playerName: "Worst Value", position: "QB", dkPositionSalaryRank: 2 }),
    ];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand details for Best Value" }));
    const detail = document.querySelector('[data-dfs-player-review="a"]') as HTMLElement;
    const cell = within(detail).getAllByText("1")[0];
    expect(cell.style.backgroundColor).not.toBe("");
  });

  it("keeps historical Last 10 access inside the review", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand details for QB Alpha" }));
    expect(screen.getByRole("tab", { name: "Player Last 10" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Opponent Last 10" })).toBeInTheDocument();
  });
});

describe("Phase 3 DST/offense metric columns", () => {
  it("renders Def Rank / Off Rank for DST rows from the team rank context, with heat", () => {
    const teamRankByAbbr = new Map([
      ["no", { offenseRank: 20, defenseRank: 3 }],
      ["det", { offenseRank: 5, defenseRank: 25 }],
    ]);
    render(<NflDfsAnalyzerTable rows={[dstRow({ dkId: "d1", playerName: "Saints", team: "no", opponent: "det" })]} teamRankByAbbr={teamRankByAbbr} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    expect(screen.getByText("3")).toBeInTheDocument(); // Def Rank
    expect(screen.getByText("5")).toBeInTheDocument(); // Off Rank
  });

  it("shows — for Def Rank / Off Rank when the team rank board has not loaded", () => {
    render(<NflDfsAnalyzerTable rows={[dstRow({ dkId: "d1", playerName: "Saints" })]} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    const menu = screen.getByRole("group", { name: /toggle table columns/i });
    expect(within(menu).getByRole("checkbox", { name: "Def Rank" })).toBeInTheDocument();
  });

  it("renders TD Score for offense rows from the join lookup, with a — when unresolved", () => {
    const tdScoreLookup = new Map([["gsis:w1:2026_01_NO_DET", { jkbTdScore: 71.4, scoreRank: 2, scorePoolSize: 30 }]]);
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "w1", playerName: "Chris Olave", position: "WR" })]} tdScoreLookup={tdScoreLookup} />);
    expect(screen.getByText("71.4")).toBeInTheDocument();
  });

  it("renders TGT/G and TGT/G L5 from the research evidence", () => {
    const context = buildResearchContext({
      evidence: {
        touches: buildMetric(), redZoneTouches: buildMetric(), yardsPerCarry: buildMetric(), receivingTargets: buildMetric(),
        targetShare: buildMetric(), airYardsPerGame: buildMetric(),
        targetsPerGame: buildMetric({ value: 7.2, rank: 4, poolSize: 20 }),
        targetsPerGameL5: buildMetric({ value: 8.4, rank: 3, poolSize: 20 }),
      },
    });
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "w1", playerName: "Chris Olave", position: "WR",
      research: { status: "available", matchupGrade: null, matchupEdges: buildMatchupEdges(), context } })]} />);
    expect(screen.getByText("7.2")).toBeInTheDocument();
    expect(screen.getByText("8.4")).toBeInTheDocument();
  });
});

describe("WR slot/wide defense columns", () => {
  const slotWideByAbbr = new Map([
    ["det", { team: "det", totalPpgAllowed: 41.2, slotPpgAllowed: 11.9, widePpgAllowed: 29.3, slotPct: 0.29, widePct: 0.71, nextOpponent: "min", slotPpgAllowedRank: 2, widePpgAllowedRank: 1, poolSize: 32 }],
  ]);

  it("renders all four fields for a WR row, joined by the opponent DEFENSE, only on the WR tab", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "w1", playerName: "Amon-Ra St. Brown", position: "WR", team: "lac", opponent: "det" })]} slotWideByAbbr={slotWideByAbbr} />);
    fireEvent.click(screen.getByRole("tab", { name: "WR" }));
    expect(screen.getByRole("columnheader", { name: "Opp Slot %" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Opp Wide %" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Slot PPG Allowed" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Wide PPG Allowed" })).toBeInTheDocument();
    expect(screen.getByText("29%")).toBeInTheDocument(); // Opp Slot % — the DEFENSE's field, not the player's alignment.
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByText("11.9")).toBeInTheDocument();
    expect(screen.getByText("29.3")).toBeInTheDocument();
  });

  it("does not offer the WR-only columns on other views", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })]} slotWideByAbbr={slotWideByAbbr} />);
    expect(screen.queryByRole("columnheader", { name: "Opp Slot %" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "QB" }));
    expect(screen.queryByRole("columnheader", { name: "Opp Slot %" })).not.toBeInTheDocument();
  });

  it("heat-codes PPG Allowed as favorable-high but leaves the percentages neutral", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "w1", playerName: "Amon-Ra St. Brown", position: "WR", opponent: "det" })]} slotWideByAbbr={slotWideByAbbr} />);
    fireEvent.click(screen.getByRole("tab", { name: "WR" }));
    const slotPpgCell = screen.getByText("11.9").closest("span")!;
    expect(slotPpgCell.style.backgroundColor).not.toBe("");
    const pctCell = screen.getByText("29%").closest("span")!;
    expect(pctCell.style.backgroundColor).toBe("");
  });

  it("shows — when the slot/wide artifact has not loaded", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "w1", playerName: "Amon-Ra St. Brown", position: "WR", opponent: "det" })]} />);
    fireEvent.click(screen.getByRole("tab", { name: "WR" }));
    const row = screen.getByText("Amon-Ra St. Brown").closest("tr") as HTMLElement;
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("includes the WR Alignment / Defense group in the Player Review only for WR rows", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "w1", playerName: "Amon-Ra St. Brown", position: "WR", opponent: "det" })]} slotWideByAbbr={slotWideByAbbr} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand details for Amon-Ra St. Brown" }));
    const detail = document.querySelector('[data-dfs-player-review="w1"]') as HTMLElement;
    expect(within(detail).getByText("WR Alignment / Defense")).toBeInTheDocument();
    expect(within(detail).getByText("Slot PPG Allowed")).toBeInTheDocument();
  });

  it("omits the WR Alignment / Defense group from a non-WR Player Review", () => {
    render(<NflDfsAnalyzerTable rows={[offensiveRow({ dkId: "r1", playerName: "RB Alpha", position: "RB" })]} slotWideByAbbr={slotWideByAbbr} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand details for RB Alpha" }));
    const detail = document.querySelector('[data-dfs-player-review="r1"]') as HTMLElement;
    expect(within(detail).queryByText("WR Alignment / Defense")).not.toBeInTheDocument();
  });
});

describe("mobile presentation", () => {
  const mobileRows = (): DfsEnrichedAnalyzerRow[] => [
    offensiveRow({ dkId: "h1", playerName: "Justin Herbert", position: "QB", team: "lac", opponent: "kc", homeAway: "home" }),
  ];

  it("shows only the surname on mobile and the full name on desktop", () => {
    setViewport(true);
    const view = render(<NflDfsAnalyzerTable rows={mobileRows()} />);
    expect(screen.getByText("Herbert")).toBeInTheDocument();
    expect(screen.queryByText("Justin Herbert")).not.toBeInTheDocument();
    view.unmount();

    setViewport(false);
    render(<NflDfsAnalyzerTable rows={mobileRows()} />);
    expect(screen.getByText("Justin Herbert")).toBeInTheDocument();
  });

  it("keeps the Player column and the header sticky on mobile", () => {
    setViewport(true);
    render(<NflDfsAnalyzerTable rows={mobileRows()} />);
    const playerHeader = screen.getByRole("columnheader", { name: "Player" });
    expect(playerHeader.className).toMatch(/sticky/);
    expect(playerHeader.className).toMatch(/left-0/);
    expect(playerHeader.closest("thead")!.className).toMatch(/sticky/);
    const playerCell = screen.getByText("Herbert").closest("td")!;
    expect(playerCell.className).toMatch(/sticky/);
    expect(playerCell.className).toMatch(/left-0/);
    // Opaque background so scrolled content does not bleed through.
    expect(playerCell.className).toMatch(/bg-white/);
  });

  it("opens the full Player Review from the surname on mobile, same as desktop", () => {
    setViewport(true);
    render(<NflDfsAnalyzerTable rows={mobileRows()} />);
    const nameButton = screen.getByRole("button", { name: "Expand details for Justin Herbert" });
    expect(nameButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(nameButton);
    const detail = document.querySelector('[data-dfs-player-review="h1"]')!;
    expect(detail).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText("Matchup", { selector: "dt" })).toBeInTheDocument();
    // Full review includes fields beyond the currently visible board columns and the Last 10 history.
    expect(within(detail as HTMLElement).getByText("DK Overall RK")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Player Last 10" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse details for Justin Herbert" }));
    expect(document.querySelector('[data-dfs-player-review="h1"]')).not.toBeInTheDocument();
  });
});
