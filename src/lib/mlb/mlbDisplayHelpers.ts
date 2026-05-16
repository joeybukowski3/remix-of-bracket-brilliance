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
