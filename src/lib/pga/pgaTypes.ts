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
  rankKey?: keyof RawPgaPlayer;
};

export type PlayerModelRow = {
  id: string;
  player: string;
  score: number;
  rank: number;
  trendRank: number | null;
  htRounds: number | null;
  cutsLast5: string;
  finish2025: string | null;
  finish2024: string | null;
  finish2023: string | null;
  finish2022: string | null;
  finish2021: string | null;
  masters2026: string | null;
  sgApproachRank: number | null;
  par4Rank: number | null;
  drivingAccuracyRank: number | null;
  bogeyAvoidanceRank: number | null;
  sgAroundGreenRank: number | null;
  birdie125150Rank: number | null;
  sgPuttingRank: number | null;
  birdieUnder125Rank: number | null;
  courseTrueSg: number | null;
};

export type PgaTournamentMeta = {
  title: string;
  tournament: string;
  venue: string;
  fieldSize: number;
  fieldAverage: string;
  cutLine: string;
  eventType: string;
};

export type PgaTopProjection = {
  id: string;
  player: string;
  rank: number;
  score: number;
  note: string;
};
