import { useMemo, useState } from "react";
import type { SinCityPerformanceSummaryFile, SinCityPickRecord } from "@/types/mlbSinCity";
import { getEtDateString, isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { aggregateBoxScore } from "./aggregateBoxScore";
import BoxScoreStrip from "./BoxScoreStrip";
import ExpandableGroup from "./ExpandableGroup";
import SinCityPerformanceTable from "./SinCityPerformanceTable";
import StatTile from "./StatTile";
import TimeWindowToggle from "./TimeWindowToggle";
import { pctOrDash } from "./format";

function LevelSummary({ title, summary, accentClassName }: { title: string; summary: SinCityPerformanceSummaryFile["fiveOfFive"]; accentClassName: string }) {
  return (
    <div className={`rounded-xl border p-3 ${accentClassName}`}>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Qualified" value={String(summary.qualifiedPlays)} surfaceClassName="border-rose-100 bg-white" />
        <StatTile label="HR Hits" value={String(summary.hrHits)} tone="positive" surfaceClassName="border-rose-100 bg-white" />
        <StatTile label="HR Rate" value={pctOrDash(summary.hrHitRate)} surfaceClassName="border-rose-100 bg-white" />
        <StatTile label="Avg Odds" value={summary.averageOdds != null ? `${summary.averageOdds >= 0 ? "+" : ""}${summary.averageOdds}` : "—"} surfaceClassName="border-rose-100 bg-white" />
        <StatTile label="Flat-Bet ROI" value={summary.flatBetRoi != null ? `${summary.flatBetRoi}%` : "—"} tone={(summary.flatBetRoi ?? 0) >= 0 ? "positive" : "negative"} surfaceClassName="border-rose-100 bg-white" />
      </div>
    </div>
  );
}

export default function SinCitySection({ summary, records, referenceDate = getEtDateString() }: { summary: SinCityPerformanceSummaryFile; records: SinCityPickRecord[]; referenceDate?: string }) {
  const [window, setWindow] = useState<TimeWindowId>("last30");

  const fiveOfFiveRecords = useMemo(() => records.filter((r) => r.qualificationLevel === "5/5"), [records]);
  const fourOfFiveRecords = useMemo(() => records.filter((r) => r.qualificationLevel === "4/5"), [records]);

  const windowedRecords = useMemo(() => records.filter((r) => isDateInWindow(r.date, window, referenceDate)), [records, window, referenceDate]);
  const windowFiveOfFive = useMemo(() => windowedRecords.filter((r) => r.qualificationLevel === "5/5"), [windowedRecords]);
  const windowFourOfFive = useMemo(() => windowedRecords.filter((r) => r.qualificationLevel === "4/5"), [windowedRecords]);
  const boxScoreFiveOfFive = useMemo(() => aggregateBoxScore(windowFiveOfFive.map((r) => r.battingLine)), [windowFiveOfFive]);
  const boxScoreFourOfFive = useMemo(() => aggregateBoxScore(windowFourOfFive.map((r) => r.battingLine)), [windowFourOfFive]);

  return (
    <section className="space-y-4 rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50/40 to-transparent p-4 sm:p-5">
      <div className="border-l-4 border-l-rose-500 pl-3">
        <h2 className="text-lg font-black text-slate-900">Sin City Performance</h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          Forward tracking only, started {summary.trackingStartDate}. Historical Sin City qualification could not be safely reconstructed
          before this date because the "Wind Out" factor was never persisted (see report) -- no fabricated history is shown here.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {summary.totalTrackedDates} tracked date{summary.totalTrackedDates === 1 ? "" : "s"}
          {summary.mostRecentGradedDate ? ` • most recent graded date ${summary.mostRecentGradedDate}` : " • no graded results yet"}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LevelSummary title="5/5 Picks" summary={summary.fiveOfFive} accentClassName="border-rose-200 bg-rose-50/60" />
        <LevelSummary title="4/5 Picks" summary={summary.fourOfFive} accentClassName="border-orange-200 bg-orange-50/60" />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Box Score by Window</div>
          <TimeWindowToggle value={window} onChange={setWindow} accentClassName="bg-rose-600" />
        </div>
        {/* lg (not sm) so each strip keeps its own full-width horizontal box-score layout once it switches over -- side-by-side only kicks in once there's room for both at once. */}
        <div className="grid gap-2 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-rose-500">5/5</div>
            <BoxScoreStrip aggregate={boxScoreFiveOfFive} accentClassName="border-rose-100" />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-orange-500">4/5</div>
            <BoxScoreStrip aggregate={boxScoreFourOfFive} accentClassName="border-orange-100" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <ExpandableGroup
          title="Sin City 5/5 Results"
          summary={`${summary.fiveOfFive.qualifiedPlays} graded • ${summary.fiveOfFive.hrHits} HR hits • ${pctOrDash(summary.fiveOfFive.hrHitRate)} HR rate`}
          defaultOpen
          accentClassName="border-l-rose-400 bg-rose-50/50"
        >
          <SinCityPerformanceTable records={fiveOfFiveRecords} />
        </ExpandableGroup>
        <ExpandableGroup
          title="Sin City 4/5 Results"
          summary={`${summary.fourOfFive.qualifiedPlays} graded • ${summary.fourOfFive.hrHits} HR hits • ${pctOrDash(summary.fourOfFive.hrHitRate)} HR rate`}
          defaultOpen
          accentClassName="border-l-orange-400 bg-orange-50/50"
        >
          <SinCityPerformanceTable records={fourOfFiveRecords} />
        </ExpandableGroup>
      </div>
    </section>
  );
}
