import { useMemo, useState } from "react";
import type { TopKPerformanceSummaryFile, TopKPickRecord } from "@/types/mlbTopKPerformance";
import { getEtDateString, isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { inningsPitchedToDecimal } from "./inningsPitched";
import ExpandableGroup from "./ExpandableGroup";
import RoiCoverageNote from "./RoiCoverageNote";
import StatTile from "./StatTile";
import TimeWindowToggle from "./TimeWindowToggle";
import TopKPerformanceTable from "./TopKPerformanceTable";
import { numOrDash, pctOrDash } from "./format";

const MIN_ODDS_COVERAGE_FOR_ROI = 50;

function aggregatePitching(records: TopKPickRecord[]) {
  const graded = records.filter((r) => r.result === "WIN" || r.result === "LOSS" || r.result === "PUSH");
  const ks = graded.map((r) => r.actualStrikeOuts).filter((v): v is number => typeof v === "number");
  const ips = graded.map((r) => inningsPitchedToDecimal(r.actualInningsPitched)).filter((v): v is number => v != null);
  const totalKs = ks.reduce((a, b) => a + b, 0);
  const totalIp = ips.reduce((a, b) => a + b, 0);
  return {
    actualKTotal: ks.length ? totalKs : null,
    avgActualK: ks.length ? Number((totalKs / ks.length).toFixed(2)) : null,
    avgIp: ips.length ? Number((totalIp / ips.length).toFixed(2)) : null,
    kPerNine: totalIp > 0 ? Number(((totalKs / totalIp) * 9).toFixed(2)) : null,
  };
}

export default function TopKSection({ summary, records, referenceDate = getEtDateString() }: { summary: TopKPerformanceSummaryFile; records: TopKPickRecord[]; referenceDate?: string }) {
  const [window, setWindow] = useState<TimeWindowId>("last30");

  const windowedRecords = useMemo(() => records.filter((r) => isDateInWindow(r.date, window, referenceDate)), [records, window, referenceDate]);
  const windowPitching = useMemo(() => aggregatePitching(windowedRecords), [windowedRecords]);

  const showRoi = summary.overall.oddsCoveragePercent >= MIN_ODDS_COVERAGE_FOR_ROI;

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/40 to-transparent p-4 sm:p-5">
      <div className="border-l-4 border-l-emerald-500 pl-3">
        <h2 className="text-lg font-black text-slate-900">Top K Props Performance</h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">Tracks the exact pitchers shown under "Best K Prop Bets" on the live K Props page.</p>
        <p className="mt-1 text-xs text-slate-400">
          {summary.totalTrackedDates} tracked date{summary.totalTrackedDates === 1 ? "" : "s"}
          {summary.mostRecentGradedDate ? ` • most recent graded date ${summary.mostRecentGradedDate}` : " • no graded results yet"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Picks" value={String(summary.overall.picks)} surfaceClassName="border-emerald-100 bg-white" />
        <StatTile label="Wins" value={String(summary.overall.wins)} tone="positive" surfaceClassName="border-emerald-100 bg-white" />
        <StatTile label="Losses" value={String(summary.overall.losses)} tone="negative" surfaceClassName="border-emerald-100 bg-white" />
        <StatTile label="Pushes" value={String(summary.overall.pushes)} surfaceClassName="border-emerald-100 bg-white" />
        <StatTile label="Win Rate" value={pctOrDash(summary.overall.winRate)} surfaceClassName="border-emerald-100 bg-white" />
        <StatTile label="Avg Edge" value={numOrDash(summary.overall.avgEdge, 2)} surfaceClassName="border-emerald-100 bg-white" />
        <StatTile label="Avg K Score" value={numOrDash(summary.overall.avgKScore, 1)} surfaceClassName="border-emerald-100 bg-white" />
        <StatTile
          label="Flat-Bet ROI"
          value={showRoi && summary.overall.flatBetRoi != null ? `${summary.overall.flatBetRoi}%` : "— (low odds coverage)"}
          tone={showRoi ? ((summary.overall.flatBetRoi ?? 0) >= 0 ? "positive" : "negative") : "neutral"}
          surfaceClassName="border-emerald-100 bg-white"
        />
      </div>
      <RoiCoverageNote roiEligible={summary.overall.roiEligiblePicks} graded={summary.overall.gradedPicks} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Pitching Aggregate</div>
          <TimeWindowToggle value={window} onChange={setWindow} accentClassName="bg-emerald-600" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile label="Actual K" value={numOrDash(windowPitching.actualKTotal)} surfaceClassName="border-emerald-100 bg-white" />
          <StatTile label="Avg Actual K" value={numOrDash(windowPitching.avgActualK, 2)} surfaceClassName="border-emerald-100 bg-white" />
          <StatTile label="Avg IP" value={numOrDash(windowPitching.avgIp, 2)} surfaceClassName="border-emerald-100 bg-white" />
          <StatTile label="K/9" value={numOrDash(windowPitching.kPerNine, 2)} surfaceClassName="border-emerald-100 bg-white" />
        </div>
      </div>

      <ExpandableGroup title="Graded Picks" summary={`${windowedRecords.length} picks in this window`} defaultOpen accentClassName="border-l-emerald-400 bg-emerald-50/40">
        <TopKPerformanceTable records={windowedRecords} />
      </ExpandableGroup>
    </section>
  );
}
