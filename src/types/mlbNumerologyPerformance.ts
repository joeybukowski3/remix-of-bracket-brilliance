// Types for the numerology model's static grading artifacts:
//   public/data/mlb/numerology/performance-summary.json
//   public/data/mlb/numerology/performance.json
// Written by scripts/grade-mlb-numerology-plays.mjs — this file only
// describes the existing shape, it does not change grading logic.

export interface NumerologyPerformanceWindow {
  totalRecords: number;
  finalized: number;
  pending: number;
  missingOrNoResult: number;
  hrHits: number;
  hrHitRate: number | null;
  averageHits: number | null;
  averageTotalBases: number | null;
  averageRBI: number | null;
  averageRuns: number | null;
  averageAtBats: number | null;
}

export interface NumerologyResultBucket {
  total: number;
  finalized: number;
  hasStats: boolean;
  avg?: number | null;
  atBats?: number | null;
  hits?: number | null;
  homeRuns?: number | null;
  totalBases?: number | null;
  rbi?: number | null;
  runs?: number | null;
  baseOnBalls?: number | null;
  strikeOuts?: number | null;
}

export interface NumerologyPerformanceSummary {
  generatedAt: string;
  modelVersion: string;
  asOfDate: string;
  allTime: NumerologyPerformanceWindow;
  last7Days: NumerologyPerformanceWindow;
  last14Days: NumerologyPerformanceWindow;
  topPlay: NumerologyPerformanceWindow;
  over50: NumerologyPerformanceWindow;
  resultBuckets: {
    previousDay: { topPlay: NumerologyResultBucket; over50: NumerologyResultBucket };
    overall: { topPlay: NumerologyResultBucket; over50: NumerologyResultBucket };
  };
}

export interface NumerologySignal {
  label: string;
  matched: boolean;
  points: number | null;
  weight: number | null;
  detail: string;
  field: string;
  type: string;
  value: number | null;
  root: number | null;
}

export interface NumerologyStatLine {
  atBats: number | null;
  hits: number | null;
  runs: number | null;
  rbi: number | null;
  baseOnBalls: number | null;
  strikeOuts: number | null;
  totalBases: number | null;
  homeRuns: number | null;
  stolenBases: number | null;
}

export interface NumerologyPerformanceRecord {
  id: string;
  date: string;
  generatedAt: string;
  modelVersion: string;
  selectionType: "over-50" | "top-play";
  isTopPlay: boolean;
  qualifiesOver50: boolean;
  player: string;
  playerId: number;
  team: string;
  opponent: string;
  gameId: number;
  numerologyScore: number | null;
  hrScoreRank: number | null;
  hrOddsYes: string | null;
  hrOddsBook: string | null;
  numerologySignals: NumerologySignal[];
  resultStatus: "final" | "pending" | "missing-data" | string;
  hitHomeRun: boolean;
  stats: NumerologyStatLine | null;
  finalizedAt: string | null;
  source: string;
}

export interface NumerologyPerformanceFile {
  generatedAt: string;
  modelVersion: string;
  records: NumerologyPerformanceRecord[];
}
