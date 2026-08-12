import { useMemo, useState } from "react";
import type { TopHrPerformanceSummaryFile, TopHrPickRecord } from "@/types/mlbTopHrPerformance";
import { getEtDateString, isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { aggregateBoxScore } from "./aggregateBoxScore";
import BoxScoreStrip from "./BoxScoreStrip";
import ExpandableGroup from "./ExpandableGroup";
import RoiCoverageNote from "./RoiCoverageNote";
import StatTile from "./StatTile";
import TimeWindowToggle from "./TimeWindowToggle";
import TopHrPerformanceTable from "./TopHrPerformanceTable";
import { pctOrDash } from "./format";

// ROI is only meaningful when odds coverage is high enough to trust the average.
const MIN_ODDS_COVERAGE_FOR_ROI = 50;

export default function TopHrSection({ summary, records, referenceDate = getEtDateString() }: { summary: TopHrPerformanceSummaryFile; records: TopHrPickRecord[]; referenceDate?: string }) {
  const [window, setWindow] = useState<TimeWindowId>("last30");

  const windowedRecords = useMemo(() => records.filter((r) => isDateInWindow(r.date, window, referenceDate)), [records, window, referenceDate]);
  const windowBoxScore = useMemo(() => aggregateBoxScore(windowedRecords.map((r) => r.battingLine)), [windowedRecords]);

  const showRoi = summary.overall.oddsCoveragePercent >= MIN_ODDS_COVERAGE_FOR_ROI;

  return (
    <section className="space-y-4 rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50/40 to-transparent p-4 sm:p-5">
      <div className="border-l-4 border-l-sky-500 pl-3">
        <h2 className="text-lg font-black text-slate-900">Top HR Props Performance</h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">Tracks the exact players shown under "Top HR Props Today" on the live HR Props page.</p>
        <p className="mt-1 text-xs text-slate-400">
          {summary.totalTrackedDates} tracked date{summary.totalTrackedDates === 1 ? "" : "s"}
          {summary.mostRecentGradedDate ? ` • most recent graded date ${summary.mostRecentGradedDate}` : " • no graded results yet"}.
        </p>
        <p className="mt-1 text-xs text-slate-400">Historical results use the final archived model snapshot for each tracked date -- see report for details.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <StatTile label="Picks" value={String(summary.overall.picks)} surfaceClassName="border-sky-100 bg-white" />
        <StatTile label="HR Hits" value={String(summary.overall.hrHits)} tone="positive" surfaceClassName="border-sky-100 bg-white" />
        <StatTile label="HR Hit Rate" value={pctOrDash(summary.overall.hrHitRate)} surfaceClassName="border-sky-100 bg-white" />
        <StatTile label="Avg Odds" value={summary.overall.avgOdds != null ? `${summary.overall.avgOdds >= 0 ? "+" : ""}${summary.overall.avgOdds}` : "—"} surfaceClassName="border-sky-100 bg-white" />
        <StatTile
          label="Flat-Bet ROI"
          value={showRoi && summary.overall.flatBetRoi != null ? `${summary.overall.flatBetRoi}%` : "— (low odds coverage)"}
          tone={showRoi ? ((summary.overall.flatBetRoi ?? 0) >= 0 ? "positive" : "negative") : "neutral"}
          surfaceClassName="border-sky-100 bg-white"
        />
      </div>
      <RoiCoverageNote roiEligible={summary.overall.roiEligiblePicks} graded={summary.overall.gradedPicks} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Box Score</div>
          <TimeWindowToggle value={window} onChange={setWindow} accentClassName="bg-sky-600" />
        </div>
        <BoxScoreStrip aggregate={windowBoxScore} accentClassName="border-sky-100" />
      </div>

      <ExpandableGroup title="Graded Picks" summary={`${windowedRecords.length} picks in this window`} defaultOpen accentClassName="border-l-sky-400 bg-sky-50/40">
        <TopHrPerformanceTable records={windowedRecords} />
      </ExpandableGroup>
    </section>
  );
}
