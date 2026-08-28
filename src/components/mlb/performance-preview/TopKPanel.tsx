import { useMemo } from "react";
import type { TopKPerformanceFile } from "@/types/mlbTopKPerformance";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { buildTopKSummaryMetrics, filterTopKRecords } from "@/lib/mlb/performancePreviewTrackers/topKTracker";
import SummaryStrip from "./SummaryStrip";
import TopKPerformanceTable from "./TopKPerformanceTable";

export default function TopKPanel({ history, window, referenceDate }: {
  history: TopKPerformanceFile;
  window: TimeWindowId;
  referenceDate: string;
}) {
  const records = history.records;

  const filtered = useMemo(() => filterTopKRecords(records, { window, referenceDate }), [records, window, referenceDate]);
  const metrics = useMemo(() => buildTopKSummaryMetrics(filtered), [filtered]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        Tracks the exact pitchers shown under "Best K Prop Bets" on the live K Props page (up to 3 Over + 3 Under picks/day). This selection rule
        is unchanged by this tracker.
      </p>

      <SummaryStrip metrics={metrics} />

      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Ranked Best-Value tiers (Top 5 / 6-10 / 11+) begin with a new tracking methodology, not this dataset -- see the disabled tabs above.
        Existing records only carry a per-side value score that is not comparable between Over and Under picks, and only the top 3 candidates per
        side were ever persisted, so there is no larger candidate pool to rank retroactively.
      </p>

      <TopKPerformanceTable records={filtered} />
    </div>
  );
}
