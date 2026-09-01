import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    expect(screen.getByText(/could not match this draftkings player/i)).toBeInTheDocument();
  });

  it("does not fabricate JKB metrics for DST rows", () => {
    const rows: DfsEnrichedAnalyzerRow[] = [dstRow({ dkId: "dst1", playerName: "Saints" })];
    render(<NflDfsAnalyzerTable rows={rows} />);
    fireEvent.click(screen.getByRole("tab", { name: "DST" }));
    const row = screen.getByText("Saints").closest("tr") as HTMLElement;
    // The JKB Slate RK / Week RK / Rank Diff / Proj / Pts/$1K columns are replaced
    // by one explicit note for DST -- no fabricated rank or projection numbers.
    expect(within(row).getByText(/No JKB DST projection/i)).toBeInTheDocument();
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
