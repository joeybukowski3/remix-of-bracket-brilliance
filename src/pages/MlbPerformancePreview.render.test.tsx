import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { HrModelPerformanceSummary, HrPredictionHistoryFile } from "@/types/mlbHrModelPerformance";
import type { NumerologyPerformanceFile, NumerologyPerformanceSummary } from "@/types/mlbNumerologyPerformance";
import type { SinCityPerformanceFile, SinCityPerformanceSummaryFile } from "@/types/mlbSinCity";
import type { TopHrPerformanceFile, TopHrPerformanceSummaryFile } from "@/types/mlbTopHrPerformance";
import type { TopKPerformanceFile, TopKPerformanceSummaryFile } from "@/types/mlbTopKPerformance";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/mlb/MlbTeamLogo", () => ({
  default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span>,
}));

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

const hrBucket = {
  predictions: 10, eligibleGraded: 10, hrHits: 2, actualHrRate: 20,
  avgMarketImpliedProbability: 18, avgOdds: 400, flatBetRoi: 5, calibrationDifference: null, sampleSize: 10,
};

function hrSummary(): HrModelPerformanceSummary {
  return {
    generatedAt: "2026-08-12T00:00:00Z",
    note: "Empirical outcome rates, not calibrated probability.",
    totalGradedRecords: 10,
    byScoreBand: { "80+": hrBucket, "70-79.9": hrBucket, "60-69.9": hrBucket, "50-59.9": hrBucket, "Below 50": hrBucket },
    byConfidenceLevel: { high: hrBucket, medium: hrBucket, low: hrBucket, incomplete: { ...hrBucket, sampleSize: 0, predictions: 0, hrHits: 0, actualHrRate: null } },
    byLineupStatus: { confirmed: hrBucket, unconfirmed: hrBucket },
    byModelVersion: { "mlb-hr-quality-v1.1": hrBucket },
    sampleSizeWarning: null,
    calibrationReadiness: { sampleCount: 10, hrOutcomeCount: 2, calendarDayCount: 5, meetsMinimumThreshold: false, warnings: [], readyForCalibrationFit: false },
  };
}

function hrHistory(): HrPredictionHistoryFile {
  return {
    schemaVersion: 2,
    lastUpdatedAt: "2026-08-12T00:00:00Z",
    recordCount: 1,
    records: [{
      date: "2026-08-01", generatedAt: "2026-08-01T00:00:00Z", modelVersion: "mlb-hr-quality-v1.1",
      playerId: 1, playerName: "Test Hitter", teamId: 1, team: "NYY", opponentId: 2, opponent: "BOS",
      opposingPitcherId: null, opposingPitcherName: null, lineupStatus: "confirmed", battingOrder: 3,
      gameId: 100, hrQualityScore: 72, hrRank: 1, hrOddsYes: "+300", hrOddsBook: "book", marketImpliedProbability: 0.2,
      confidenceLevel: "high",
      result: { status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final", gradedAt: "2026-08-02T00:00:00Z", resolutionReason: null, attemptCount: 1, battingLine: { atBats: 4, hits: 2, totalBases: 5, rbi: 2, runs: 1, baseOnBalls: 0, strikeOuts: 1 } },
    }],
  };
}

const numerologyWindow = { totalRecords: 5, finalized: 5, pending: 0, missingOrNoResult: 0, hrHits: 1, hrHitRate: 20, averageHits: 1.2, averageTotalBases: 2.4, averageRBI: 1, averageRuns: 1, averageAtBats: 4 };

function numerologySummary(): NumerologyPerformanceSummary {
  return {
    generatedAt: "2026-08-12T00:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2", asOfDate: "2026-08-11",
    allTime: numerologyWindow, last7Days: numerologyWindow, last14Days: numerologyWindow, topPlay: numerologyWindow, over50: numerologyWindow,
    resultBuckets: {
      previousDay: { topPlay: { total: 1, finalized: 1, hasStats: false }, over50: { total: 1, finalized: 1, hasStats: false } },
      overall: { topPlay: { total: 1, finalized: 1, hasStats: false }, over50: { total: 1, finalized: 1, hasStats: false } },
    },
  };
}

function numerologyHistory(): NumerologyPerformanceFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2",
    records: [{
      id: "top-play|2026-08-01|1|2", date: "2026-08-01", generatedAt: "2026-08-01T00:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2",
      selectionType: "top-play", isTopPlay: true, qualifiesOver50: false, player: "Numero Player", playerId: 1, team: "NYY", opponent: "BOS",
      gameId: 100, numerologyScore: 61, hrScoreRank: 3, hrOddsYes: "+280", hrOddsBook: "book", resultStatus: "final", hitHomeRun: false,
      numerologySignals: [],
      stats: { atBats: 4, hits: 1, runs: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 2, totalBases: 1, homeRuns: 0, stolenBases: 0 },
      finalizedAt: "2026-08-02T00:00:00Z", source: "mlb-statsapi",
    }],
  };
}

