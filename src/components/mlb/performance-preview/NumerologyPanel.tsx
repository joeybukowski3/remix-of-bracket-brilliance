import { useMemo } from "react";
import type { NumerologyPerformanceFile } from "@/types/mlbNumerologyPerformance";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import {
  buildNumerologySummaryMetrics,
  filterNumerologyRecords,
  isNumerologyRecordFinalized,
  NUMEROLOGY_CATEGORIES,
  type NumerologyCategoryId,
} from "@/lib/mlb/performancePreviewTrackers/numerologyTracker";
import NumerologyPerformanceTable from "./NumerologyPerformanceTable";
import SummaryStrip from "./SummaryStrip";

export default function NumerologyPanel({ history, window, category, referenceDate }: {
  history: NumerologyPerformanceFile;
  window: TimeWindowId;
  category: NumerologyCategoryId;
  referenceDate: string;
}) {
  const records = history.records;

  const finalizedInWindow = useMemo(
    () => records.filter((r) => isNumerologyRecordFinalized(r) && isDateInWindow(r.date, window, referenceDate)),
    [records, window, referenceDate],
  );
  const filtered = useMemo(() => filterNumerologyRecords(records, { window, category, referenceDate }), [records, window, category, referenceDate]);
  const metrics = useMemo(() => buildNumerologySummaryMetrics(filtered), [filtered]);
  const categoryLabel = NUMEROLOGY_CATEGORIES.find((c) => c.id === category)?.label ?? category;

  return (
    <div className="space-y-2">
      <SummaryStrip metrics={metrics} />

      {filtered.length === 0 && finalizedInWindow.length > 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {finalizedInWindow.length} finalized plays loaded for this window · 0 qualified for {categoryLabel}.
        </p>
      )}

      <NumerologyPerformanceTable records={filtered} />
    </div>
  );
}
