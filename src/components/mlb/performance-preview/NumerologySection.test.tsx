import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NumerologyPerformanceRecord, NumerologyPerformanceSummary } from "@/types/mlbNumerologyPerformance";
import NumerologySection from "./NumerologySection";

const REFERENCE_DATE = "2026-08-12";

const window = {
  totalRecords: 5, finalized: 5, pending: 0, missingOrNoResult: 0,
  hrHits: 1, hrHitRate: 20, averageHits: 1.2, averageTotalBases: 2.4, averageRBI: 1, averageRuns: 1, averageAtBats: 4,
};

function summary(): NumerologyPerformanceSummary {
  return {
    generatedAt: "2026-08-12T00:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2", asOfDate: "2026-08-11",
    allTime: window, last7Days: window, last14Days: window, topPlay: window, over50: window,
    resultBuckets: {
      previousDay: { topPlay: { total: 1, finalized: 1, hasStats: false }, over50: { total: 1, finalized: 1, hasStats: false } },
      overall: { topPlay: { total: 1, finalized: 1, hasStats: false }, over50: { total: 1, finalized: 1, hasStats: false } },
    },
  };
}

function record(overrides: Partial<NumerologyPerformanceRecord> = {}, index = 0): NumerologyPerformanceRecord {
  return {
    id: `rec-${index}`, date: "2026-08-10", generatedAt: "2026-08-10T00:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2",
    selectionType: "over-50", isTopPlay: false, qualifiesOver50: true,
    player: `Player ${index}`, playerId: 3000 + index, team: "NYY", opponent: "BOS", gameId: 800 + index,
    numerologyScore: 55, hrScoreRank: 3, hrOddsYes: "+280", hrOddsBook: "book",
    resultStatus: "final", hitHomeRun: false,
    numerologySignals: [],
    stats: { atBats: 4, hits: 1, runs: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 2, totalBases: 1, homeRuns: 0, stolenBases: 0 },
    finalizedAt: "2026-08-11T00:00:00Z", source: "mlb-statsapi",
    ...overrides,
  };
}

function signal(field: string) {
  return { label: field, matched: true, points: null, weight: null, detail: "", field, type: "live-board-match", value: null, root: null };
}

describe("NumerologySection — match/combo filtering", () => {
  it("renders a filter chip for each distinct matched field found in the data", () => {
    const records = [
      record({ numerologySignals: [signal("jersey")] }, 0),
      record({ numerologySignals: [signal("birthDay")] }, 1),
    ];
    render(<NumerologySection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByRole("button", { name: "Jersey" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Birth Day" })).toBeInTheDocument();
  });

  it("does not invent filter chips for fields that don't exist in the data", () => {
    const records = [record({ numerologySignals: [signal("jersey")] }, 0)];
    render(<NumerologySection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    expect(screen.queryByRole("button", { name: "Life Path" })).not.toBeInTheDocument();
  });

  it("selecting a single match type narrows the qualifying record count", () => {
    const records = [
      record({ numerologySignals: [signal("jersey")], player: "HasJersey" }, 0),
      record({ numerologySignals: [signal("birthDay")], player: "HasBirthDay" }, 1),
    ];
    render(<NumerologySection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    fireEvent.click(screen.getByRole("button", { name: "Jersey" }));
    expect(screen.getByText(/1 matching record/)).toBeInTheDocument();
  });

  it("combo filtering (multiple selected) requires ALL selected fields to be present -- intersection, not union", () => {
    const records = [
      record({ numerologySignals: [signal("jersey")], player: "OnlyJersey" }, 0),
      record({ numerologySignals: [signal("jersey"), signal("personalDay")], player: "JerseyAndPersonalDay" }, 1),
      record({ numerologySignals: [signal("personalDay")], player: "OnlyPersonalDay" }, 2),
    ];
    render(<NumerologySection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    fireEvent.click(screen.getByRole("button", { name: "Jersey" }));
    fireEvent.click(screen.getByRole("button", { name: "Personal Day" }));
    // Only the record with BOTH matches qualifies under combo (intersection) semantics.
    expect(screen.getByText(/1 matching record/)).toBeInTheDocument();
  });

  it("shows an active-matches chip group when filters are selected", () => {
    const records = [record({ numerologySignals: [signal("jersey")] }, 0)];
    render(<NumerologySection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    fireEvent.click(screen.getByRole("button", { name: "Jersey" }));
    expect(screen.getByText("Active combo:")).toBeInTheDocument();
  });

  it("Clear resets the filter back to matching everything", () => {
    const records = [record({ numerologySignals: [signal("jersey")] }, 0), record({ numerologySignals: [signal("birthDay")] }, 1)];
    render(<NumerologySection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    fireEvent.click(screen.getByRole("button", { name: "Jersey" }));
    expect(screen.getByText(/1 matching record/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Active combo:")).not.toBeInTheDocument();
  });
});

describe("NumerologySection — box score / time window", () => {
  it("renders a time window toggle defaulting to Last 30 Days", () => {
    render(<NumerologySection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByRole("button", { name: "Last 30 Days", pressed: true })).toBeInTheDocument();
  });

  it("handles records with null/missing stats without breaking layout", () => {
    const records = [record({ stats: null as unknown as NumerologyPerformanceRecord["stats"] }, 0)];
    expect(() => render(<NumerologySection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />)).not.toThrow();
  });
});
