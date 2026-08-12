import { useMemo, useState } from "react";
import type { NumerologyPerformanceRecord, NumerologyPerformanceSummary } from "@/types/mlbNumerologyPerformance";
import { getEtDateString, isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { aggregateBoxScore } from "./aggregateBoxScore";
import BoxScoreStrip from "./BoxScoreStrip";
import ExpandableGroup from "./ExpandableGroup";
import MatchFilterChips from "./MatchFilterChips";
import NumerologyPerformanceTable from "./NumerologyPerformanceTable";
import StatTile from "./StatTile";
import TimeWindowToggle from "./TimeWindowToggle";
import { collectMatchFieldOptions, recordMatchesSelectedFields } from "./numerologyMatchFilters";
import { numOrDash, pctOrDash } from "./format";

function isFinalized(record: NumerologyPerformanceRecord): boolean {
  return record.resultStatus === "final";
}

export default function NumerologySection({ summary, records, referenceDate = getEtDateString() }: { summary: NumerologyPerformanceSummary; records: NumerologyPerformanceRecord[]; referenceDate?: string }) {
  const [window, setWindow] = useState<TimeWindowId>("last30");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  const finalizedRecords = useMemo(() => records.filter(isFinalized), [records]);
  const matchFieldOptions = useMemo(() => collectMatchFieldOptions(finalizedRecords), [finalizedRecords]);

  const matchFiltered = useMemo(
    () => finalizedRecords.filter((r) => recordMatchesSelectedFields(r, selectedFields)),
    [finalizedRecords, selectedFields],
  );

  const windowedRecords = useMemo(() => matchFiltered.filter((r) => isDateInWindow(r.date, window, referenceDate)), [matchFiltered, window, referenceDate]);
  const windowBoxScore = useMemo(() => aggregateBoxScore(windowedRecords.map((r) => r.stats)), [windowedRecords]);

  const topPlayRecords = useMemo(() => matchFiltered.filter((r) => r.selectionType === "top-play"), [matchFiltered]);
  const over50Records = useMemo(() => matchFiltered.filter((r) => r.selectionType === "over-50"), [matchFiltered]);

  function toggleField(field: string) {
    setSelectedFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-fuchsia-100 bg-gradient-to-b from-fuchsia-50/40 to-transparent p-4 sm:p-5">
      <div className="border-l-4 border-l-fuchsia-500 pl-3">
        <h2 className="text-lg font-black text-slate-900">Numerology Performance</h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">Model version {summary.modelVersion} • as of {summary.asOfDate}.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <StatTile label="Total Finalized" value={String(summary.allTime.finalized)} surfaceClassName="border-fuchsia-100 bg-white" />
        <StatTile label="HR Hits" value={String(summary.allTime.hrHits)} tone="positive" surfaceClassName="border-fuchsia-100 bg-white" />
        <StatTile label="HR Hit Rate" value={pctOrDash(summary.allTime.hrHitRate)} surfaceClassName="border-fuchsia-100 bg-white" />
        <StatTile label="Avg Hits" value={numOrDash(summary.allTime.averageHits, 2)} surfaceClassName="border-fuchsia-100 bg-white" />
        <StatTile label="Avg Total Bases" value={numOrDash(summary.allTime.averageTotalBases, 2)} surfaceClassName="border-fuchsia-100 bg-white" />
      </div>

      <MatchFilterChips options={matchFieldOptions} selected={selectedFields} onToggle={toggleField} onClear={() => setSelectedFields([])} matchingCount={matchFiltered.length} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Box Score</div>
          <TimeWindowToggle value={window} onChange={setWindow} accentClassName="bg-fuchsia-600" />
        </div>
        <BoxScoreStrip aggregate={windowBoxScore} accentClassName="border-fuchsia-100" />
      </div>

      <div className="space-y-3">
        <ExpandableGroup
          title="Top Plays"
          summary={`${topPlayRecords.length} graded • ${summary.topPlay.hrHits} HR hits • ${pctOrDash(summary.topPlay.hrHitRate)} HR rate`}
          accentClassName="border-l-fuchsia-400 bg-fuchsia-50/50"
        >
          <NumerologyPerformanceTable records={topPlayRecords} />
        </ExpandableGroup>
        <ExpandableGroup
          title="Score 50+"
          summary={`${over50Records.length} graded • ${summary.over50.hrHits} HR hits • ${pctOrDash(summary.over50.hrHitRate)} HR rate`}
          accentClassName="border-l-violet-400 bg-violet-50/50"
        >
          <NumerologyPerformanceTable records={over50Records} />
        </ExpandableGroup>
        <ExpandableGroup title="Recent Graded Plays" summary={`${windowedRecords.length} graded plays in this window`} defaultOpen accentClassName="border-l-fuchsia-400 bg-fuchsia-50/40">
          <NumerologyPerformanceTable records={windowedRecords} />
        </ExpandableGroup>
      </div>
    </section>
  );
}
