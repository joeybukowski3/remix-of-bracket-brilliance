import type { PgaModelStatColumn } from "@/lib/pga/tournamentConfig";

export type RawPgaPlayer = {
  "Player Name": string;
  Salary?: number | null;
  "HT # Rounds": number | null;
  "Course True SG": number | null;
  "2021": string | null;
  "2022": string | null;
  "2023": string | null;
  "2024": string | null;
  "2025": string | null;
  "SG: Approach the Green"?: number | null;
  "SG: Around the Green"?: number | null;
  "SG: Putting"?: number | null;
  "Par 4 Scoring Average"?: number | null;
  "Driving Accuracy %"?: number | null;
  "Bogey Avoidance"?: number | null;
  "Birdie or Better 125-150 yds"?: number | null;
  "Birdie or Better <125 yds"?: number | null;
  TrendRank: number | null;
  "Masters 2026": string | null;
  "SG: Approach the Green_rank": number | null;
  "SG: Around the Green_rank": number | null;
  "SG: Putting_rank": number | null;
  "Par 4 Scoring Average_rank": number | null;
  "Driving Accuracy %_rank": number | null;
  "Bogey Avoidance_rank": number | null;
  "Birdie or Better 125-150 yds_rank": number | null;
  "Birdie or Better <125 yds_rank": number | null;
};

export type PgaWeightKey =
  | "sgApproach"
  | "par4"
  | "drivingAccuracy"
  | "bogeyAvoidance"
  | "sgAroundGreen"
  | "trendRank"
  | "birdie125150"
  | "sgPutting"
  | "birdieUnder125"
  | "courseTrueSg";

export type PgaWeights = Record<PgaWeightKey, number>;

export type PgaWeightDefinition = {
  key: PgaWeightKey;
  label: string;
  category: "Ball Striking" | "Short Game" | "Scoring" | "Form";
  min: number;
  max: number;
  step: number;
};

export type PgaPlayerInput = {
  id: string;
  player: string;
  salary?: number | null;
  courseHistoryRounds: number | null;
  courseHistoryScore: number | null;
  cutsLastFive: string;
  relatedEventFinish: string | null;
  recentFinishes: Array<string | null>;
  statRanks: {
    trendRank: number | null;
    sgApproachRank: number | null;
    par4Rank: number | null;
    drivingAccuracyRank: number | null;
    bogeyAvoidanceRank: number | null;
    sgAroundGreenRank: number | null;
    birdie125150Rank: number | null;
    sgPuttingRank: number | null;
    birdieUnder125Rank: number | null;
  };
};

export type PlayerModelRow = {
  id: string;
  player: string;
  score: number;
  rank: number;
  trendRank: number | null;
  courseHistoryRounds: number | null;
  cutsLastFive: string;
  recentFinishes: Array<string | null>;
  relatedEventFinish: string | null;
  sgApproachRank: number | null;
  par4Rank: number | null;
  drivingAccuracyRank: number | null;
  bogeyAvoidanceRank: number | null;
  sgAroundGreenRank: number | null;
  birdie125150Rank: number | null;
  sgPuttingRank: number | null;
  birdieUnder125Rank: number | null;
  courseHistoryScore: number | null;
};

export type PgaTournamentMeta = {
  title: string;
  tournament: string;
  venue: string;
  fieldSize: number;
  fieldAverage: string;
  cutLine: string;
  eventType: string;
  noCutLabel: string;
  picksPath: string;
};

export type PgaTopProjection = {
  id: string;
  player: string;
  rank: number;
  score: number;
  note: string;
};

export type PgaModelHistoryLabels = {
  trendLabel: string;
  trendTooltip: string;
  courseRoundsLabel: string;
  courseRoundsTooltip: string;
  relatedEventLabel: string;
  relatedEventTooltip: string;
  cutsLabel: string;
  cutsTooltip: string;
  courseHistoryScoreLabel: string;
  courseHistoryScoreTooltip: string;
};

export type PgaModelTableConfig = {
  title: string;
  subtitle: string;
  historySectionTitle: string;
  statsSectionTitle: string;
  scoreSectionTitle: string;
  statColumns: PgaModelStatColumn[];
  historyLabels: PgaModelHistoryLabels;
  mobileCourseHistoryLabel: string;
  mobileNoCourseHistoryLabel: string;
};
