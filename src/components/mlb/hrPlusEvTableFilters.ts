import type { HrPlusEvSampleLabel, HrPlusEvValuation } from "@/lib/mlb/hrPlusEvModel";

export type PlusEvValueFilter = "all" | "STRONG +EV" | "MODERATE +EV" | "FAIR" | "OVERPRICED";
export type PlusEvSampleFilter = "all" | "established" | "pa125" | "limited";

export function matchesPlusEvValueFilter(row: HrPlusEvValuation, filter: PlusEvValueFilter): boolean {
  if (filter === "all") return true;
  return row.label === filter;
}

export function matchesPlusEvSampleFilter(row: HrPlusEvValuation, filter: PlusEvSampleFilter): boolean {
  if (filter === "all") return true;
  const sample = row.sampleLabel;
  if (sample == null) return false;
  if (filter === "established") return sample === "ESTABLISHED";
  if (filter === "pa125") return sample === "MODERATE" || sample === "ESTABLISHED";
  return sample === "VERY LIMITED" || sample === "LIMITED";
}

export function filterPlusEvRows(
  rows: readonly HrPlusEvValuation[],
  options: { value: PlusEvValueFilter; sample: PlusEvSampleFilter; positiveOnly: boolean },
): HrPlusEvValuation[] {
  return rows.filter((row) => {
    if (!matchesPlusEvValueFilter(row, options.value)) return false;
    if (!matchesPlusEvSampleFilter(row, options.sample)) return false;
    if (options.positiveOnly && (row.ev == null || row.ev <= 0)) return false;
    return true;
  });
}

export function sampleDisplayLabel(sample: HrPlusEvSampleLabel | null): string | null {
  if (sample == null) return null;
  if (sample === "MODERATE") return "MODERATE SAMPLE";
  return sample;
}
