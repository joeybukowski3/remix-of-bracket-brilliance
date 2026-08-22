/** Throws if any numeric value in `values` is NaN or +/-Infinity. Used by tests and ingestion QA. */
export function assertFiniteValues(label: string, values: Iterable<number | null>): void {
  for (const value of values) {
    if (value === null) continue;
    if (!Number.isFinite(value)) {
      throw new Error(`${label}: non-finite numeric value encountered (${value})`);
    }
  }
}

export function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