const sinCityLevel = { qualifiedPlays: 0, hrHits: 0, hrHitRate: null, averageOdds: null, gradedPlays: 0, roiEligiblePlays: 0, oddsCoveragePercent: 0, flatBetRoi: null };

function sinCitySummary(): SinCityPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "sin-city-tracking-v1", trackingStartDate: "2026-08-12",
    totalTrackedDates: 0, mostRecentGradedDate: null, fiveOfFive: sinCityLevel, fourOfFive: sinCityLevel,
  };
}

function sinCityHistory(): SinCityPerformanceFile {
  return { generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "sin-city-tracking-v1", trackingStartDate: "2026-08-12", records: [] };
}

function topHrSummary(): TopHrPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "top-hr-tracking-v1", trackingStartDate: "2026-06-30",
    totalTrackedDates: 1, mostRecentGradedDate: "2026-08-11",
    overall: { picks: 1, gradedPicks: 1, hrHits: 0, hrHitRate: 0, avgOdds: 300, roiEligiblePicks: 1, oddsCoveragePercent: 100, flatBetRoi: -100 },
  };
}

function topHrHistory(): TopHrPerformanceFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "top-hr-tracking-v1", trackingStartDate: "2026-06-30",
    records: [{
      trackingModelVersion: "top-hr-tracking-v1", date: "2026-08-11", persistedAt: "2026-08-11T00:00:00Z",
      playerId: 1, playerName: "Top Hitter", team: "NYY", teamId: 1, opponent: "BOS", opponentId: 2, gameId: 100,
      hrQualityScore: 75, rank: 1, slot: 1, odds: "+300", oddsBook: "book", impliedProbability: 0.25,
      lineupStatus: "confirmed", modelVersion: "mlb-hr-quality-v1.1", resultStatus: "miss",
      battingLine: { atBats: 4, hits: 1, doubles: 0, homeRuns: 0, totalBases: 1, rbi: 0, runs: 0, baseOnBalls: 0, strikeOuts: 1 },
      gradedAt: "2026-08-12T00:00:00Z", snapshotBasis: "final-intraday",
    }],
  };
}

function topKSummary(): TopKPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "top-k-tracking-v1", trackingStartDate: "2026-08-12",
    totalTrackedDates: 1, mostRecentGradedDate: null,
    overall: { picks: 1, wins: 0, losses: 0, pushes: 0, winRate: null, avgEdge: 1.2, avgKScore: 55, gradedPicks: 0, roiEligiblePicks: 0, oddsCoveragePercent: 0, flatBetRoi: null, actualKTotal: null, avgActualK: null, avgIp: null, kPerNine: null },
  };
}

function topKHistory(): TopKPerformanceFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "top-k-tracking-v1", trackingStartDate: "2026-08-12",
    records: [{
      trackingModelVersion: "top-k-tracking-v1", date: "2026-08-12", persistedAt: "2026-08-12T00:00:00Z",
      pitcherId: 1, pitcherName: "Top Pitcher", team: "NYY", opponent: "BOS", gameId: 100, gameKey: "BOS@NYY",
      side: "over", slot: 1, line: 4.5, odds: "-150", oddsBook: "book", projectedKs: 5.9, projectionEdge: 1.4,
      kScore: 55, valueScore: 60, projectedIP: 5.5, workloadConfidenceGrade: "A", modelVersion: "mlb-k-projection-v2-shadow",
      resultStatus: "pending", actualStrikeOuts: null, actualInningsPitched: null, battersFaced: null, result: null, gradedAt: null,
    }],
  };
}

