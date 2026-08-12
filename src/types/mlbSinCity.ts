// Types for the forward-only Sin City tracking artifacts introduced by this
// preview feature:
//   public/data/mlb/sin-city-performance.json
//   public/data/mlb/sin-city-performance-summary.json
//
// Sin City qualification itself (5 factors, thresholds) is defined in
// src/lib/mlb/mlbHrFilter.ts and is NOT duplicated or changed here. These
// types describe a *persisted pregame snapshot* of that evaluation plus the
// postgame grading outcome, written by scripts/persist-sin-city-picks.mjs
// and scripts/grade-sin-city-picks.mjs.
//
// IMPORTANT: the "Wind Out" factor was never persisted historically (see
// backfill report), so no records exist before this feature's rollout date.
// SIN_CITY_TRACKING_MODEL_VERSION exists so that if the qualification rules
// in mlbHrFilter.ts change later, historical snapshots remain interpretable
// under the ruleset that produced them.

export const SIN_CITY_TRACKING_MODEL_VERSION = "sin-city-tracking-v1";

export interface SinCityFactorSnapshot {
  name: "Barrel%" | "Pull%" | "Hard Hit%" | "Exit Velo" | "Wind Out";
  value: number | null;
  threshold: number;
  pass: boolean;
}

export type SinCityQualificationLevel = "5/5" | "4/5";

export interface SinCityResultLine {
  atBats: number | null;
  hits: number | null;
  homeRuns: number | null;
  totalBases: number | null;
  rbi: number | null;
  runs: number | null;
  baseOnBalls: number | null;
  strikeOuts: number | null;
}

export interface SinCityPickRecord {
  trackingModelVersion: string;
  date: string;
  persistedAt: string;
  playerId: number;
  playerName: string;
  team: string;
  teamId: number;
  opponent: string;
  opponentId: number;
  gameId: number;
  qualificationLevel: SinCityQualificationLevel;
  matchCount: number;
  factors: SinCityFactorSnapshot[];
  hrOddsYes: string | null;
  hrOddsBook: string | null;
  resultStatus: "pending" | "hit" | "miss" | "did_not_play" | "unresolved";
  battingLine: SinCityResultLine | null;
  gradedAt: string | null;
}

export interface SinCityPerformanceFile {
  generatedAt: string;
  trackingModelVersion: string;
  trackingStartDate: string;
  records: SinCityPickRecord[];
}

export interface SinCityLevelSummary {
  qualifiedPlays: number;
  hrHits: number;
  hrHitRate: number | null;
  averageOdds: number | null;
  oddsCoveragePercent: number;
  flatBetRoi: number | null;
}

export interface SinCityPerformanceSummaryFile {
  generatedAt: string;
  trackingModelVersion: string;
  trackingStartDate: string;
  totalTrackedDates: number;
  mostRecentGradedDate: string | null;
  fiveOfFive: SinCityLevelSummary;
  fourOfFive: SinCityLevelSummary;
}
