// Types for the "Top HR Props" forward-tracking artifacts: a snapshot of the
// EXACT players shown to users under "Top HR Props Today" on /mlb/hr-props
// (visibleBestBets.slice(0, 3) of hr-props-best-bets.json's bestBets array,
// selected by scripts/lib/mlb-hr-selection.mjs's selectDeterministicHrPicks
// -- this file does not define or alter that selection rule).

export const TOP_HR_TRACKING_MODEL_VERSION = "top-hr-tracking-v1";

export interface TopHrBattingLine {
  atBats: number | null;
  hits: number | null;
  doubles: number | null;
  homeRuns: number | null;
  totalBases: number | null;
  rbi: number | null;
  runs: number | null;
  baseOnBalls: number | null;
  strikeOuts: number | null;
}

export interface TopHrPickRecord {
  trackingModelVersion: string;
  date: string;
  persistedAt: string;
  playerId: number;
  playerName: string;
  team: string;
  teamId: number | null;
  opponent: string;
  opponentId: number | null;
  gameId: number;
  hrQualityScore: number | null;
  rank: number | null;
  /** 1-3: position within the "Top HR Props Today" slice shown on the site that day. */
  slot: number;
  odds: string | null;
  oddsBook: string | null;
  impliedProbability: number | null;
  lineupStatus: string | null;
  modelVersion: string | null;
  resultStatus: "pending" | "hit" | "miss" | "did_not_play" | "unresolved";
  battingLine: TopHrBattingLine | null;
  gradedAt: string | null;
  /** Set only by the historical backfill script -- distinguishes reconstructed-from-archive rows from live forward-persisted ones. */
  backfilled?: boolean;
  /**
   * "pregame": persistedAt is the actual pregame snapshot timestamp from the
   * live forward-tracking run that day.
   * "final-intraday": reconstructed from hr-prediction-history.json, whose
   * archive record for a date reflects that day's LAST generation run, not
   * necessarily the earliest picks a morning visitor saw. persistedAt for
   * these records is the archived record's own generatedAt timestamp.
   */
  snapshotBasis: "pregame" | "final-intraday";
}

export interface TopHrPerformanceFile {
  generatedAt: string;
  trackingModelVersion: string;
  trackingStartDate: string;
  records: TopHrPickRecord[];
}

export interface TopHrOverallSummary {
  picks: number;
  /** Graded (hit/miss) picks -- the denominator odds coverage is measured against. */
  gradedPicks: number;
  hrHits: number;
  hrHitRate: number | null;
  avgOdds: number | null;
  /** Of gradedPicks, how many carried a valid persisted odds value and were actually used in flatBetRoi. */
  roiEligiblePicks: number;
  oddsCoveragePercent: number;
  /** Computed ONLY from roiEligiblePicks -- missing odds are excluded, never treated as 0/loss/+100. */
  flatBetRoi: number | null;
}

export interface TopHrPerformanceSummaryFile {
  generatedAt: string;
  trackingModelVersion: string;
  trackingStartDate: string;
  totalTrackedDates: number;
  mostRecentGradedDate: string | null;
  overall: TopHrOverallSummary;
}
