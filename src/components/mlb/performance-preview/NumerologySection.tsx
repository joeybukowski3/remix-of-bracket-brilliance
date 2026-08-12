import { useMemo } from "react";
import type { NumerologyPerformanceRecord, NumerologyPerformanceSummary } from "@/types/mlbNumerologyPerformance";
import ExpandableGroup from "./ExpandableGroup";
import NumerologyPerformanceTable from "./NumerologyPerformanceTable";
import StatTile from "./StatTile";
import { numOrDash, pctOrDash } from "./format";

function isFinalized(record: NumerologyPerformanceRecord): boolean {
  return record.resultStatus === "final";
}

export default function NumerologySection({ summary, records }: { summary: NumerologyPerformanceSummary; records: NumerologyPerformanceRecord[] }) {
  const finalizedRecords = useMemo(() => records.filter(isFinalized), [records]);
  // Grouped by selectionType (mutually exclusive) to match the "topPlay"/"over50"
  // windows in performance-summary.json exactly -- the isTopPlay/qualifiesOver50
  // booleans on a record can both be true and would double-count here.
  const topPlayRecords = useMemo(() => finalizedRecords.filter((r) => r.selectionType === "top-play"), [finalizedRecords]);
  const over50Records = useMemo(() => finalizedRecords.filter((r) => r.selectionType === "over-50"), [finalizedRecords]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-900">Numerology Performance</h2>
        <p className="mt-1 text-xs text-slate-500 max-w-2xl">Model version {summary.modelVersion} • as of {summary.asOfDate}.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <StatTile label="Total Finalized" value={String(summary.allTime.finalized)} />
        <StatTile label="HR Hits" value={String(summary.allTime.hrHits)} tone="positive" />
        <StatTile label="HR Hit Rate" value={pctOrDash(summary.allTime.hrHitRate)} />
        <StatTile label="Avg Hits" value={numOrDash(summary.allTime.averageHits, 2)} />
        <StatTile label="Avg Total Bases" value={numOrDash(summary.allTime.averageTotalBases, 2)} />
      </div>

      <div className="space-y-3">
        <ExpandableGroup title="Top Plays" summary={`${topPlayRecords.length} graded • ${summary.topPlay.hrHits} HR hits • ${pctOrDash(summary.topPlay.hrHitRate)} HR rate`}>
          <NumerologyPerformanceTable records={topPlayRecords} />
        </ExpandableGroup>
        <ExpandableGroup title="Score 50+" summary={`${over50Records.length} graded • ${summary.over50.hrHits} HR hits • ${pctOrDash(summary.over50.hrHitRate)} HR rate`}>
          <NumerologyPerformanceTable records={over50Records} />
        </ExpandableGroup>
        <ExpandableGroup title="Recent Graded Plays" summary={`${finalizedRecords.length} graded plays`} defaultOpen>
          <NumerologyPerformanceTable records={finalizedRecords} />
        </ExpandableGroup>
      </div>
    </section>
  );
}
