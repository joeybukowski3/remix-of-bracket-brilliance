import type { PgaWeightDefinition, PgaWeights } from "@/lib/pga/pgaTypes";

export const PGA_MODEL_APPLIED_WEIGHTS_STORAGE_KEY = "pga:model:applied-weights";
export const PGA_ACTIVE_PRESET_STORAGE_KEY = "pga:model:active-preset";

// ── Presets ───────────────────────────────────────────────────────────
// Outright: ceiling play. Form + birdie-making + elite approach. Floor is irrelevant.
export const OUTRIGHT_WEIGHTS: PgaWeights = {
  sgApproach:      25,
  trendRank:       20,
  birdieUnder125:  12,
  birdie125150:     8,
  par4:            12,
  sgPutting:       10,
  sgAroundGreen:    5,
  bogeyAvoidance:   4,
  drivingAccuracy:  2,
  courseTrueSg:     2,
};

// Top 10: upside with slight course awareness. Form still leads.
export const TOP10_WEIGHTS: PgaWeights = {
  sgApproach:      22,
  trendRank:       15,
  par4:            13,
  birdieUnder125:  10,
  birdie125150:     8,
  sgPutting:       10,
  sgAroundGreen:    8,
  bogeyAvoidance:   7,
  drivingAccuracy:  4,
  courseTrueSg:     3,
};

// Top 20: balanced. Course fit starts mattering alongside form.
export const TOP20_WEIGHTS: PgaWeights = {
  sgApproach:      20,
  drivingAccuracy: 14,
  bogeyAvoidance:  14,
  par4:            12,
  sgAroundGreen:   10,
  courseTrueSg:    10,
  trendRank:        8,
  sgPutting:        7,
  birdie125150:     3,
  birdieUnder125:   2,
};

// Top 40: floor play. Course history + accuracy + bogey avoidance dominate.
export const TOP40_WEIGHTS: PgaWeights = {
  drivingAccuracy: 18,
  bogeyAvoidance:  18,
  courseTrueSg:    15,
  sgApproach:      15,
  par4:            12,
  sgAroundGreen:   10,
  sgPutting:        5,
  trendRank:        4,
  birdie125150:     2,
  birdieUnder125:   1,
};

// Default balanced (Harbour Town course-specific)
export const RBC_HERITAGE_WEIGHTS: PgaWeights = {
  sgApproach:      22,
  par4:            14,
  drivingAccuracy: 12,
  bogeyAvoidance:  12,
  sgAroundGreen:   10,
  trendRank:       10,
  birdie125150:     7,
  sgPutting:        6,
  birdieUnder125:   3,
  courseTrueSg:     4,
};

export type PgaPresetKey = "outright" | "top10" | "top20" | "top40" | "balanced";

export const PGA_PRESETS: Record<PgaPresetKey, { label: string; weights: PgaWeights; description: string; slug: string }> = {
  outright: {
    label: "Outright",
    slug: "outright",
    description: "Maximizes ceiling. Favors elite recent form and birdie-making over course fit.",
    weights: OUTRIGHT_WEIGHTS,
  },
  top10: {
    label: "Top 10",
    slug: "top-10",
    description: "Upside play balancing form, approach, and scoring over a consistent floor.",
    weights: TOP10_WEIGHTS,
  },
  top20: {
    label: "Top 20",
    slug: "top-20",
    description: "Balanced model weighting form and course fit equally.",
    weights: TOP20_WEIGHTS,
  },
  top40: {
    label: "Top 40",
    slug: "top-40",
    description: "Floor-first. Prioritizes course history, accuracy, and bogey avoidance.",
    weights: TOP40_WEIGHTS,
  },
  balanced: {
    label: "Balanced",
    slug: "balanced",
    description: "Default Harbour Town weights across all categories.",
    weights: RBC_HERITAGE_WEIGHTS,
  },
};

export const PGA_WEIGHT_DEFINITIONS: PgaWeightDefinition[] = [
  { key: "sgApproach",      label: "SG: Approach",            category: "Ball Striking", min: 0, max: 30, step: 1, rankKey: "SG: Approach the Green_rank" },
  { key: "drivingAccuracy", label: "Driving Accuracy",        category: "Ball Striking", min: 0, max: 20, step: 1, rankKey: "Driving Accuracy %_rank" },
  { key: "sgAroundGreen",   label: "SG: Around the Green",   category: "Short Game",   min: 0, max: 20, step: 1, rankKey: "SG: Around the Green_rank" },
  { key: "sgPutting",       label: "SG: Putting",             category: "Short Game",   min: 0, max: 20, step: 1, rankKey: "SG: Putting_rank" },
  { key: "par4",            label: "Par 4 Scoring",           category: "Scoring",      min: 0, max: 20, step: 1, rankKey: "Par 4 Scoring Average_rank" },
  { key: "bogeyAvoidance",  label: "Bogey Avoidance",         category: "Scoring",      min: 0, max: 20, step: 1, rankKey: "Bogey Avoidance_rank" },
  { key: "birdie125150",    label: "Birdie or Better 125-150",category: "Scoring",      min: 0, max: 15, step: 1, rankKey: "Birdie or Better 125-150 yds_rank" },
  { key: "birdieUnder125",  label: "Birdie or Better <125",   category: "Scoring",      min: 0, max: 15, step: 1, rankKey: "Birdie or Better <125 yds_rank" },
  { key: "trendRank",       label: "TrendRank",               category: "Form",         min: 0, max: 20, step: 1, rankKey: "TrendRank" },
  { key: "courseTrueSg",    label: "Course True SG",          category: "Form",         min: 0, max: 15, step: 1 },
];

export function getStoredPgaAppliedWeights(): PgaWeights {
  if (typeof window === "undefined") return { ...RBC_HERITAGE_WEIGHTS };
  try {
    const raw = window.localStorage.getItem(PGA_MODEL_APPLIED_WEIGHTS_STORAGE_KEY);
    if (!raw) return { ...RBC_HERITAGE_WEIGHTS };
    return { ...RBC_HERITAGE_WEIGHTS, ...(JSON.parse(raw) as Partial<PgaWeights>) };
  } catch {
    return { ...RBC_HERITAGE_WEIGHTS };
  }
}

export function storePgaAppliedWeights(weights: PgaWeights) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PGA_MODEL_APPLIED_WEIGHTS_STORAGE_KEY, JSON.stringify(weights));
}

export function getWeightsForPreset(preset: PgaPresetKey): PgaWeights {
  return { ...PGA_PRESETS[preset].weights };
}

export function detectActivePreset(weights: PgaWeights): PgaPresetKey | null {
  for (const [key, preset] of Object.entries(PGA_PRESETS) as [PgaPresetKey, typeof PGA_PRESETS[PgaPresetKey]][]) {
    if (JSON.stringify(weights) === JSON.stringify(preset.weights)) return key;
  }
  return null;
}
