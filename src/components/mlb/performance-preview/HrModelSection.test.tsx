import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HrModelPerformanceSummary, HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import HrModelSection from "./HrModelSection";

const REFERENCE_DATE = "2026-08-12";

const bucket = (overrides: Partial<HrModelPerformanceSummary["byScoreBand"][string]> = {}) => ({
  predictions: 10, eligibleGraded: 10, hrHits: 2, actualHrRate: 20,
  avgMarketImpliedProbability: 18, avgOdds: 400, flatBetRoi: 5, calibrationDifference: null, sampleSize: 10,
  ...overrides,
});

function summary(): HrModelPerformanceSummary {
  return {
    generatedAt: "2026-08-12T00:00:00Z",
    note: "Empirical outcome rates.",
    totalGradedRecords: 40,
    byScoreBand: { "80+": bucket(), "70-79.9": bucket(), "60-69.9": bucket(), "50-59.9": bucket(), "Below 50": bucket({ sampleSize: 999 }) },
    byConfidenceLevel: { high: bucket(), medium: bucket(), low: bucket(), incomplete: bucket({ sampleSize: 0 }) },
    byLineupStatus: { confirmed: bucket(), unconfirmed: bucket() },
    byModelVersion: { "mlb-hr-quality-v1.1": bucket({ sampleSize: 40, hrHits: 8 }) },
    sampleSizeWarning: null,
    calibrationReadiness: { sampleCount: 40, hrOutcomeCount: 8, calendarDayCount: 20, meetsMinimumThreshold: true, warnings: [], readyForCalibrationFit: false },
  };
}

function record(overrides: Partial<HrPredictionRecord> & { result?: Partial<HrPredictionRecord["result"]> } = {}, index = 0): HrPredictionRecord {
  return {
    date: "2026-08-10",
    generatedAt: "2026-08-10T00:00:00Z",
    modelVersion: "mlb-hr-quality-v1.1",
    playerId: 2000 + index,
    playerName: `Slugger ${index}`,
    teamId: 1, team: "NYY", opponentId: 2, opponent: "BOS",
    opposingPitcherId: null, opposingPitcherName: null,
    lineupStatus: "confirmed", battingOrder: 3,
    gameId: 700 + index,
    hrQualityScore: 65,
    hrRank: 5, hrOddsYes: "+300", hrOddsBook: "book", marketImpliedProbability: 0.2,
    confidenceLevel: "medium",
    ...overrides,
    result: {
      status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final",
      gradedAt: "2026-08-11T00:00:00Z", resolutionReason: null, attemptCount: 1,
      battingLine: { atBats: 4, hits: 2, doubles: 1, totalBases: 6, rbi: 2, runs: 1, baseOnBalls: 0, strikeOuts: 1 },
      ...overrides.result,
    },
  };
}

describe("HrModelSection — Below 50 removal", () => {
  it("never renders a 'Below 50' band", () => {
    const records = [record({ hrQualityScore: 30 }, 0), record({ hrQualityScore: 85 }, 1)];
    render(<HrModelSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    expect(screen.queryByText("Below 50")).not.toBeInTheDocument();
  });

  it("still renders the 4 visible score bands", () => {
    render(<HrModelSection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText("80+")).toBeInTheDocument();
    expect(screen.getByText("70-79.9")).toBeInTheDocument();
    expect(screen.getByText("60-69.9")).toBeInTheDocument();
    expect(screen.getByText("50-59.9")).toBeInTheDocument();
  });

  it("excludes a below-50 record from Recent Graded Plays even though it's a real graded hit", () => {
    const records = [record({ hrQualityScore: 30, playerName: "LowScorer" }, 0), record({ hrQualityScore: 65, playerName: "TrackedPlayer" }, 1)];
    render(<HrModelSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    expect(screen.queryByText("LowScorer")).not.toBeInTheDocument();
    expect(screen.getAllByText("TrackedPlayer").length).toBeGreaterThan(0);
  });

  it("shows a note that the tracker is focused on 50+ scores", () => {
    render(<HrModelSection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText(/focused on 50\+ score ranges only/)).toBeInTheDocument();
  });
});

describe("HrModelSection — time window toggle", () => {
  it("defaults to Last 30 Days and updates the box score sample when a different window is chosen", () => {
    const records = [
      record({ hrQualityScore: 70, date: "2026-08-11" }, 0), // yesterday
      record({ hrQualityScore: 70, date: "2026-07-01" }, 1), // outside last30
    ];
    render(<HrModelSection summary={summary()} records={records} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByRole("button", { name: "Last 30 Days", pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(screen.getByRole("button", { name: "Yesterday", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("1 graded plays in this window")).toBeInTheDocument();
  });
});