vi.mock("@/hooks/useMlbHrModelPerformance", () => ({
  useMlbHrModelPerformance: () => ({ summary: hrSummary(), history: hrHistory(), loading: false, error: null }),
}));

vi.mock("@/hooks/useMlbNumerologyPerformance", () => ({
  useMlbNumerologyPerformance: () => ({ summary: numerologySummary(), history: numerologyHistory(), loading: false, error: null }),
}));

vi.mock("@/hooks/useSinCityPerformance", () => ({
  useSinCityPerformance: () => ({ summary: sinCitySummary(), history: sinCityHistory(), loading: false, error: null }),
}));

vi.mock("@/hooks/useTopHrPerformance", () => ({
  useTopHrPerformance: () => ({ summary: topHrSummary(), history: topHrHistory(), loading: false, error: null }),
}));

vi.mock("@/hooks/useTopKPerformance", () => ({
  useTopKPerformance: () => ({ summary: topKSummary(), history: topKHistory(), loading: false, error: null }),
}));

const { default: MlbPerformancePreview } = await import("./MlbPerformancePreview");

function renderPage() {
  return render(
    <MemoryRouter>
      <MlbPerformancePreview />
    </MemoryRouter>,
  );
}

describe("MlbPerformancePreview", () => {
  it("renders all five section headings from real schema data", () => {
    renderPage();
    expect(screen.getByText("HR Model Performance")).toBeInTheDocument();
    expect(screen.getByText("Numerology Performance")).toBeInTheDocument();
    expect(screen.getByText("Sin City Performance")).toBeInTheDocument();
    expect(screen.getByText("Top HR Props Performance")).toBeInTheDocument();
    expect(screen.getByText("Top K Props Performance")).toBeInTheDocument();
  });

  it("renders a return link to the MLB Hub", () => {
    renderPage();
    const backLink = screen.getByRole("link", { name: /MLB Hub/ });
    expect(backLink).toHaveAttribute("href", "/mlb");
  });

  it("renders contextual links to HR Props, Numerology, and K Props", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "HR Props" })).toHaveAttribute("href", "/mlb/hr-props");
    expect(screen.getByRole("link", { name: "Numerology" })).toHaveAttribute("href", "/mlb/numerology");
    expect(screen.getByRole("link", { name: "K Props" })).toHaveAttribute("href", "/mlb/strikeout-props");
  });

  it("no longer describes itself as a hidden/internal-only preview", () => {
    renderPage();
    expect(screen.queryByText(/Internal review page/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not linked from site navigation/)).not.toBeInTheDocument();
    expect(screen.getByText("MLB Results Tracker")).toBeInTheDocument();
  });

  it("renders HR summary stat tiles from the summary schema", () => {
    renderPage();
    expect(screen.getByText("Graded Predictions")).toBeInTheDocument();
    expect(screen.getByText("Overall HR Rate")).toBeInTheDocument();
  });

  it("renders numerology summary stat tiles from the summary schema", () => {
    renderPage();
    expect(screen.getByText("Total Finalized")).toBeInTheDocument();
    expect(screen.getByText("Avg Total Bases")).toBeInTheDocument();
  });

  it("explains why Sin City has no fabricated historical data", () => {
    renderPage();
    expect(screen.getByText(/could not be safely reconstructed/)).toBeInTheDocument();
  });

  it("discloses that Top HR historical results use the final archived snapshot", () => {
    renderPage();
    expect(screen.getByText(/final archived model snapshot/)).toBeInTheDocument();
  });

  it("shows ROI odds-coverage context wherever ROI is displayed", () => {
    renderPage();
    expect(screen.getByText(/1 of 1 graded picks had archived odds/)).toBeInTheDocument();
  });
});
