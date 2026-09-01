import { jkbHeatStyle, type WeeklyHeatTone } from "@/lib/shared/jkbHeat";

export type MlbStatTone = "positive" | "neutral" | "negative";

export function getWeatherIndicators(weather?: string | null) {
  if (!weather) return [];

  const normalized = weather.toLowerCase();
  const indicators: string[] = [];

  if (/\b(clear|sunny|sun)\b/.test(normalized)) indicators.push("☀️");
  if (/\b(rain|showers?|storm|thunder|precip|drizzle)\b/.test(normalized)) indicators.push("🌧️");
  if (/\b(cloud|cloudy|overcast|partly)\b/.test(normalized)) indicators.push("☁️");

  const temperatureMatch = weather.match(/(-?\d+(?:\.\d+)?)\s*(?:°|º)?\s*f\b/i);
  const temperature = temperatureMatch ? Number(temperatureMatch[1]) : null;
  if (temperature != null && temperature >= 85) indicators.push("🔥");
  if (temperature != null && temperature <= 55) indicators.push("🥶");

  const windMatch = weather.match(/(\d+(?:\.\d+)?)\s*(?:mph|m\.p\.h\.)/i);
  const wind = windMatch ? Number(windMatch[1]) : null;
  if (wind != null && wind >= 12) indicators.push("💨");

  return [...new Set(indicators)];
}

export function getStatToneFromPercentile(percentile: number | null | undefined): MlbStatTone {
  if (percentile == null) return "neutral";
  if (percentile >= 60) return "positive";
  if (percentile <= 40) return "negative";
  return "neutral";
}

export function getStatToneFromFactor(value: number | null | undefined, neutral = 1): MlbStatTone {
  if (value == null) return "neutral";
  if (value >= neutral + 0.03) return "positive";
  if (value <= neutral - 0.03) return "negative";
  return "neutral";
}

export function getStatToneClasses(tone: MlbStatTone) {
  if (tone === "positive") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (tone === "negative") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

/**
 * Goodness / favorability tone. Distinct question from {@link MlbStatTone}
 * ("is this bat hot right now?" — sanctioned red-hot / blue-cold): this asks
 * "is this value good?" and follows JKB Heat direction (docs/DECISIONS.md
 * KS-010) — favorable is green, unfavorable is red, genuinely mid is slate.
 * Used for the lineup / team-form mini displays where a better AVG or a better
 * record is favorable, not "hot".
 *
 * This is a thin semantic adapter: it does NOT define any colors of its own.
 * Each tone maps to a band of the shared JKB Heat scale and the actual fill is
 * produced by `jkbHeatStyle` (`src/lib/shared/jkbHeat.ts`), so there is one
 * source of truth for what "favorable green" / "unfavorable red" look like.
 */
export type MlbGoodnessTone = "favorable" | "neutral" | "unfavorable";

/** Semantic map onto the shared JKB Heat vocabulary — no local palette. */
const GOODNESS_TONE_TO_HEAT: Record<MlbGoodnessTone, WeeklyHeatTone> = {
  favorable: "light-green", // JKB Heat "Above Average" band
  neutral: "neutral", //       JKB Heat "Average" band
  unfavorable: "light-red", // JKB Heat "Below Average" band
};

/** Inline style for a goodness badge, derived entirely from shared JKB Heat. */
export function getGoodnessToneStyle(tone: MlbGoodnessTone) {
  return jkbHeatStyle(GOODNESS_TONE_TO_HEAT[tone]);
}

export function getStatToneStyle(tone: MlbStatTone) {
  if (tone === "positive") {
    return {
      backgroundColor: "#fef2f2",
      color: "#991b1b",
      borderColor: "#fecaca",
    };
  }
  if (tone === "negative") {
    return {
      backgroundColor: "#f0f9ff",
      color: "#075985",
      borderColor: "#bae6fd",
    };
  }
  return {
    backgroundColor: "#f8fafc",
    color: "#475569",
    borderColor: "#cbd5e1",
  };
}
