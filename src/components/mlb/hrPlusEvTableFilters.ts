import type { HrPlusEvValuation } from "@/lib/mlb/hrPlusEvModel";

export type PlusEvValueFilter = "all" | "STRONG +EV" | "MODERATE +EV" | "FAIR" | "OVERPRICED";

export function matchesPlusEvValueFilter(row: HrPlusEvValuation, filter: PlusEvValueFilter): boolean {
  if (filter === "all") return true;
  return row.label === filter;
}

export function filterPlusEvRows(
  rows: readonly HrPlusEvValuation[],
  options: { value: PlusEvValueFilter; positiveOnly: boolean },
): HrPlusEvValuation[] {
  return rows.filter((row) => {
    if (!matchesPlusEvValueFilter(row, options.value)) return false;
    if (options.positiveOnly && (row.ev == null || row.ev <= 0)) return false;
    return true;
  });
}
