/**
 * Shared display formatting for the NFL Performance Center. Every helper
 * here returns "—" for a null/undefined metric rather than "0" or "0.0%" --
 * the artifacts already encode "no graded results yet" as null, and this
 * layer must not silently reinterpret that as a real zero value.
 */

export function formatMetric(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

export function noGradedResultsLabel(n: number): string | null {
  return n === 0 ? "No graded results yet" : null;
}
