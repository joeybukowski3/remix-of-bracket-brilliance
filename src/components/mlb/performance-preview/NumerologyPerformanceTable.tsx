import { useMemo, useState } from "react";
import type { NumerologyPerformanceRecord } from "@/types/mlbNumerologyPerformance";
import PlayerCell from "./PlayerCell";
import ResultBadge, { classifyResultStatus } from "./ResultBadge";
import ResultFilter, { type ResultFilterValue } from "./ResultFilter";
import ShowMoreFooter from "./ShowMoreFooter";
import { numOrDash } from "./format";
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

export default function NumerologyPerformanceTable({ records }: { records: NumerologyPerformanceRecord[] }) {
  const [filter, setFilter] = useState<ResultFilterValue>("all");

  const sortedFiltered = useMemo(() => {
    return records
      .filter((r) => matchesFilter(r, filter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, filter]);

  const { visibleRows, visibleCount, totalCount, hasMore, canShowAll, showMore, showAll } = usePaginatedRows(sortedFiltered);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ResultFilter value={filter} onChange={setFilter} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[880px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2 text-right">AB</th>
              <th className="px-3 py-2 text-right">H</th>
              <th className="px-3 py-2 text-right">AVG</th>
              <th className="px-3 py-2 text-right">HR</th>
              <th className="px-3 py-2 text-right">TB</th>
              <th className="px-3 py-2 text-right">RBI</th>
              <th className="px-3 py-2 text-right">R</th>
              <th className="px-3 py-2 text-right">BB</th>
              <th className="px-3 py-2 text-right">K</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((record) => {
              const s = record.stats;
              return (
                <tr key={record.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{record.date}</td>
                  <td className="px-3 py-2"><PlayerCell name={record.player} team={record.team} /></td>
                  <td className="px-3 py-2 text-slate-600">{record.opponent}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">{numOrDash(record.numerologyScore, 1)}</td>
                  <td className="px-3 py-2 text-slate-500">{categoryLabel(record)}</td>
                  <td className="px-3 py-2"><ResultBadge kind={classifyResultStatus(record.resultStatus, record.hitHomeRun)} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(s?.atBats ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(s?.hits ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{average(s?.hits ?? null, s?.atBats ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{numOrDash(s?.homeRuns ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(s?.totalBases ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(s?.rbi ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(s?.runs ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(s?.baseOnBalls ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(s?.strikeOuts ?? null)}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={15} className="px-3 py-6 text-center text-slate-400">No graded plays match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
