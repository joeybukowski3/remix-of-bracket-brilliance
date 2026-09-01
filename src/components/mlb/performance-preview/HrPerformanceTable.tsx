import { useMemo, useState } from "react";
import type { HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import { DenseTableScroller } from "@/components/ui/dense-table";
import MobileAccordionRows from "./MobileAccordionRows";
import type { PerformanceRow } from "./PerformanceRow";
import PlayerCell from "./PlayerCell";
import ResultBadge, { classifyResultStatus } from "./ResultBadge";
import ResultFilter, { type ResultFilterValue } from "./ResultFilter";
import ShowMoreFooter from "./ShowMoreFooter";
import { type PerformanceTableColumn, reorderColumns, STICKY_PLAYER_TH_CLASS, stickyPlayerTdClass } from "./tableColumns";
import { numOrDash, textOrDash } from "./format";
import { useIsCompactTable } from "./useIsCompactTable";
import { usePaginatedRows } from "./usePaginatedRows";

function matchesFilter(record: HrPredictionRecord, filter: ResultFilterValue): boolean {
  if (filter === "all") return true;
  const kind = classifyResultStatus(record.result.status);
  if (filter === "hit") return kind === "HIT";
  if (filter === "miss") return kind === "MISS";
  return true;
}

function toPerformanceRow(record: HrPredictionRecord): PerformanceRow {
  const line = record.result.battingLine;
  return {
    key: `${record.date}-${record.playerId}-${record.gameId}`,
    date: record.date,
    player: record.playerName,
    team: record.team,
    resultKind: classifyResultStatus(record.result.status),
    compactLabel: "HR Score",
    compactValue: numOrDash(record.hrQualityScore, 1),
    details: [
      { label: "Opponent", value: textOrDash(record.opponent) },
      { label: "Rank", value: numOrDash(record.hrRank) },
      { label: "Confidence", value: textOrDash(record.confidenceLevel) },
      { label: "Lineup", value: textOrDash(record.lineupStatus) },
      { label: "Odds", value: textOrDash(record.hrOddsYes) },
      { label: "AB", value: numOrDash(line?.atBats) },
      { label: "H", value: numOrDash(line?.hits) },
      { label: "2B", value: numOrDash(line?.doubles) },
      { label: "HR", value: numOrDash(record.result.hrCount) },
      { label: "TB", value: numOrDash(line?.totalBases) },
      { label: "RBI", value: numOrDash(line?.rbi) },
      { label: "R", value: numOrDash(line?.runs) },
      { label: "BB", value: numOrDash(line?.baseOnBalls) },
      { label: "K", value: numOrDash(line?.strikeOuts) },
    ],
  };
}

const COLUMNS: PerformanceTableColumn<HrPredictionRecord>[] = [
  { key: "date", header: "Date", cellClassName: "whitespace-nowrap px-3 py-2 text-slate-500", render: (r) => r.date },
  {
    key: "player",
    header: "Player",
    headerClassName: STICKY_PLAYER_TH_CLASS,
    cellClassName: `px-3 py-2 ${stickyPlayerTdClass("group-hover:bg-sky-50")}`,
    render: (r) => <PlayerCell name={r.playerName} team={r.team} />,
  },
  { key: "opponent", header: "Opponent", cellClassName: "px-3 py-2 text-slate-600", render: (r) => r.opponent },
  {
    key: "hrScore",
    header: "HR Score",
    headerClassName: "text-right",
    cellClassName: "px-3 py-2 text-right font-bold tabular-nums text-slate-900",
    render: (r) => numOrDash(r.hrQualityScore, 1),
  },
  {
    key: "rank",
    header: "Rank",
    headerClassName: "text-right",
    cellClassName: "px-3 py-2 text-right tabular-nums text-slate-500",
    render: (r) => numOrDash(r.hrRank),
  },
  { key: "confidence", header: "Confidence", cellClassName: "px-3 py-2 capitalize text-slate-500", render: (r) => textOrDash(r.confidenceLevel) },
  { key: "lineup", header: "Lineup", cellClassName: "px-3 py-2 capitalize text-slate-500", render: (r) => textOrDash(r.lineupStatus) },
  { key: "odds", header: "Odds", cellClassName: "px-3 py-2 tabular-nums text-slate-500", render: (r) => textOrDash(r.hrOddsYes) },
  { key: "result", header: "Result", cellClassName: "px-3 py-2", render: (r) => <ResultBadge kind={classifyResultStatus(r.result.status)} /> },
  { key: "ab", header: "AB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.atBats) },
  { key: "h", header: "H", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.hits) },
  { key: "doubles", header: "2B", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.doubles) },
  { key: "hr", header: "HR", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums font-bold", render: (r) => numOrDash(r.result.hrCount) },
  { key: "tb", header: "TB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.totalBases) },
  { key: "rbi", header: "RBI", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.rbi) },
  { key: "r", header: "R", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.runs) },
  { key: "bb", header: "BB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.baseOnBalls) },
  { key: "k", header: "K", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.result.battingLine?.strikeOuts) },
];

// Player frozen first; HR Score, Odds, and Result surface before scrolling to the box-score columns.
const COMPACT_COLUMN_ORDER = [
  "player", "hrScore", "odds", "result",
  "date", "opponent", "rank", "confidence", "lineup",
  "ab", "h", "doubles", "hr", "tb", "rbi", "r", "bb", "k",
];

export default function HrPerformanceTable({ records }: { records: HrPredictionRecord[] }) {
  const [filter, setFilter] = useState<ResultFilterValue>("all");
  const isCompact = useIsCompactTable();

  const sortedFiltered = useMemo(() => {
    return records
      .filter((r) => matchesFilter(r, filter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.gameId - a.gameId);
  }, [records, filter]);

  const { visibleRows, visibleCount, totalCount, hasMore, canShowAll, showMore, showAll } = usePaginatedRows(sortedFiltered);
  const mobileRows = useMemo(() => visibleRows.map(toPerformanceRow), [visibleRows]);
  const columns = useMemo(() => (isCompact ? reorderColumns(COLUMNS, COMPACT_COLUMN_ORDER) : COLUMNS), [isCompact]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ResultFilter value={filter} onChange={setFilter} />
      </div>

      {/* Mobile: compact accordion rows, no horizontal scroll. */}
      <div className="sm:hidden">
        <MobileAccordionRows rows={mobileRows} />
      </div>

      {/* Desktop/tablet: table, column order adapts below the compact-table breakpoint. */}
      <DenseTableScroller
        label="HR model prediction history"
        className="hidden rounded-lg border-2 border-slate-300 sm:block"
      >
        <table className="w-full min-w-[980px] text-left text-xs">
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
              <tr key={`${record.date}-${record.playerId}-${record.gameId}`} className="group hover:bg-sky-50/60">
                {columns.map((column) => (
                  <td key={column.key} className={column.cellClassName}>
                    {column.render(record)}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">No graded plays match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </DenseTableScroller>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
