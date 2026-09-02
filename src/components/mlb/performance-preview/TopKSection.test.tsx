import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TopKPerformanceSummaryFile, TopKPickRecord } from "@/types/mlbTopKPerformance";
import TopKSection from "./TopKSection";

const REFERENCE_DATE = "2026-08-12";

function summary(overrides: Partial<TopKPerformanceSummaryFile["overall"]> = {}): TopKPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "top-k-tracking-v1", trackingStartDate: "2026-08-01",
    totalTrackedDates: 5, mostRecentGradedDate: "2026-08-11",
    overall: { picks: 10, wins: 4, losses: 3, pushes: 1, winRate: 57.1, avgEdge: 0.9, avgKScore: 52, oddsCoveragePercent: 80, flatBetRoi: 8, actualKTotal: 55, avgActualK: 5.5, avgIp: 5.4, kPerNine: 9.1, ...overrides },
  };
}

function record(overrides: Partial<TopKPickRecord> = {}, index = 0): TopKPickRecord {
  return {
    trackingModelVersion: "top-k-tracking-v1", date: "2026-08-11", persistedAt: "2026-08-11T00:00:00Z",
    pitcherId: 6000 + index, pitcherName: `Ace ${index}`, team: "NYY", opponent: "BOS", gameId: 900 + index, gameKey: "BOS@NYY",
    side: "over", slot: 1, line: 4.5, odds: "-150", oddsBook: "book", projectedKs: 6.2, projectionEdge: 1.7,
    kScore: 58, valueScore: 62, projectedIP: 5.6, workloadConfidenceGrade: "A", modelVersion: "mlb-k-projection-v2-production",
    resultStatus: "final", actualStrikeOuts: 6, actualInningsPitched: "5.2", battersFaced: 24, result: "WIN", gradedAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("TopKSection", () => {
  it("renders W/L/P and win-rate summary metrics", () => {
    render(<TopKSection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText("Wins")).toBeInTheDocument();
    expect(screen.getByText("Losses")).toBeInTheDocument();
    expect(screen.getByText("Pushes")).toBeInTheDocument();
    expect(screen.getByText("Win Rate")).toBeInTheDocument();
  });

  it("suppresses ROI when odds coverage is too low", () => {
    render(<TopKSection summary={summary({ oddsCoveragePercent: 10, flatBetRoi: 5 })} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText(/low odds coverage/)).toBeInTheDocument();
  });

  it("renders a time window toggle defaulting to Last 30 Days", () => {
    render(<TopKSection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByRole("button", { name: "Last 30 Days", pressed: true })).toBeInTheDocument();
  });

  it("grades an Over WIN, an Under LOSS, and a PUSH correctly in the result badges", () => {
    const records = [
      record({ side: "over", result: "WIN", actualStrikeOuts: 6, line: 4.5 }, 0),
      record({ side: "under", result: "LOSS", actualStrikeOuts: 7, line: 4.5 }, 1),
      record({ side: "over", result: "PUSH", actualStrikeOuts: 4, line: 4 }, 2),
    ];
    const { container } = render(<TopKSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    const table = container.querySelector("table") as HTMLTableElement;
    expect(within(table).getByText("WIN")).toBeInTheDocument();
    expect(within(table).getByText("LOSS")).toBeInTheDocument();
    expect(within(table).getByText("PUSH")).toBeInTheDocument();
  });

  it("shows PENDING for an ungraded pick and DNP for a did_not_play pick", () => {
    const records = [
      record({ resultStatus: "pending", result: null, actualStrikeOuts: null }, 0),
      record({ resultStatus: "did_not_play", result: null, actualStrikeOuts: null }, 1),
    ];
    const { container } = render(<TopKSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    const table = container.querySelector("table") as HTMLTableElement;
    expect(within(table).getByText("PENDING")).toBeInTheDocument();
    expect(within(table).getByText("DNP")).toBeInTheDocument();
  });

  it("filters to Win only via the result filter (labeled Win/Loss for K props)", () => {
    const records = [
      record({ pitcherName: "Winner", result: "WIN" }, 0),
      record({ pitcherName: "Loser", result: "LOSS" }, 1),
    ];
    const { container } = render(<TopKSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    fireEvent.click(screen.getByRole("button", { name: "Win" }));
    const table = container.querySelector("table") as HTMLTableElement;
    expect(within(table).getByText("Winner")).toBeInTheDocument();
    expect(within(table).queryByText("Loser")).not.toBeInTheDocument();
  });

  it("handles a pending record with null actual stats without crashing", () => {
    const records = [record({ resultStatus: "pending", result: null, actualStrikeOuts: null, actualInningsPitched: null }, 0)];
    expect(() => render(<TopKSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />)).not.toThrow();
  });
});
