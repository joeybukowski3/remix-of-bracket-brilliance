// Types for the HR model's static grading artifacts:
//   public/data/mlb/hr-model-performance.json   (aggregate summary)
//   public/data/mlb/hr-prediction-history.json  (row-level history)
// These files are written by scripts/build-mlb-hr-performance-summary.mjs
// and scripts/grade-mlb-hr-results.mjs — this file only describes their
// existing shape, it does not change how they're produced.

export interface HrPerformanceBucket {
  predictions: number;
  eligibleGraded: number;
  hrHits: number;
  actualHrRate: number | null;
  avgMarketImpliedProbability: number | null;
  avgOdds: number | null;
  flatBetRoi: number | null;
  calibrationDifference: number | null;
  sampleSize: number;
}

export interface HrModelPerformanceSummary {
  generatedAt: string;
  note: string;
  totalGradedRecords: number;
  byScoreBand: Record<string, HrPerformanceBucket>;
  byConfidenceLevel: Record<string, HrPerformanceBucket>;
  byLineupStatus: Record<string, HrPerformanceBucket>;
  byModelVersion: Record<string, HrPerformanceBucket>;
  sampleSizeWarning: string | null;
  calibrationReadiness: {
    sampleCount: number;
    hrOutcomeCount: number;
    calendarDayCount: number;
    meetsMinimumThreshold: boolean;
    warnings: string[];
    readyForCalibrationFit: boolean;
  };
}

/** Additive enrichment written by scripts/backfill-mlb-performance-history.mjs. */
export interface HrBattingLine {
  atBats: number | null;
  hits: number | null;
  /** Present only for records backfilled after doubles capture was added; older-backfilled records may still be missing it until re-run. */
  doubles?: number | null;
  totalBases: number | null;
  rbi: number | null;
  runs: number | null;
  baseOnBalls: number | null;
  strikeOuts: number | null;
}

export interface HrPredictionResult {
  status: "pending" | "hit" | "miss" | "did_not_play" | "postponed" | "cancelled" | "suspended" | "unresolved_retryable" | "unresolved_terminal";
  hrCount: number | null;
  plateAppearances: number | null;
  gameFinalStatus: string | null;
  gradedAt: string | null;
  resolutionReason: string | null;
  attemptCount: number;
  /** Present only after the backfill script has enriched this record. */
  battingLine?: HrBattingLine;
  battingLineBackfilledAt?: string;
}

export interface HrPredictionRecord {
  date: string;
  generatedAt: string;
  modelVersion: string;
  playerId: number;
  playerName: string;
  teamId: number;
  team: string;
  opponentId: number;
  opponent: string;
  opposingPitcherId: number | null;
  opposingPitcherName: string | null;
  lineupStatus: string;
  battingOrder: number | null;
  gameId: number;
  hrQualityScore: number | null;
  hrRank: number | null;
  hrOddsYes: string | null;
  hrOddsBook: string | null;
  marketImpliedProbability: number | null;
  confidenceLevel: string | null;
  result: HrPredictionResult;
}

export interface HrPredictionHistoryFile {
  schemaVersion: number;
  lastUpdatedAt: string;
  recordCount: number;
  records: HrPredictionRecord[];
}
