import type { PgaPresetDefinition } from "@/lib/pga/tournamentConfig";
import type { PgaWeightDefinition, PgaWeights } from "@/lib/pga/pgaTypes";

export const PGA_WEIGHT_DEFINITIONS: PgaWeightDefinition[] = [
  { key: "sgApproach", label: "SG: Approach", category: "Ball Striking", min: 0, max: 30, step: 1 },
  { key: "drivingAccuracy", label: "Driving Accuracy", category: "Ball Striking", min: 0, max: 20, step: 1 },
  { key: "sgAroundGreen", label: "SG: Around the Green", category: "Short Game", min: 0, max: 20, step: 1 },
  { key: "sgPutting", label: "SG: Putting", category: "Short Game", min: 0, max: 20, step: 1 },
  { key: "par4", label: "Par 4 Scoring", category: "Scoring", min: 0, max: 20, step: 1 },
  { key: "bogeyAvoidance", label: "Bogey Avoidance", category: "Scoring", min: 0, max: 20, step: 1 },
  { key: "birdie125150", label: "Birdie or Better 125-150", category: "Scoring", min: 0, max: 15, step: 1 },
  { key: "birdieUnder125", label: "Birdie or Better <125", category: "Scoring", min: 0, max: 15, step: 1 },
  { key: "trendRank", label: "TrendRank", category: "Form", min: 0, max: 20, step: 1 },
  { key: "courseTrueSg", label: "Course True SG", category: "Form", min: 0, max: 15, step: 1 },
];

function getWeightsStorageKey(slug: string) {
  return `pga:model:${slug}:applied-weights`;
}

function getPresetStorageKey(slug: string) {
  return `pga:model:${slug}:active-preset`;
}

export function getStoredPgaAppliedWeights(slug: string, fallbackWeights: PgaWeights): PgaWeights {
  if (typeof window === "undefined") return { ...fallbackWeights };
  try {
    const raw = window.localStorage.getItem(getWeightsStorageKey(slug));
    if (!raw) return { ...fallbackWeights };
    return { ...fallbackWeights, ...(JSON.parse(raw) as Partial<PgaWeights>) };
  } catch {
    return { ...fallbackWeights };
  }
}

export function storePgaAppliedWeights(slug: string, weights: PgaWeights) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getWeightsStorageKey(slug), JSON.stringify(weights));
}

export function getStoredPgaActivePreset(slug: string, presets: PgaPresetDefinition[]): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getPresetStorageKey(slug));
    if (!raw || !presets.some((preset) => preset.key === raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function storePgaActivePreset(slug: string, preset: string | null) {
  if (typeof window === "undefined") return;
  if (preset) {
    window.localStorage.setItem(getPresetStorageKey(slug), preset);
    return;
  }
  window.localStorage.removeItem(getPresetStorageKey(slug));
}

export function getWeightsForPreset(presets: PgaPresetDefinition[], presetKey: string): PgaWeights {
  const preset = presets.find((item) => item.key === presetKey);
  return preset ? { ...preset.weights } : { ...presets[0].weights };
}

export function detectActivePreset(weights: PgaWeights, presets: PgaPresetDefinition[]): string | null {
  for (const preset of presets) {
    if (JSON.stringify(weights) === JSON.stringify(preset.weights)) return preset.key;
  }
  return null;
}
