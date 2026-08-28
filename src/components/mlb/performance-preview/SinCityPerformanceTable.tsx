import { useMemo, useState } from "react";
import type { SinCityPickRecord } from "@/types/mlbSinCity";
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

function factorsSummary(record: SinCityPickRecord): string {
  return record.factors.map((f) => `${f.pass ? "✓" : "✗"} ${f.name}`).join("  ");
}

function matchesFilter(record: SinCityPickRecord, filter: ResultFilterValue): boolean {
  if (filter === "all") return true;
  const kind = classifyResultStatus(record.resultStatus);
  if (filter === "hit") return kind === "HIT";
  if (filter === "miss") return kind === "MISS";
  return true;
}

function toPerformanceRow(record: SinCityPickRecord): PerformanceRow {
  const line = record.battingLine;
  return {
    key: `${record.date}-${record.playerId}-${record.gameId}`,
    date: record.date,
    player: record.playerName,
    team: record.team,
    resultKind: classifyResultStatus(record.resultStatus),
    compactLabel: "Qual.",
    compactValue: record.qualificationLevel,
    details: [
      { label: "Opponent", value: textOrDash(record.opponent) },
      { label: "Factors", value: factorsSummary(record) },
      { label: "Odds", value: textOrDash(record.hrOddsYes) },
      { label: "AB", value: numOrDash(line?.atBats ?? null) },
      { label: "H", value: numOrDash(line?.hits ?? null) },
      { label: "2B", value: numOrDash(line?.doubles ?? null) },
      { label: "HR", value: numOrDash(line?.homeRuns ?? null) },
      { label: "TB", value: numOrDash(line?.totalBases ?? null) },
      { label: "RBI", value: numOrDash(line?.rbi ?? null) },
      { label: "R", value: numOrDash(line?.runs ?? null) },
      { label: "BB", value: numOrDash(line?.baseOnBalls ?? null) },
      { label: "K", value: numOrDash(line?.strikeOuts ?? null) },
    ],
  };
}

const COLUMNS: PerformanceTableColumn<SinCityPickRecord>[] = [
  { key: "date", header: "Date", cellClassName: "whitespace-nowrap px-3 py-2 text-slate-500", render: (r) => r.date },
  {
    key: "player",
    header: "Player",
    headerClassName: STICKY_PLAYER_TH_CLASS,
    cellClassName: `px-3 py-2 ${stickyPlayerTdClass("group-hover:bg-rose-50")}`,
    render: (r) => <PlayerCell name={r.playerName} team={r.team} />,
  },
  { key: "opponent", header: "Opponent", cellClassName: "px-3 py-2 text-slate-600", render: (r) => r.opponent },
  { key: "qual", header: "Qual.", cellClassName: "px-3 py-2 font-bold text-slate-900", render: (r) => r.qualificationLevel },
  {
    key: "factors",
    header: "Factors",
    cellClassName: "px-3 py-2 whitespace-nowrap font-mono text-[10px] text-slate-500",
    render: (r) => factorsSummary(r),
  },
  { key: "odds", header: "Odds", cellClassName: "px-3 py-2 tabular-nums text-slate-500", render: (r) => textOrDash(r.hrOddsYes) },
  { key: "result", header: "Result", cellClassName: "px-3 py-2", render: (r) => <ResultBadge kind={classifyResultStatus(r.resultStatus)} /> },
  { key: "ab", header: "AB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.atBats ?? null) },
  { key: "h", header: "H", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.hits ?? null) },
  { key: "doubles", header: "2B", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.doubles ?? null) },
  { key: "hr", header: "HR", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums font-bold", render: (r) => numOrDash(r.battingLine?.homeRuns ?? null) },
  { key: "tb", header: "TB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.totalBases ?? null) },
  { key: "rbi", header: "RBI", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.rbi ?? null) },
  { key: "r", header: "R", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.runs ?? null) },
  { key: "bb", header: "BB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.baseOnBalls ?? null) },
  { key: "k", header: "K", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.battingLine?.strikeOuts ?? null) },
];

// Player frozen first; Qual. (this table's headline value), Odds, and Result surface before the box-score columns.
const COMPACT_COLUMN_ORDER = [
  "player", "qual", "odds", "result",
  "date", "opponent", "factors",
  "ab", "h", "doubles", "hr", "tb", "rbi", "r", "bb", "k",
];

export default function SinCityPerformanceTable({ records }: { records: SinCityPickRecord[] }) {
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

      <div className="sm:hidden">
        <MobileAccordionRows rows={mobileRows} />
      </div>

      <div className="hidden overflow-x-auto rounded-lg border-2 border-slate-300 sm:block">
        <table className="w-full min-w-[940px] text-left text-xs">
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
              <tr key={`${record.date}-${record.playerId}-${record.gameId}`} className="group hover:bg-rose-50/60">
                {columns.map((column) => (
                  <td key={column.key} className={column.cellClassName}>
                    {column.render(record)}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">No qualified plays match this filter yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
