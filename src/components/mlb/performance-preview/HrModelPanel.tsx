import { useMemo } from "react";
import type { HrPredictionHistoryFile } from "@/types/mlbHrModelPerformance";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { buildHrSummaryMetrics, filterHrRecords, HR_SCORE_BANDS, isHrRecordGraded, type HrScoreBandId } from "@/lib/mlb/performancePreviewTrackers/hrModelTracker";
import HrPerformanceTable from "./HrPerformanceTable";
import SummaryStrip from "./SummaryStrip";

export default function HrModelPanel({ history, window, band, referenceDate }: {
  history: HrPredictionHistoryFile;
  window: TimeWindowId;
  band: HrScoreBandId;
  referenceDate: string;
}) {
  const records = history.records;

  const gradedInWindow = useMemo(
    () => records.filter((r) => isHrRecordGraded(r) && isDateInWindow(r.date, window, referenceDate)),
    [records, window, referenceDate],
  );
  const filtered = useMemo(() => filterHrRecords(records, { window, band, referenceDate }), [records, window, band, referenceDate]);
  const metrics = useMemo(() => buildHrSummaryMetrics(filtered), [filtered]);
  const bandLabel = HR_SCORE_BANDS.find((b) => b.id === band)?.label ?? band;

  return (
    <div className="space-y-2">
      <SummaryStrip metrics={metrics} />

      {filtered.length === 0 && gradedInWindow.length > 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {gradedInWindow.length} graded plays loaded for this window · 0 qualified at {bandLabel}.
        </p>
      )}

      <HrPerformanceTable records={filtered} />
    </div>
  );
}
