import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NflDfsHistory, { DefenseSignal, FpaSignal } from "./NflDfsHistory";
import NflDfsAnalyzerTable from "./NflDfsAnalyzerTable";
import { dfsHistoryLoader } from "@/lib/nfl/dfs/historyDelivery";
import { historyFixture, historyTarget } from "@/lib/nfl/dfs/__fixtures__/historyFactory";
import { buildMetric, buildResearchContext } from "@/lib/nfl/dfs/__fixtures__/researchFactory";
import type { DfsEnrichedAnalyzerRow, DfsEnrichedOffensiveRow } from "@/lib/nfl/dfs/slateAnalyzer";

const row = { kind: "offense", dkId: "p", playerName: "Player One", position: "QB", playerId: "gsis:p", team: "no", opponent: "det", homeAway: "away",
  salary: 7000, dkStatus: null, identityStatus: "resolved", identityConflict: false, teamMismatchStatus: "none", research: null,
  dkPositionSalaryRank: 1, jkbSlatePositionRank: 1, jkbWeeklyPositionRank: 2, posRankDiff: 0, projectedFantasyPoints: 20, pointsPer1k: 2.8,
} as DfsEnrichedOffensiveRow;
afterEach(() => vi.restoreAllMocks());

describe("DFS historical UI", () => {
  it("renders exact canonical Season/L5 FPA and prior-season labels", () => {
    const research = { status: "available" as const, matchupEdges: null, matchupGrade: null,
      context: buildResearchContext({ opponentFpaSeason: buildMetric({ value: 22.8, rank: 27, sampleSeason: 2025, sampleSize: 17 }),
        opponentFpaLast5: buildMetric({ value: 19.4, rank: 20, sampleSeason: 2025, sampleSize: 5 }) }) };
    render(<><FpaSignal row={{ ...row, research }} period="season" /><FpaSignal row={{ ...row, research }} period="last5" /></>);
    expect(screen.getByText("22.8")).toBeVisible();
    expect(screen.getByText("19.4")).toBeVisible();
    expect(screen.getAllByTitle(/2025;.*games/)).toHaveLength(2);
    expect(screen.getByText(/#27/)).toBeVisible();
    expect(screen.getByTitle(/Last 5: 2025; 5 games/)).toBeVisible();
  });
  it("keeps null FPA and DST unavailable", () => {
    const { container, rerender } = render(<FpaSignal row={row} period="season" />);
    expect(container).toHaveTextContent("—");
    const dst = { ...row, kind: "dst", position: "DST", canonicalTeamId: "nfl-no", projectedFantasyPoints: null, projectionSource: null,
      jkbWeeklyPositionRank: null, jkbSlatePositionRank: null, jkbOverallSlateProjectionRank: null, dkOverallSalaryRank: null,
      posRankDiff: null, overallRankDiff: null, pointsPer1k: null } as DfsEnrichedAnalyzerRow;
    rerender(<><FpaSignal row={dst} period="last5" /><DefenseSignal row={dst} index={historyFixture().index} loading={false} /></>);
    expect(container.textContent).toBe("—N/A");
  });
  it("renders valid defense denominator separately from equal and missing", () => {
    render(<DefenseSignal row={row} index={historyFixture().index} loading={false} />);
    expect(screen.getByText("+1.7")).toBeVisible();
    expect(screen.getByText("+1.7")).toHaveAttribute("data-result", "over");
  });
  it("renders player baseline/sign/line/push and switches to individual opponent rows", async () => {
    const { index, detail } = historyFixture();
    vi.spyOn(dfsHistoryLoader, "detail").mockResolvedValue(detail);
    render(<NflDfsHistory row={row} target={historyTarget} index={index} />);
    const table = await screen.findByRole("table");
    expect(table).toHaveTextContent("230.0");
    expect(table).toHaveTextContent("+20");
    expect(table).toHaveTextContent("DraftKings");
    expect(table).toHaveTextContent("push");
    expect(screen.getByTitle(/observed 2025-12-28T17/)).toBeVisible();
    expect(screen.getByText(/entire position group/)).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Opponent Last 10" }));
    expect(table).toHaveTextContent("Player Two");
    expect(table).toHaveTextContent("240.0");
    expect(table).toHaveTextContent("-5");
    expect(screen.getByText("1/3 above own player average")).toBeVisible();
    expect(screen.getByText(/1 below · 1 equal · 1 missing comparison/)).toBeVisible();
    expect(screen.getAllByTitle("No archived line")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "Player Last 10" }));
    expect(table).toHaveTextContent("Pos. allowance");
  });
  it("keeps a missing player usable and allows independently covered opponent history", async () => {
    const { index, detail } = historyFixture();
    vi.spyOn(dfsHistoryLoader, "detail").mockResolvedValue(detail);
    render(<NflDfsHistory row={{ ...row, playerId: "gsis:outside" } as DfsEnrichedAnalyzerRow} target={historyTarget} index={index} />);
    expect(await screen.findByText("No historical sample")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Opponent Last 10" }));
    expect(await screen.findByText("Player Two")).toBeVisible();
  });
  it("shows missing baseline without inventing a comparison or current line", async () => {
    const { index, detail } = historyFixture();
    Object.assign(detail.players["gsis:p:passing"][0], { opponentPregamePositionalAllowance: null, opponentPregamePositionalAllowanceSampleSize: 0,
      actualMinusOpponentAllowance: null, missingReferenceReason: "no-complete-prior-positional-reference", historicalSportsbookLine: null, lineResult: "unavailable" });
    vi.spyOn(dfsHistoryLoader, "detail").mockResolvedValue(detail);
    render(<NflDfsHistory row={row} target={historyTarget} index={index} />);
    await screen.findByRole("table");
    expect(screen.getByText("0/0 above opponent positional allowance")).toBeVisible();
    expect(screen.getByText(/1 missing comparison/)).toBeVisible();
    expect(screen.getByTitle("No archived line")).toHaveTextContent("—");
  });
  it("handles failed detail without removing research", async () => {
    const { index } = historyFixture();
    vi.spyOn(dfsHistoryLoader, "detail").mockRejectedValue(new Error("404"));
    render(<NflDfsHistory row={row} target={historyTarget} index={index} />);
    expect(await screen.findByText("History unavailable for this week.")).toBeVisible();
  });
  it.each([false, true])("loads detail only on expansion, supports collapse (compact=%s)", async (compact) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: compact, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    const { index, detail } = historyFixture();
    vi.spyOn(dfsHistoryLoader, "index").mockResolvedValue(index);
    const load = vi.spyOn(dfsHistoryLoader, "detail").mockResolvedValue(detail);
    render(<NflDfsAnalyzerTable rows={[row]} historyTarget={historyTarget} />);
    const control = await screen.findByRole("button", { name: "Expand Player One" });
    expect(load).not.toHaveBeenCalled();
    if (!compact) {
      // Desktop shows the full column set; mobile hides FPA/DEF VS AVG by default.
      expect(screen.getByRole("columnheader", { name: "FPA SZN" })).toBeVisible();
      expect(screen.getByRole("columnheader", { name: "DEF VS AVG" })).toBeVisible();
      expect(screen.getByText("+1.7")).toBeVisible();
    }
    fireEvent.click(control);
    await screen.findByRole("region", { name: "Historical yardage context" });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    fireEvent.click(control);
    expect(screen.queryByRole("region", { name: "Historical yardage context" })).not.toBeInTheDocument();
  });
});
