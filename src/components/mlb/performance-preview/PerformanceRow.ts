import type { PreviewResultKind } from "./ResultBadge";

export interface PerformanceRowDetail {
  label: string;
  value: string;
}

/** Normalized row shape shared by the mobile accordion renderer across HR/Numerology/Sin City -- each section maps its own record type down to this before rendering. */
export interface PerformanceRow {
  key: string;
  date: string;
  player: string;
  team: string;
  resultKind: PreviewResultKind;
  compactLabel?: string;
  compactValue?: string;
  details: PerformanceRowDetail[];
}
