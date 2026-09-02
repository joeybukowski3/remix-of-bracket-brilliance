import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HrModelPerformanceSummary, HrPredictionHistoryFile, HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import type { TopKPerformanceFile, TopKPerformanceSummaryFile } from "@/types/mlbTopKPerformance";

vi.mock("@/components/mlb/MlbTeamLogo", () => ({
  default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span>,
}));

const REFERENCE_TODAY = "2026-08-28";

function hrRecord(overrides: Partial<HrPredictionRecord> = {}): HrPredictionRecord {
  return {
    date: "2026-08-27",
    generatedAt: "2026-08-27T00:00:00Z",
    modelVersion: "mlb-hr-quality-v1.1",
    playerId: 1,
    playerName: "Recent Hitter",
    teamId: 1,
    team: "NYY",
    opponentId: 2,
    opponent: "BOS",
    opposingPitcherId: null,
    opposingPitcherName: null,
    lineupStatus: "confirmed",
    battingOrder: 3,
    gameId: 100,
    hrQualityScore: 85,
    hrRank: 1,
    hrOddsYes: "+300",
    hrOddsBook: "book",
    marketImpliedProbability: 0.2,
    confidenceLevel: "high",
    result: { status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final", gradedAt: "2026-08-27T00:00:00Z", resolutionReason: null, attemptCount: 1 },
    ...overrides,
  };
}

function hrSummary(): HrModelPerformanceSummary {
  const bucket = { predictions: 1, eligibleGraded: 1, hrHits: 1, actualHrRate: 100, avgMarketImpliedProbability: 20, avgOdds: 300, flatBetRoi: 300, calibrationDifference: null, sampleSize: 1 };
  return {
    generatedAt: "2026-08-27T21:00:00Z",
    note: "note",
    totalGradedRecords: 2,
    byScoreBand: { "80+": bucket, "70-79.9": bucket, "60-69.9": bucket, "50-59.9": bucket, "Below 50": bucket },
    byConfidenceLevel: { high: bucket, medium: bucket, low: bucket, incomplete: bucket },
    byLineupStatus: { confirmed: bucket, unconfirmed: bucket },
    byModelVersion: { "mlb-hr-quality-v1.1": bucket },
    sampleSizeWarning: null,
    calibrationReadiness: { sampleCount: 2, hrOutcomeCount: 1, calendarDayCount: 2, meetsMinimumThreshold: false, warnings: [], readyForCalibrationFit: false },
  };
}

function hrHistory(): HrPredictionHistoryFile {
  return {
    schemaVersion: 2,
    lastUpdatedAt: "2026-08-27T21:00:00Z",
    recordCount: 2,
    records: [
      // In-window (yesterday relative to REFERENCE_TODAY), 80+ band, graded hit.
      hrRecord({ date: "2026-08-27", hrQualityScore: 85, playerId: 1, playerName: "Recent Hitter" }),
      // Out-of-window (far in the past) so it must never appear regardless of band.
      hrRecord({ date: "2026-01-01", hrQualityScore: 85, playerId: 2, playerName: "Old Hitter" }),
    ],
  };
}

vi.mock("@/hooks/useMlbHrModelPerformance", () => ({
  useMlbHrModelPerformance: () => ({ summary: hrSummary(), history: hrHistory(), loading: false, error: null, summaryError: null, historyError: null }),
}));

vi.mock("@/hooks/useMlbNumerologyPerformance", () => ({
  useMlbNumerologyPerformance: () => ({
    summary: {
      generatedAt: "2026-08-27T21:00:00Z", modelVersion: "v0.2", asOfDate: "2026-08-26",
      allTime: { totalRecords: 0, finalized: 0, pending: 0, missingOrNoResult: 0, hrHits: 0, hrHitRate: null, averageHits: null, averageTotalBases: null, averageRBI: null, averageRuns: null, averageAtBats: null },
      last7Days: { totalRecords: 0, finalized: 0, pending: 0, missingOrNoResult: 0, hrHits: 0, hrHitRate: null, averageHits: null, averageTotalBases: null, averageRBI: null, averageRuns: null, averageAtBats: null },
      last14Days: { totalRecords: 0, finalized: 0, pending: 0, missingOrNoResult: 0, hrHits: 0, hrHitRate: null, averageHits: null, averageTotalBases: null, averageRBI: null, averageRuns: null, averageAtBats: null },
      topPlay: { totalRecords: 0, finalized: 0, pending: 0, missingOrNoResult: 0, hrHits: 0, hrHitRate: null, averageHits: null, averageTotalBases: null, averageRBI: null, averageRuns: null, averageAtBats: null },
      over50: { totalRecords: 0, finalized: 0, pending: 0, missingOrNoResult: 0, hrHits: 0, hrHitRate: null, averageHits: null, averageTotalBases: null, averageRBI: null, averageRuns: null, averageAtBats: null },
      resultBuckets: { previousDay: { topPlay: { total: 0, finalized: 0, hasStats: false }, over50: { total: 0, finalized: 0, hasStats: false } }, overall: { topPlay: { total: 0, finalized: 0, hasStats: false }, over50: { total: 0, finalized: 0, hasStats: false } } },
    },
    history: { generatedAt: "2026-08-27T21:00:00Z", modelVersion: "v0.2", records: [] },
    loading: false, error: null, summaryError: null, historyError: null,
  }),
}));

vi.mock("@/hooks/useSinCityPerformance", () => ({
  useSinCityPerformance: () => ({
    summary: { generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "v1", trackingStartDate: "2026-08-12", totalTrackedDates: 0, mostRecentGradedDate: null, fiveOfFive: { qualifiedPlays: 0, hrHits: 0, hrHitRate: null, averageOdds: null, gradedPlays: 0, roiEligiblePlays: 0, oddsCoveragePercent: 0, flatBetRoi: null }, fourOfFive: { qualifiedPlays: 0, hrHits: 0, hrHitRate: null, averageOdds: null, gradedPlays: 0, roiEligiblePlays: 0, oddsCoveragePercent: 0, flatBetRoi: null } },
    history: { generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "v1", trackingStartDate: "2026-08-12", records: [] },
    loading: false, error: null, summaryError: null, historyError: null,
  }),
}));

function topKSummary(): TopKPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "top-k-tracking-v1", trackingStartDate: "2026-08-12",
    totalTrackedDates: 1, mostRecentGradedDate: "2026-08-27",
    overall: { picks: 1, wins: 1, losses: 0, pushes: 0, winRate: 100, avgEdge: 1, avgKScore: 55, gradedPicks: 1, roiEligiblePicks: 1, oddsCoveragePercent: 100, flatBetRoi: 50, actualKTotal: 7, avgActualK: 7, avgIp: 6, kPerNine: 10.5 },
  };
}

