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

export const PGA_CUSTOM_MODEL_KEY = "custom-model";
export const PGA_TOP_20_PROFILE_KEY = "top20-profile";

export const PGA_TOP_20_PROFILE_WEIGHTS: Readonly<PgaWeights> = Object.freeze({
  sgApproach: 18,
  par4: 10,
  drivingAccuracy: 10,
  bogeyAvoidance: 13,
  sgAroundGreen: 8,
  trendRank: 18,
  birdie125150: 4,
  sgPutting: 7,
  birdieUnder125: 2,
  courseTrueSg: 10,
});

export const PGA_TOP_20_PROFILE_PRESET: PgaPresetDefinition = {
  key: PGA_TOP_20_PROFILE_KEY,
  label: "Top 20 Profile",
  description: "High-floor placement profile",
  weights: { ...PGA_TOP_20_PROFILE_WEIGHTS },
};

export const PGA_WEIGHT_KEYS = PGA_WEIGHT_DEFINITIONS.map((definition) => definition.key);

const CUSTOM_WEIGHTS_STORAGE_VERSION = 1;

function getWeightsStorageKey(slug: string) {
  return `pga:model:${slug}:applied-weights`;
}

function getPresetStorageKey(slug: string) {
  return `pga:model:${slug}:active-preset`;
}

export function getPgaCustomWeightsStorageKey(slug: string) {
  return `pga:model:${slug}:custom-weights:v${CUSTOM_WEIGHTS_STORAGE_VERSION}`;
}

export function withPermanentPgaPresets(presets: PgaPresetDefinition[]): PgaPresetDefinition[] {
  return [
    ...presets
      .filter((preset) => preset.key !== PGA_TOP_20_PROFILE_KEY)
      .map((preset) => ({ ...preset, weights: { ...preset.weights } })),
    { ...PGA_TOP_20_PROFILE_PRESET, weights: { ...PGA_TOP_20_PROFILE_PRESET.weights } },
  ];
}

export function getStoredPgaAppliedWeights(slug: string, fallbackWeights: PgaWeights): PgaWeights {
  if (typeof window === "undefined") return { ...fallbackWeights };
  try {
    const raw = window.localStorage.getItem(getWeightsStorageKey(slug));
    if (!raw) return { ...fallbackWeights };
    return sanitizePgaWeights(JSON.parse(raw), fallbackWeights) ?? { ...fallbackWeights };
  } catch {
    return { ...fallbackWeights };
  }
}

export function storePgaAppliedWeights(slug: string, weights: PgaWeights) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getWeightsStorageKey(slug), JSON.stringify(weights));
}

export function getStoredPgaActivePreset(slug: string, presets: PgaPresetDefinition[], allowCustom = false): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getPresetStorageKey(slug));
    if (!raw || (!presets.some((preset) => preset.key === raw) && !(allowCustom && raw === PGA_CUSTOM_MODEL_KEY))) return null;
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
  if (preset) return { ...preset.weights };
  if (!presets[0]) throw new Error("At least one PGA model preset is required.");
  return { ...presets[0].weights };
}

export function detectActivePreset(weights: PgaWeights, presets: PgaPresetDefinition[]): string | null {
  for (const preset of presets) {
    if (PGA_WEIGHT_KEYS.every((key) => weights[key] === preset.weights[key])) return preset.key;
  }
  return null;
}

export function sanitizePgaWeights(value: unknown, fallbackWeights: PgaWeights): PgaWeights | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const next = { ...fallbackWeights };

  for (const key of PGA_WEIGHT_KEYS) {
    if (!(key in candidate)) continue;
    const weight = candidate[key];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) return null;
    next[key] = weight;
  }

  return next;
}

export function normalizePgaWeightsToPercent(weights: PgaWeights): PgaWeights | null {
  const sanitized = sanitizePgaWeights(weights, weights);
  if (!sanitized) return null;
  const total = PGA_WEIGHT_KEYS.reduce((sum, key) => sum + sanitized[key], 0);
  if (total <= 0) return null;

  const normalized = Object.fromEntries(
    PGA_WEIGHT_KEYS.map((key) => [key, Math.round((sanitized[key] / total) * 10_000) / 100]),
  ) as PgaWeights;
  const normalizedTotal = PGA_WEIGHT_KEYS.reduce((sum, key) => sum + normalized[key], 0);
  const adjustmentKey = [...PGA_WEIGHT_KEYS].reverse().find((key) => normalized[key] > 0) ?? PGA_WEIGHT_KEYS[0];
  normalized[adjustmentKey] = Math.round((normalized[adjustmentKey] + (100 - normalizedTotal)) * 100) / 100;
  return normalized;
}

export function getStoredPgaCustomWeights(slug: string, fallbackWeights: PgaWeights): PgaWeights {
  if (typeof window === "undefined") return { ...fallbackWeights };
  try {
    const raw = window.localStorage.getItem(getPgaCustomWeightsStorageKey(slug));
    if (!raw) return { ...fallbackWeights };
    const parsed = JSON.parse(raw) as { version?: unknown; weights?: unknown };
    if (parsed.version !== CUSTOM_WEIGHTS_STORAGE_VERSION) return { ...fallbackWeights };
    return sanitizePgaWeights(parsed.weights, fallbackWeights) ?? { ...fallbackWeights };
  } catch {
    return { ...fallbackWeights };
  }
}

export function storePgaCustomWeights(slug: string, weights: PgaWeights) {
  if (typeof window === "undefined") return false;
  const sanitized = sanitizePgaWeights(weights, weights);
  if (!sanitized) return false;
  window.localStorage.setItem(getPgaCustomWeightsStorageKey(slug), JSON.stringify({
    version: CUSTOM_WEIGHTS_STORAGE_VERSION,
    weights: sanitized,
  }));
  return true;
}
