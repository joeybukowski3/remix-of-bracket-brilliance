import type { NumerologyPerformanceRecord } from "@/types/mlbNumerologyPerformance";

/** camelCase field key -> Title Case label, e.g. "personalDay" -> "Personal Day". Purely cosmetic -- never invents a category, just renders the real tracked field key readably. */
export function humanizeFieldLabel(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** The matched signal field keys for one record (deduped), e.g. ["jersey", "personalDay"]. */
export function matchedFields(record: NumerologyPerformanceRecord): string[] {
  const fields = (record.numerologySignals ?? []).filter((s) => s.matched).map((s) => s.field);
  return [...new Set(fields)];
}

/** Every distinct matched field key present across a set of records, sorted for stable filter-chip ordering. */
export function collectMatchFieldOptions(records: NumerologyPerformanceRecord[]): string[] {
  const all = new Set<string>();
  for (const record of records) {
    for (const field of matchedFields(record)) all.add(field);
  }
  return [...all].sort();
}

/** "Combo" semantics: a record qualifies only if it contains every selected field (intersection), not just any of them. Empty selection matches everything. */
export function recordMatchesSelectedFields(record: NumerologyPerformanceRecord, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const fields = new Set(matchedFields(record));
  return selected.every((field) => fields.has(field));
}
