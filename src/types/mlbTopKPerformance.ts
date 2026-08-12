// Types for the "Top K Props" forward-tracking artifacts: a snapshot of the
// EXACT pitchers shown under "Best K Prop Bets" on /mlb/strikeout-props
// (src/lib/mlb/kPropBestBets.ts's buildKPropBestBets, up to 3 Over + 3
// Under picks) -- this file does not define or alter that selection rule.
//
// No historical archive exists for K props, so tracking is forward-only
// from whenever persist-top-k-picks.ts first ran.

export const TOP_K_TRACKING_MODEL_VERSION = "top-k-tracking-v1";

export type KPropSide = "over" | "under";
export type KPropResult = "WIN" | "LOSS" | "PUSH" | null;

export interface TopKPickRecord {
  trackingModelVersion: string;
  date: string;
  persistedAt: string;
  pitcherId: number;
  pitcherName: string;
  team: string;
  opponent: string;
  gameId: number;
  gameKey: string;
  side: KPropSide;
  /** 1-3: position within the Over/Under best-bets list for that side. */
  slot: number;
  line: number;
  odds: string | null;
  oddsBook: string | null;
  projectedKs: number;
  projectionEdge: number;
  kScore: number;
  valueScore: number;
  projectedIP: number | null;
  workloadConfidenceGrade: string | null;
  modelVersion: string | null;
  resultStatus: "pending" | "final" | "did_not_play";
  actualStrikeOuts: number | null;
  /** Raw MLB API innings-pitched string, e.g. "6.1" (6 and 1/3 innings). */
  actualInningsPitched: string | null;
  battersFaced: number | null;
  result: KPropResult;
  gradedAt: string | null;
}

export interface TopKPerformanceFile {
  generatedAt: string;
  trackingModelVersion: string;
  trackingStartDate: string;
  records: TopKPickRecord[];
}

export interface TopKOverallSummary {
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  avgEdge: number | null;
  avgKScore: number | null;
  /** Graded (WIN/LOSS/PUSH) picks -- the denominator odds coverage is measured against. */
  gradedPicks: number;
  /** Of gradedPicks, how many carried a valid persisted odds value and were actually used in flatBetRoi. */
  roiEligiblePicks: number;
  oddsCoveragePercent: number;
  /** Computed ONLY from roiEligiblePicks -- missing odds are excluded, never treated as 0/loss/+100. */
  flatBetRoi: number | null;
  actualKTotal: number | null;
  avgActualK: number | null;
  avgIp: number | null;
  kPerNine: number | null;
}

export interface TopKPerformanceSummaryFile {
  generatedAt: string;
  trackingModelVersion: string;
  trackingStartDate: string;
  totalTrackedDates: number;
  mostRecentGradedDate: string | null;
  overall: TopKOverallSummary;
}
