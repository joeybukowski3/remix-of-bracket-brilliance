import { useMemo } from "react";
import type { SinCityPerformanceFile } from "@/types/mlbSinCity";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import {
  buildSinCitySummaryMetrics,
  filterSinCityRecords,
  SIN_CITY_CATEGORIES,
  type SinCityCategoryId,
} from "@/lib/mlb/performancePreviewTrackers/sinCityTracker";
import SinCityPerformanceTable from "./SinCityPerformanceTable";
import SummaryStrip from "./SummaryStrip";

export default function SinCityPanel({ history, window, category, referenceDate }: {
  history: SinCityPerformanceFile;
  window: TimeWindowId;
  category: SinCityCategoryId;
  referenceDate: string;
}) {
  const records = history.records;

  const inWindow = useMemo(() => records.filter((r) => isDateInWindow(r.date, window, referenceDate)), [records, window, referenceDate]);
  const filtered = useMemo(() => filterSinCityRecords(records, { window, category, referenceDate }), [records, window, category, referenceDate]);
  const metrics = useMemo(() => buildSinCitySummaryMetrics(filtered), [filtered]);
  const categoryLabel = SIN_CITY_CATEGORIES.find((c) => c.id === category)?.label ?? category;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        Forward tracking only, started {history.trackingStartDate}. Historical qualification before this date could not be safely reconstructed
        (the "Wind Out" factor was never persisted) -- no fabricated history is shown here.
      </p>

      <SummaryStrip metrics={metrics} />

      {filtered.length === 0 && inWindow.length > 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {inWindow.length} picks loaded for this window · 0 qualified for {categoryLabel}.
        </p>
      )}

      <SinCityPerformanceTable records={filtered} />
    </div>
  );
}
