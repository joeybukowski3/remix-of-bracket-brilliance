import { useMemo, useState } from "react";
import type { NumerologyPerformanceRecord } from "@/types/mlbNumerologyPerformance";
import MobileAccordionRows from "./MobileAccordionRows";
import type { PerformanceRow } from "./PerformanceRow";
import PlayerCell from "./PlayerCell";
import ResultBadge, { classifyResultStatus } from "./ResultBadge";
import ResultFilter, { type ResultFilterValue } from "./ResultFilter";
import ShowMoreFooter from "./ShowMoreFooter";
import { type PerformanceTableColumn, reorderColumns, STICKY_PLAYER_TH_CLASS, stickyPlayerTdClass } from "./tableColumns";
import { numOrDash } from "./format";
import { useIsCompactTable } from "./useIsCompactTable";
import { usePaginatedRows } from "./usePaginatedRows";

// Mirrors the stored selectionType exactly (mutually exclusive) so the label
// always matches which summary window (topPlay vs over50) a row belongs to.
function categoryLabel(record: NumerologyPerformanceRecord): string {
  if (record.selectionType === "top-play") return "Top Play";
  if (record.selectionType === "over-50") return "50+";
  return record.selectionType;
}

function average(hits: number | null, atBats: number | null): string {
  if (!atBats || atBats <= 0 || hits === null) return "—";
  return (hits / atBats).toFixed(3).replace(/^0/, "");
}

function matchesFilter(record: NumerologyPerformanceRecord, filter: ResultFilterValue): boolean {
  if (filter === "all") return true;
  const kind = classifyResultStatus(record.resultStatus, record.hitHomeRun);
  if (filter === "hit") return kind === "HIT";
  if (filter === "miss") return kind === "MISS";
  return true;
}

function toPerformanceRow(record: NumerologyPerformanceRecord): PerformanceRow {
  const s = record.stats;
  return {
    key: record.id,
    date: record.date,
    player: record.player,
    team: record.team,
    resultKind: classifyResultStatus(record.resultStatus, record.hitHomeRun),
    compactLabel: "Score",
    compactValue: numOrDash(record.numerologyScore, 1),
    details: [
      { label: "Opponent", value: record.opponent || "—" },
      { label: "Category", value: categoryLabel(record) },
      { label: "Odds", value: record.hrOddsYes || "—" },
      { label: "AB", value: numOrDash(s?.atBats ?? null) },
      { label: "H", value: numOrDash(s?.hits ?? null) },
      { label: "AVG", value: average(s?.hits ?? null, s?.atBats ?? null) },
      { label: "2B", value: "—" },
      { label: "HR", value: numOrDash(s?.homeRuns ?? null) },
      { label: "TB", value: numOrDash(s?.totalBases ?? null) },
      { label: "RBI", value: numOrDash(s?.rbi ?? null) },
      { label: "R", value: numOrDash(s?.runs ?? null) },
      { label: "BB", value: numOrDash(s?.baseOnBalls ?? null) },
      { label: "K", value: numOrDash(s?.strikeOuts ?? null) },
    ],
  };
}

const COLUMNS: PerformanceTableColumn<NumerologyPerformanceRecord>[] = [
  { key: "date", header: "Date", cellClassName: "whitespace-nowrap px-3 py-2 text-slate-500", render: (r) => r.date },
  {
    key: "player",
    header: "Player",
    headerClassName: STICKY_PLAYER_TH_CLASS,
    cellClassName: `px-3 py-2 ${stickyPlayerTdClass("group-hover:bg-fuchsia-50")}`,
    render: (r) => <PlayerCell name={r.player} team={r.team} />,
  },
  { key: "opponent", header: "Opponent", cellClassName: "px-3 py-2 text-slate-600", render: (r) => r.opponent },
  {
    key: "score",
    header: "Score",
    headerClassName: "text-right",
    cellClassName: "px-3 py-2 text-right font-bold tabular-nums text-slate-900",
    render: (r) => numOrDash(r.numerologyScore, 1),
  },
  { key: "category", header: "Category", cellClassName: "px-3 py-2 text-slate-500", render: (r) => categoryLabel(r) },
  { key: "result", header: "Result", cellClassName: "px-3 py-2", render: (r) => <ResultBadge kind={classifyResultStatus(r.resultStatus, r.hitHomeRun)} /> },
  { key: "ab", header: "AB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.stats?.atBats ?? null) },
  { key: "h", header: "H", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.stats?.hits ?? null) },
  {
    key: "avg",
    header: "AVG",
    headerClassName: "text-right",
    cellClassName: "px-3 py-2 text-right tabular-nums",
    render: (r) => average(r.stats?.hits ?? null, r.stats?.atBats ?? null),
  },
  { key: "hr", header: "HR", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums font-bold", render: (r) => numOrDash(r.stats?.homeRuns ?? null) },
  { key: "tb", header: "TB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.stats?.totalBases ?? null) },
  { key: "rbi", header: "RBI", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.stats?.rbi ?? null) },
  { key: "r", header: "R", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.stats?.runs ?? null) },
  { key: "bb", header: "BB", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.stats?.baseOnBalls ?? null) },
  { key: "k", header: "K", headerClassName: "text-right", cellClassName: "px-3 py-2 text-right tabular-nums", render: (r) => numOrDash(r.stats?.strikeOuts ?? null) },
];

// Player frozen first, then the model's primary Score and the Result; no Odds column exists on this table.
const COMPACT_COLUMN_ORDER = [
  "player", "score", "result",
  "date", "opponent", "category",
  "ab", "h", "avg", "hr", "tb", "rbi", "r", "bb", "k",
];

export default function NumerologyPerformanceTable({ records }: { records: NumerologyPerformanceRecord[] }) {
  const [filter, setFilter] = useState<ResultFilterValue>("all");
  const isCompact = useIsCompactTable();

  const sortedFiltered = useMemo(() => {
    return records
      .filter((r) => matchesFilter(r, filter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
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
        <table className="w-full min-w-[900px] text-left text-xs">
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
              <tr key={record.id} className="group hover:bg-fuchsia-50/60">
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
      </div>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
