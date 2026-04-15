export const MLB_DASH = "-";

export function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIp(ip: string | number | null | undefined) {
  if (ip == null) return null;
  const str = String(ip);
  const [whole, fraction] = str.split(".");
  const innings = Number(whole);
  const outs = Number(fraction || 0);
  if (!Number.isFinite(innings) || !Number.isFinite(outs)) return null;
  return innings + outs / 3;
}

export function formatDecimal(value: number | string | null | undefined, digits = 2) {
  const parsed = asNumber(value);
  return parsed == null ? MLB_DASH : parsed.toFixed(digits);
}

export function formatPercent(value: number | string | null | undefined, digits = 1) {
  const parsed = asNumber(value);
  return parsed == null ? MLB_DASH : `${parsed.toFixed(digits)}%`;
}

export function formatAvgLike(value: number | string | null | undefined) {
  const parsed = asNumber(value);
  return parsed == null ? MLB_DASH : parsed.toFixed(3);
}

export function formatFactor(value: number | string | null | undefined) {
  const parsed = asNumber(value);
  return parsed == null ? MLB_DASH : `${Math.round(parsed)}`;
}

export function formatRecord(value: string | null | undefined) {
  return value || MLB_DASH;
}

export function formatIp(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? parseIp(value) : asNumber(value);
  return parsed == null ? MLB_DASH : parsed.toFixed(1);
}

export function computeK9(strikeouts: number | null, inningsPitched: string | number | null | undefined) {
  const ip = parseIp(inningsPitched);
  if (strikeouts == null || ip == null || ip <= 0) return null;
  return (strikeouts / ip) * 9;
}

export function computeHr9(homeRuns: number | null, inningsPitched: string | number | null | undefined) {
  const ip = parseIp(inningsPitched);
  if (homeRuns == null || ip == null || ip <= 0) return null;
  return (homeRuns / ip) * 9;
}

export function computePercent(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

export function formatMetric(value: number | null, format: string) {
  switch (format) {
    case "era":
    case "whip":
    case "k9":
    case "rate3":
      return formatDecimal(value, 2);
    case "percent":
      return formatPercent(value, 1);
    case "ops":
    case "avg":
      return formatAvgLike(value);
    case "factor":
      return formatFactor(value);
    case "ip":
      return formatIp(value);
    default:
      return formatDecimal(value, 2);
  }
}