function topKHistory(): TopKPerformanceFile {
  return {
    generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "top-k-tracking-v1", trackingStartDate: "2026-08-12",
    records: [{
      trackingModelVersion: "top-k-tracking-v1", date: "2026-08-27", persistedAt: "2026-08-27T00:00:00Z",
      pitcherId: 1, pitcherName: "K Pitcher", team: "NYY", opponent: "BOS", gameId: 100, gameKey: "BOS@NYY",
      side: "over", slot: 1, line: 4.5, odds: "-150", oddsBook: "book", projectedKs: 5.9, projectionEdge: 1.4,
      kScore: 55, valueScore: 60, projectedIP: 5.5, workloadConfidenceGrade: "A", modelVersion: "mlb-k-projection-v2-production",
      resultStatus: "final", actualStrikeOuts: 7, actualInningsPitched: "6.0", battersFaced: 24, result: "WIN", gradedAt: "2026-08-27T00:00:00Z",
    }],
  };
}

vi.mock("@/hooks/useTopKPerformance", () => ({
  useTopKPerformance: () => ({ summary: topKSummary(), history: topKHistory(), loading: false, error: null, summaryError: null, historyError: null }),
}));

const { default: PerformanceTrackerShell } = await import("./PerformanceTrackerShell");

describe("PerformanceTrackerShell -- window/category filtering consistency", () => {
  it("HR tab: the summary strip's Plays count matches the number of visible table rows for the default 80+ band", () => {
    render(<PerformanceTrackerShell referenceDate={REFERENCE_TODAY} />);
    // Default band is 80+, default window is Last 30 Days -- only "Recent Hitter" (2026-08-27) qualifies.
    const playsMetric = screen.getByText("Plays").parentElement!;
    expect(within(playsMetric).getByText("1")).toBeInTheDocument();
    expect(screen.getAllByText("Recent Hitter").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Old Hitter")).toHaveLength(0);
  });

  it("switching to Yesterday still shows the same row that Last 30 Days showed (both include 2026-08-27 relative to today)", () => {
    render(<PerformanceTrackerShell referenceDate={REFERENCE_TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(screen.getAllByText("Recent Hitter").length).toBeGreaterThan(0);
  });

  it("switching HR score band away from 80+ removes the 80-scored row and shows the empty-category note, not an error", () => {
    render(<PerformanceTrackerShell referenceDate={REFERENCE_TODAY} />);
    fireEvent.click(screen.getByRole("tab", { name: "50-59" }));
    expect(screen.queryAllByText("Recent Hitter")).toHaveLength(0);
    expect(screen.getByText(/0 qualified at 50-59/)).toBeInTheDocument();
  });

  it("switching main tabs shows only the active tracker's content", () => {
    render(<PerformanceTrackerShell referenceDate={REFERENCE_TODAY} />);
    fireEvent.click(screen.getByRole("tab", { name: "Top K Prop" }));
    expect(screen.getAllByText("K Pitcher").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Recent Hitter")).toHaveLength(0);
  });
});

describe("PerformanceTrackerShell -- Top K Phase 1 rank-bucket honesty", () => {
  it("rank-bucket category tabs are present but disabled, and the panel explains why instead of showing fake ranks", () => {
    render(<PerformanceTrackerShell referenceDate={REFERENCE_TODAY} />);
    fireEvent.click(screen.getByRole("tab", { name: "Top K Prop" }));
    const top5Tab = screen.getByRole("tab", { name: "Top 5 Best Value" });
    expect(top5Tab).toBeDisabled();
    fireEvent.click(top5Tab);
    // Disabled tab click must not change anything or crash -- the "all" view stays active.
    expect(screen.getAllByText("K Pitcher").length).toBeGreaterThan(0);
    expect(screen.getByText(/new tracking methodology/)).toBeInTheDocument();
  });
});

describe("PerformanceTrackerShell -- freshness status", () => {
  it("shows a fresh status line with generatedAt for the default HR tab", () => {
    render(<PerformanceTrackerShell referenceDate={REFERENCE_TODAY} />);
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });
});
