import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("shows DK Pos RK, JKB Slate RK, JKB Week RK, Rank Diff, JKB Proj, JKB Pts/$1K columns", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [offensiveRow({ dkId: "q1", playerName: "QB Alpha", position: "QB" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    ["DK Pos RK", "JKB Slate RK", "JKB Week RK", "Rank Diff", "JKB Proj", "JKB Pts/$1K"].forEach((label) => {
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
    });
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
    expect(within(row).getByText("QB3")).toBeInTheDocument();
    expect(row.querySelector('[data-team-logo="NO"] img')).toHaveAttribute("src", expect.stringContaining("NO"));
    expect(row.querySelector('[data-opponent-logo="DET"] img')).toHaveAttribute("src", expect.stringContaining("det"));
    expect(within(row).getByText("22.8").closest("td")).not.toBe(within(row).getByText("19.4").closest("td"));
    for (const value of ["+9", "-4", "+13"]) expect(within(row).getByText(value).style.backgroundColor).not.toBe("");
    for (const name of ["Player", "Team/Opp", "Salary", "DK Pos RK", "JKB Slate RK", "JKB Week RK", "Rank Diff", "JKB Proj", "JKB Pts/$1K", "Matchup", "FPA SZN", "FPA L5", "EPA ADV", "SUCCESS ADV", "TRENCHES", "DEF VS AVG"]) {
      const button = document.querySelector<HTMLButtonElement>(`th button[aria-label="${name}"]`)!;
      const header = button.closest("th")!;
      fireEvent.click(button);
      expect(header).not.toHaveAttribute("aria-sort", "none");
      const previous = header.getAttribute("aria-sort");
      fireEvent.click(button);
      expect(header.getAttribute("aria-sort")).not.toBe(previous);
    }
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
    expect(first.querySelectorAll("td")).toHaveLength(9);
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
