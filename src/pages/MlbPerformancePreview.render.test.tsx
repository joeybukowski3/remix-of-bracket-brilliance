import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { HrModelPerformanceSummary, HrPredictionHistoryFile } from "@/types/mlbHrModelPerformance";
import type { NumerologyPerformanceFile, NumerologyPerformanceSummary } from "@/types/mlbNumerologyPerformance";
import type { SinCityPerformanceFile, SinCityPerformanceSummaryFile } from "@/types/mlbSinCity";
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
    generatedAt: "2026-08-27T21:00:00Z",
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
    lastUpdatedAt: "2026-08-27T21:00:00Z",
    recordCount: 1,
    records: [{
      date: "2026-08-27", generatedAt: "2026-08-27T00:00:00Z", modelVersion: "mlb-hr-quality-v1.1",
      playerId: 1, playerName: "Test Hitter", teamId: 1, team: "NYY", opponentId: 2, opponent: "BOS",
      opposingPitcherId: null, opposingPitcherName: null, lineupStatus: "confirmed", battingOrder: 3,
      gameId: 100, hrQualityScore: 85, hrRank: 1, hrOddsYes: "+300", hrOddsBook: "book", marketImpliedProbability: 0.2,
      confidenceLevel: "high",
      result: { status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final", gradedAt: "2026-08-27T00:00:00Z", resolutionReason: null, attemptCount: 1, battingLine: { atBats: 4, hits: 2, totalBases: 5, rbi: 2, runs: 1, baseOnBalls: 0, strikeOuts: 1 } },
    }],
  };
}

const numerologyWindow = { totalRecords: 5, finalized: 5, pending: 0, missingOrNoResult: 0, hrHits: 1, hrHitRate: 20, averageHits: 1.2, averageTotalBases: 2.4, averageRBI: 1, averageRuns: 1, averageAtBats: 4 };

function numerologySummary(): NumerologyPerformanceSummary {
  return {
    generatedAt: "2026-08-27T21:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2", asOfDate: "2026-08-26",
    allTime: numerologyWindow, last7Days: numerologyWindow, last14Days: numerologyWindow, topPlay: numerologyWindow, over50: numerologyWindow,
    resultBuckets: {
      previousDay: { topPlay: { total: 1, finalized: 1, hasStats: false }, over50: { total: 1, finalized: 1, hasStats: false } },
      overall: { topPlay: { total: 1, finalized: 1, hasStats: false }, over50: { total: 1, finalized: 1, hasStats: false } },
    },
  };
}

function numerologyHistory(): NumerologyPerformanceFile {
  return {
    generatedAt: "2026-08-27T21:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2",
    records: [{
      id: "top-play|2026-08-27|1|2", date: "2026-08-27", generatedAt: "2026-08-27T00:00:00Z", modelVersion: "mlb-numerology-live-board-v0.2",
      selectionType: "top-play", isTopPlay: true, qualifiesOver50: false, player: "Numero Player", playerId: 1, team: "NYY", opponent: "BOS",
      gameId: 100, numerologyScore: 61, hrScoreRank: 3, hrOddsYes: "+280", hrOddsBook: "book", resultStatus: "final", hitHomeRun: false,
      numerologySignals: [],
      stats: { atBats: 4, hits: 1, runs: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 2, totalBases: 1, homeRuns: 0, stolenBases: 0 },
      finalizedAt: "2026-08-28T00:00:00Z", source: "mlb-statsapi",
    }],
  };
}

const sinCityLevel = { qualifiedPlays: 0, hrHits: 0, hrHitRate: null, averageOdds: null, gradedPlays: 0, roiEligiblePlays: 0, oddsCoveragePercent: 0, flatBetRoi: null };

function sinCitySummary(): SinCityPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "sin-city-tracking-v1", trackingStartDate: "2026-08-12",
    totalTrackedDates: 1, mostRecentGradedDate: "2026-08-27", fiveOfFive: sinCityLevel, fourOfFive: sinCityLevel,
  };
}

function sinCityHistory(): SinCityPerformanceFile {
  return { generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "sin-city-tracking-v1", trackingStartDate: "2026-08-12", records: [] };
}

function topKSummary(): TopKPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "top-k-tracking-v1", trackingStartDate: "2026-08-12",
    totalTrackedDates: 1, mostRecentGradedDate: "2026-08-27",
    overall: { picks: 1, wins: 0, losses: 0, pushes: 0, winRate: null, avgEdge: 1.2, avgKScore: 55, gradedPicks: 0, roiEligiblePicks: 0, oddsCoveragePercent: 0, flatBetRoi: null, actualKTotal: null, avgActualK: null, avgIp: null, kPerNine: null },
  };
}

function topKHistory(): TopKPerformanceFile {
  return {
    generatedAt: "2026-08-27T21:00:00Z", trackingModelVersion: "top-k-tracking-v1", trackingStartDate: "2026-08-12",
    records: [{
      trackingModelVersion: "top-k-tracking-v1", date: "2026-08-27", persistedAt: "2026-08-27T00:00:00Z",
      pitcherId: 1, pitcherName: "Top Pitcher", team: "NYY", opponent: "BOS", gameId: 100, gameKey: "BOS@NYY",
      side: "over", slot: 1, line: 4.5, odds: "-150", oddsBook: "book", projectedKs: 5.9, projectionEdge: 1.4,
      kScore: 55, valueScore: 60, projectedIP: 5.5, workloadConfidenceGrade: "A", modelVersion: "mlb-k-projection-v2-shadow",
      resultStatus: "pending", actualStrikeOuts: null, actualInningsPitched: null, battersFaced: null, result: null, gradedAt: null,
    }],
  };
}

vi.mock("@/hooks/useMlbHrModelPerformance", () => ({
  useMlbHrModelPerformance: () => ({ summary: hrSummary(), history: hrHistory(), loading: false, error: null, summaryError: null, historyError: null }),
}));

vi.mock("@/hooks/useMlbNumerologyPerformance", () => ({
  useMlbNumerologyPerformance: () => ({ summary: numerologySummary(), history: numerologyHistory(), loading: false, error: null, summaryError: null, historyError: null }),
}));

vi.mock("@/hooks/useSinCityPerformance", () => ({
  useSinCityPerformance: () => ({ summary: sinCitySummary(), history: sinCityHistory(), loading: false, error: null, summaryError: null, historyError: null }),
}));

vi.mock("@/hooks/useTopKPerformance", () => ({
  useTopKPerformance: () => ({ summary: topKSummary(), history: topKHistory(), loading: false, error: null, summaryError: null, historyError: null }),
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
  it("renders the compact tracker shell instead of stacked sections", () => {
    renderPage();
    expect(screen.getByText("MLB Performance Tracker")).toBeInTheDocument();
    expect(screen.queryByText("HR Model Performance")).not.toBeInTheDocument();
    expect(screen.queryByText("Numerology Performance")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin City Performance")).not.toBeInTheDocument();
  });

  it("renders the four main model tabs and no Top HR tab", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "HR Model" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Numerology" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sin City" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Top K Prop" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Top HR/ })).not.toBeInTheDocument();
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

  it("shows the HR Model tab active by default with its score-band category tabs", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "HR Model", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "80+" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "70-79" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "60-69" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "50-59" })).toBeInTheDocument();
  });

  it("shows a compact summary strip with tracker metrics rather than a stat-card grid", () => {
    renderPage();
    expect(screen.getByText("Plays")).toBeInTheDocument();
    expect(screen.getByText("HR Rate")).toBeInTheDocument();
  });
});
