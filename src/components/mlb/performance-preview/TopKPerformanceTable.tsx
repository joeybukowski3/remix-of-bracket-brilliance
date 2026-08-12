import { useMemo, useState } from "react";
import type { TopKPickRecord } from "@/types/mlbTopKPerformance";
import MobileAccordionRows from "./MobileAccordionRows";
import type { PerformanceRow } from "./PerformanceRow";
import PlayerCell from "./PlayerCell";
import ResultBadge, { classifyKPropResult } from "./ResultBadge";
import ResultFilter, { type ResultFilterValue } from "./ResultFilter";
import ShowMoreFooter from "./ShowMoreFooter";
import { numOrDash, textOrDash } from "./format";
import { usePaginatedRows } from "./usePaginatedRows";

function matchesFilter(record: TopKPickRecord, filter: ResultFilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "hit") return record.result === "WIN";
  if (filter === "miss") return record.result === "LOSS";
  return true;
}

function sideLabel(record: TopKPickRecord): string {
  return `${record.side === "over" ? "Over" : "Under"} ${record.line}`;
}

function toPerformanceRow(record: TopKPickRecord): PerformanceRow {
  return {
    key: `${record.date}-${record.pitcherId}-${record.gameId}-${record.side}`,
    date: record.date,
    player: record.pitcherName,
    team: record.team,
    resultKind: classifyKPropResult(record.resultStatus, record.result),
    compactLabel: "Side",
    compactValue: sideLabel(record),
    details: [
      { label: "Opponent", value: textOrDash(record.opponent) },
      { label: "Proj K", value: numOrDash(record.projectedKs, 1) },
      { label: "Edge", value: numOrDash(record.projectionEdge, 1) },
      { label: "K Score", value: numOrDash(record.kScore, 1) },
      { label: "Odds", value: textOrDash(record.odds) },
      { label: "Actual K", value: numOrDash(record.actualStrikeOuts) },
      { label: "IP", value: textOrDash(record.actualInningsPitched) },
    ],
  };
}

export default function TopKPerformanceTable({ records }: { records: TopKPickRecord[] }) {
  const [filter, setFilter] = useState<ResultFilterValue>("all");

  const sortedFiltered = useMemo(() => {
    return records
      .filter((r) => matchesFilter(r, filter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || a.side.localeCompare(b.side) || a.slot - b.slot);
  }, [records, filter]);

  const { visibleRows, visibleCount, totalCount, hasMore, canShowAll, showMore, showAll } = usePaginatedRows(sortedFiltered);
  const mobileRows = useMemo(() => visibleRows.map(toPerformanceRow), [visibleRows]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ResultFilter value={filter} onChange={setFilter} labels={{ hit: "Win", miss: "Loss" }} />
      </div>

      <div className="sm:hidden">
        <MobileAccordionRows rows={mobileRows} />
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Pitcher</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2 text-right">Line</th>
              <th className="px-3 py-2 text-right">Proj K</th>
              <th className="px-3 py-2 text-right">Edge</th>
              <th className="px-3 py-2 text-right">K Score</th>
              <th className="px-3 py-2 text-right">Actual K</th>
              <th className="px-3 py-2 text-right">IP</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((record) => (
              <tr key={`${record.date}-${record.pitcherId}-${record.gameId}-${record.side}`} className="hover:bg-emerald-50/60">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{record.date}</td>
                <td className="px-3 py-2"><PlayerCell name={record.pitcherName} team={record.team} /></td>
                <td className="px-3 py-2 text-slate-600">{record.opponent}</td>
                <td className="px-3 py-2 font-bold capitalize text-slate-900">{record.side}</td>
                <td className="px-3 py-2 text-right tabular-nums">{numOrDash(record.line, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{numOrDash(record.projectedKs, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{numOrDash(record.projectionEdge, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{numOrDash(record.kScore, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{numOrDash(record.actualStrikeOuts)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{textOrDash(record.actualInningsPitched)}</td>
                <td className="px-3 py-2"><ResultBadge kind={classifyKPropResult(record.resultStatus, record.result)} /></td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-400">No graded picks match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
