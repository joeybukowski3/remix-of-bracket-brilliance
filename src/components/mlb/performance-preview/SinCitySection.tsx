import { useMemo } from "react";
import type { SinCityPerformanceSummaryFile, SinCityPickRecord } from "@/types/mlbSinCity";
import ExpandableGroup from "./ExpandableGroup";
import SinCityPerformanceTable from "./SinCityPerformanceTable";
import StatTile from "./StatTile";
import { pctOrDash } from "./format";

function LevelSummary({ title, summary }: { title: string; summary: SinCityPerformanceSummaryFile["fiveOfFive"] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Qualified" value={String(summary.qualifiedPlays)} />
        <StatTile label="HR Hits" value={String(summary.hrHits)} tone="positive" />
        <StatTile label="HR Rate" value={pctOrDash(summary.hrHitRate)} />
        <StatTile label="Avg Odds" value={summary.averageOdds != null ? `${summary.averageOdds >= 0 ? "+" : ""}${summary.averageOdds}` : "—"} />
        <StatTile label="Flat-Bet ROI" value={summary.flatBetRoi != null ? `${summary.flatBetRoi}%` : "—"} tone={(summary.flatBetRoi ?? 0) >= 0 ? "positive" : "negative"} />
      </div>
    </div>
  );
}

export default function SinCitySection({ summary, records }: { summary: SinCityPerformanceSummaryFile; records: SinCityPickRecord[] }) {
  const fiveOfFiveRecords = useMemo(() => records.filter((r) => r.qualificationLevel === "5/5"), [records]);
  const fourOfFiveRecords = useMemo(() => records.filter((r) => r.qualificationLevel === "4/5"), [records]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-900">Sin City Performance</h2>
        <p className="mt-1 text-xs text-slate-500 max-w-2xl">
          Forward tracking only, started {summary.trackingStartDate}. Historical Sin City qualification could not be safely reconstructed
          before this date because the "Wind Out" factor was never persisted (see report) -- no fabricated history is shown here.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {summary.totalTrackedDates} tracked date{summary.totalTrackedDates === 1 ? "" : "s"}
          {summary.mostRecentGradedDate ? ` • most recent graded date ${summary.mostRecentGradedDate}` : " • no graded results yet"}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LevelSummary title="5/5 Picks" summary={summary.fiveOfFive} />
        <LevelSummary title="4/5 Picks" summary={summary.fourOfFive} />
      </div>

      <div className="space-y-3">
        <ExpandableGroup title="Sin City 5/5 Results" summary={`${summary.fiveOfFive.qualifiedPlays} graded • ${summary.fiveOfFive.hrHits} HR hits • ${pctOrDash(summary.fiveOfFive.hrHitRate)} HR rate`} defaultOpen>
          <SinCityPerformanceTable records={fiveOfFiveRecords} />
        </ExpandableGroup>
        <ExpandableGroup title="Sin City 4/5 Results" summary={`${summary.fourOfFive.qualifiedPlays} graded • ${summary.fourOfFive.hrHits} HR hits • ${pctOrDash(summary.fourOfFive.hrHitRate)} HR rate`} defaultOpen>
          <SinCityPerformanceTable records={fourOfFiveRecords} />
        </ExpandableGroup>
      </div>
    </section>
  );
}
