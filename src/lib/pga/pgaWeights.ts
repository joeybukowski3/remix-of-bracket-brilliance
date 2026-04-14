import type { PgaWeightDefinition, PgaWeights } from "@/lib/pga/pgaTypes";

export const PGA_MODEL_APPLIED_WEIGHTS_STORAGE_KEY = "pga:model:applied-weights";

export const RBC_HERITAGE_WEIGHTS: PgaWeights = {
  sgApproach: 22,
  par4: 14,
  drivingAccuracy: 12,
  bogeyAvoidance: 12,
  sgAroundGreen: 10,
  trendRank: 10,
  birdie125150: 7,
  sgPutting: 6,
  birdieUnder125: 3,
  courseTrueSg: 4,
};

export const PGA_WEIGHT_DEFINITIONS: PgaWeightDefinition[] = [
  { key: "sgApproach", label: "SG: Approach", category: "Ball Striking", min: 0, max: 30, step: 1, rankKey: "SG: Approach the Green_rank" },
  { key: "drivingAccuracy", label: "Driving Accuracy", category: "Ball Striking", min: 0, max: 20, step: 1, rankKey: "Driving Accuracy %_rank" },
  { key: "sgAroundGreen", label: "SG: Around the Green", category: "Short Game", min: 0, max: 20, step: 1, rankKey: "SG: Around the Green_rank" },
  { key: "sgPutting", label: "SG: Putting", category: "Short Game", min: 0, max: 20, step: 1, rankKey: "SG: Putting_rank" },
  { key: "par4", label: "Par 4 Scoring", category: "Scoring", min: 0, max: 20, step: 1, rankKey: "Par 4 Scoring Average_rank" },
  { key: "bogeyAvoidance", label: "Bogey Avoidance", category: "Scoring", min: 0, max: 20, step: 1, rankKey: "Bogey Avoidance_rank" },
  { key: "birdie125150", label: "Birdie or Better 125-150", category: "Scoring", min: 0, max: 15, step: 1, rankKey: "Birdie or Better 125-150 yds_rank" },
  { key: "birdieUnder125", label: "Birdie or Better <125", category: "Scoring", min: 0, max: 15, step: 1, rankKey: "Birdie or Better <125 yds_rank" },
  { key: "trendRank", label: "TrendRank", category: "Form", min: 0, max: 20, step: 1, rankKey: "TrendRank" },
  { key: "courseTrueSg", label: "Course True SG", category: "Form", min: 0, max: 15, step: 1 },
];

export function getStoredPgaAppliedWeights() {
  if (typeof window === "undefined") return { ...RBC_HERITAGE_WEIGHTS };

  try {
    const raw = window.localStorage.getItem(PGA_MODEL_APPLIED_WEIGHTS_STORAGE_KEY);
    if (!raw) return { ...RBC_HERITAGE_WEIGHTS };

    const parsed = JSON.parse(raw) as Partial<PgaWeights>;
    return {
      ...RBC_HERITAGE_WEIGHTS,
      ...parsed,
    };
  } catch {
    return { ...RBC_HERITAGE_WEIGHTS };
  }
}

export function storePgaAppliedWeights(weights: PgaWeights) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(PGA_MODEL_APPLIED_WEIGHTS_STORAGE_KEY, JSON.stringify(weights));
}
