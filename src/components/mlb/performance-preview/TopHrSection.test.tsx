import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TopHrPerformanceSummaryFile, TopHrPickRecord } from "@/types/mlbTopHrPerformance";
import TopHrSection from "./TopHrSection";

const REFERENCE_DATE = "2026-08-12";

function summary(overrides: Partial<TopHrPerformanceSummaryFile["overall"]> = {}): TopHrPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "top-hr-tracking-v1", trackingStartDate: "2026-06-30",
    totalTrackedDates: 10, mostRecentGradedDate: "2026-08-11",
    overall: { picks: 30, hrHits: 5, hrHitRate: 16.7, avgOdds: 320, oddsCoveragePercent: 90, flatBetRoi: -10, ...overrides },
  };
}

function record(overrides: Partial<TopHrPickRecord> = {}, index = 0): TopHrPickRecord {
  return {
    trackingModelVersion: "top-hr-tracking-v1", date: "2026-08-11", persistedAt: "2026-08-11T00:00:00Z",
    playerId: 5000 + index, playerName: `Slugger ${index}`, team: "NYY", teamId: 1, opponent: "BOS", opponentId: 2,
    gameId: 900 + index, hrQualityScore: 72, rank: 1, slot: 1, odds: "+300", oddsBook: "book", impliedProbability: 0.25,
    lineupStatus: "confirmed", modelVersion: "mlb-hr-quality-v1.1", resultStatus: "hit",
    battingLine: { atBats: 4, hits: 2, doubles: 1, homeRuns: 1, totalBases: 7, rbi: 3, runs: 2, baseOnBalls: 0, strikeOuts: 1 },
    gradedAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("TopHrSection", () => {
  it("renders the model summary metrics from the summary schema", () => {
    render(<TopHrSection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText("Picks")).toBeInTheDocument();
    expect(screen.getByText("HR Hits")).toBeInTheDocument();
    expect(screen.getByText("HR Hit Rate")).toBeInTheDocument();
    expect(screen.getByText("Avg Odds")).toBeInTheDocument();
    expect(screen.getByText("Flat-Bet ROI")).toBeInTheDocument();
  });

  it("suppresses ROI when odds coverage is too low to trust", () => {
    render(<TopHrSection summary={summary({ oddsCoveragePercent: 20, flatBetRoi: -50 })} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText(/low odds coverage/)).toBeInTheDocument();
  });

  it("shows ROI when odds coverage is sufficient", () => {
    render(<TopHrSection summary={summary({ oddsCoveragePercent: 90, flatBetRoi: -10 })} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText("-10%")).toBeInTheDocument();
  });

  it("renders a time-window toggle defaulting to Last 30 Days and updates the box score on change", () => {
    const records = [record({ date: "2026-08-11" }, 0), record({ date: "2026-07-01" }, 1)];
    render(<TopHrSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByRole("button", { name: "Last 30 Days", pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(screen.getByText("1 picks in this window")).toBeInTheDocument();
  });

  it("renders exactly one row per graded pick and shows the 2B column", () => {
    const records = [record({}, 0), record({}, 1)];
    const { container } = render(<TopHrSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    const table = container.querySelector("table") as HTMLTableElement;
    expect(within(table).getAllByText(/^Slugger \d$/)).toHaveLength(2);
    expect(within(table).getByText("2B")).toBeInTheDocument();
  });

  it("handles a record with a null batting line without crashing", () => {
    const records = [record({ resultStatus: "pending", battingLine: null }, 0)];
    expect(() => render(<TopHrSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />)).not.toThrow();
  });
});
