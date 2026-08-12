import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import HrPerformanceTable from "./HrPerformanceTable";

function record(overrides: Partial<HrPredictionRecord> & { result?: Partial<HrPredictionRecord["result"]> } = {}, index = 0): HrPredictionRecord {
  return {
    date: `2026-08-${String((index % 27) + 1).padStart(2, "0")}`,
    generatedAt: "2026-08-01T00:00:00Z",
    modelVersion: "mlb-hr-quality-v1.1",
    playerId: 1000 + index,
    playerName: `Player ${index}`,
    teamId: 1,
    team: "NYY",
    opponentId: 2,
    opponent: "BOS",
    opposingPitcherId: null,
    opposingPitcherName: null,
    lineupStatus: "confirmed",
    battingOrder: 3,
    gameId: 500 + index,
    hrQualityScore: 65,
    hrRank: 5,
    hrOddsYes: "+300",
    hrOddsBook: "book",
    marketImpliedProbability: 0.2,
    confidenceLevel: "medium",
    ...overrides,
    result: {
      status: "miss",
      hrCount: 0,
      plateAppearances: 4,
      gameFinalStatus: "Final",
      gradedAt: "2026-08-02T00:00:00Z",
      resolutionReason: null,
      attemptCount: 1,
      battingLine: { atBats: 4, hits: 1, totalBases: 1, rbi: 0, runs: 0, baseOnBalls: 0, strikeOuts: 1 },
      ...overrides.result,
    },
  };
}

describe("HrPerformanceTable", () => {
  it("renders exactly one row per record", () => {
    const records = [record({}, 0), record({}, 1), record({}, 2)];
    render(<HrPerformanceTable records={records} />);
    const rows = screen.getAllByText(/^Player \d$/);
    expect(rows).toHaveLength(3);
  });

  it("defaults to the latest 20 records and reports the total count", () => {
    const records = Array.from({ length: 45 }, (_, i) => record({}, i));
    render(<HrPerformanceTable records={records} />);
    expect(screen.getByText("Showing 20 of 45 graded plays")).toBeInTheDocument();
    expect(screen.getAllByText(/^Player \d+$/)).toHaveLength(20);
  });

  it("expands the visible count when Show More is clicked", () => {
    const records = Array.from({ length: 45 }, (_, i) => record({}, i));
    render(<HrPerformanceTable records={records} />);
    fireEvent.click(screen.getByText("Show More"));
    expect(screen.getByText("Showing 40 of 45 graded plays")).toBeInTheDocument();
  });

  it("filters to only Hit results", () => {
    const records = [
      record({ result: { status: "hit", hrCount: 1 } }, 0),
      record({ result: { status: "miss", hrCount: 0 } }, 1),
    ];
    render(<HrPerformanceTable records={records} />);
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(screen.getByText("Player 0")).toBeInTheDocument();
    expect(screen.queryByText("Player 1")).not.toBeInTheDocument();
  });

  it("renders missing batting-line stats as an em dash instead of blank or zero", () => {
    const records = [record({ result: { status: "pending", battingLine: undefined } }, 0)];
    render(<HrPerformanceTable records={records} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("does not break rendering for an unsupported team abbreviation", () => {
    const records = [record({ team: "ZZZ" }, 0)];
    expect(() => render(<HrPerformanceTable records={records} />)).not.toThrow();
    expect(screen.getByText("Player 0")).toBeInTheDocument();
  });

  it("maps each result status to the correct badge text", () => {
    const records = [
      record({ result: { status: "hit", hrCount: 1 } }, 0),
      record({ result: { status: "miss" } }, 1),
      record({ result: { status: "did_not_play", battingLine: null } }, 2),
      record({ result: { status: "pending", battingLine: undefined } }, 3),
      record({ result: { status: "unresolved_retryable" } }, 4),
    ];
    render(<HrPerformanceTable records={records} />);
    expect(screen.getByText("HIT")).toBeInTheDocument();
    expect(screen.getByText("MISS")).toBeInTheDocument();
    expect(screen.getByText("DNP")).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByText("UNRESOLVED")).toBeInTheDocument();
  });
});
