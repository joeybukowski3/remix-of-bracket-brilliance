import { useMemo, useState } from "react";
import type { TopKPickRecord } from "@/types/mlbTopKPerformance";
import { DenseTableScroller } from "@/components/ui/dense-table";
import MobileAccordionRows from "./MobileAccordionRows";
import type { PerformanceRow } from "./PerformanceRow";
import PlayerCell from "./PlayerCell";
import ResultBadge, { classifyKPropResult } from "./ResultBadge";
import ResultFilter, { type ResultFilterValue } from "./ResultFilter";
import ShowMoreFooter from "./ShowMoreFooter";
import { type PerformanceTableColumn, reorderColumns, STICKY_PLAYER_TH_CLASS, stickyPlayerTdClass } from "./tableColumns";
import { numOrDash, textOrDash } from "./format";
import { useIsCompactTable } from "./useIsCompactTable";
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

const COLUMNS: PerformanceTableColumn<TopKPickRecord>[] = [
  { key: "date", header: "Date", cellClassName: "whitespace-nowrap px-3 py-2 text-slate-500", render: (r) => r.date },
  {
    key: "player",
    header: "Pitcher",
    headerClassName: STICKY_PLAYER_TH_CLASS,
    cellClassName: `px-3 py-2 ${stickyPlayerTdClass("group-hover:bg-emerald-50")}`,
    render: (r) => <PlayerCell name={r.pitcherName} team={r.team} />,
  },
  { key: "opponent", header: "Opponent", cellClassName: "px-3 py-2 text-slate-600", render: (r) => r.opponent },
  { key: "side", header: "Side", cellClassName: "px-3 py-2 font-bold capitalize text-slate-900", render: (r) => r.side },
  { key: "line", header: "Line", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.line, 1) },
  {
    key: "projK",
    header: "Proj K",
    headerClassName: "text-right",
    cellClassName: "px-3 py-2 text-right tabular-nums",
    render: (r) => numOrDash(r.projectedKs, 1),
  },
  { key: "edge", header: "Edge", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.projectionEdge, 1) },
  {
    key: "kScore",
    header: "K Score",
    headerClassName: "text-right",
    cellClassName: "px-3 py-2 text-right font-bold tabular-nums text-slate-900",
    render: (r) => numOrDash(r.kScore, 1),
  },
  {
    key: "actualK",
    header: "Actual K",
    headerClassName: "text-right",
    cellClassName: "px-3 py-2 text-right tabular-nums font-bold",
    render: (r) => numOrDash(r.actualStrikeOuts),
  },
  { key: "ip", header: "IP", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => textOrDash(r.actualInningsPitched) },
  { key: "result", header: "Result", cellClassName: "px-3 py-2", render: (r) => <ResultBadge kind={classifyKPropResult(r.resultStatus, r.result)} /> },
];

// Player frozen first; K Score (this table's headline value) and Result surface before scrolling to the box-score columns. No Odds column exists on this table.
const COMPACT_COLUMN_ORDER = [
  "player", "kScore", "result",
  "date", "opponent", "side", "line", "projK", "edge", "actualK", "ip",
];

export default function TopKPerformanceTable({ records }: { records: TopKPickRecord[] }) {
  const [filter, setFilter] = useState<ResultFilterValue>("all");
  const isCompact = useIsCompactTable();

  const sortedFiltered = useMemo(() => {
    return records
      .filter((r) => matchesFilter(r, filter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || a.side.localeCompare(b.side) || a.slot - b.slot);
  }, [records, filter]);

  const { visibleRows, visibleCount, totalCount, hasMore, canShowAll, showMore, showAll } = usePaginatedRows(sortedFiltered);
  const mobileRows = useMemo(() => visibleRows.map(toPerformanceRow), [visibleRows]);
  const columns = useMemo(() => (isCompact ? reorderColumns(COLUMNS, COMPACT_COLUMN_ORDER) : COLUMNS), [isCompact]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ResultFilter value={filter} onChange={setFilter} labels={{ hit: "Win", miss: "Loss" }} />
      </div>

      <div className="sm:hidden">
        <MobileAccordionRows rows={mobileRows} />
      </div>

      <DenseTableScroller
        label="Best K prop bets performance history"
        className="hidden rounded-lg border-2 border-slate-300 sm:block"
      >
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="bg-slate-900 text-[10px] uppercase tracking-wide text-slate-300">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.headerClassName ? `px-3 py-2 ${column.headerClassName}` : "px-3 py-2"}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((record) => (
              <tr key={`${record.date}-${record.pitcherId}-${record.gameId}-${record.side}`} className="group hover:bg-emerald-50/60">
                {columns.map((column) => (
                  <td key={column.key} className={column.cellClassName}>
                    {column.render(record)}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">No graded picks match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </DenseTableScroller>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
