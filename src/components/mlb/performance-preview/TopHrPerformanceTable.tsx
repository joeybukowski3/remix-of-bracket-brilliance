import { useMemo, useState } from "react";
import type { TopHrPickRecord } from "@/types/mlbTopHrPerformance";
import MobileAccordionRows from "./MobileAccordionRows";
import type { PerformanceRow } from "./PerformanceRow";
import PlayerCell from "./PlayerCell";
import ResultBadge, { classifyResultStatus } from "./ResultBadge";
import ResultFilter, { type ResultFilterValue } from "./ResultFilter";
import ShowMoreFooter from "./ShowMoreFooter";
import { numOrDash, textOrDash } from "./format";
import { usePaginatedRows } from "./usePaginatedRows";

function average(hits: number | null, atBats: number | null): string {
  if (!atBats || atBats <= 0 || hits === null) return "—";
  return (hits / atBats).toFixed(3).replace(/^0/, "");
}

function matchesFilter(record: TopHrPickRecord, filter: ResultFilterValue): boolean {
  if (filter === "all") return true;
  const kind = classifyResultStatus(record.resultStatus);
  if (filter === "hit") return kind === "HIT";
  if (filter === "miss") return kind === "MISS";
  return true;
}

function toPerformanceRow(record: TopHrPickRecord): PerformanceRow {
  const line = record.battingLine;
  return {
    key: `${record.date}-${record.playerId}-${record.gameId}`,
    date: record.date,
    player: record.playerName,
    team: record.team,
    resultKind: classifyResultStatus(record.resultStatus),
    compactLabel: "HR Score",
    compactValue: numOrDash(record.hrQualityScore, 1),
    details: [
      { label: "Opponent", value: textOrDash(record.opponent) },
      { label: "Rank", value: numOrDash(record.rank) },
      { label: "Odds", value: textOrDash(record.odds) },
      { label: "AB", value: numOrDash(line?.atBats ?? null) },
      { label: "H", value: numOrDash(line?.hits ?? null) },
      { label: "AVG", value: average(line?.hits ?? null, line?.atBats ?? null) },
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

export default function TopHrPerformanceTable({ records }: { records: TopHrPickRecord[] }) {
  const [filter, setFilter] = useState<ResultFilterValue>("all");

  const sortedFiltered = useMemo(() => {
    return records
      .filter((r) => matchesFilter(r, filter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || a.slot - b.slot);
  }, [records, filter]);

  const { visibleRows, visibleCount, totalCount, hasMore, canShowAll, showMore, showAll } = usePaginatedRows(sortedFiltered);
  const mobileRows = useMemo(() => visibleRows.map(toPerformanceRow), [visibleRows]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ResultFilter value={filter} onChange={setFilter} />
      </div>

      <div className="sm:hidden">
        <MobileAccordionRows rows={mobileRows} />
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2 text-right">Rank</th>
              <th className="px-3 py-2 text-right">HR Score</th>
              <th className="px-3 py-2">Odds</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2 text-right">AB</th>
              <th className="px-3 py-2 text-right">H</th>
              <th className="px-3 py-2 text-right">AVG</th>
              <th className="px-3 py-2 text-right">2B</th>
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
              const line = record.battingLine;
              return (
                <tr key={`${record.date}-${record.playerId}-${record.gameId}`} className="hover:bg-sky-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{record.date}</td>
                  <td className="px-3 py-2"><PlayerCell name={record.playerName} team={record.team} /></td>
                  <td className="px-3 py-2 text-slate-600">{record.opponent}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{numOrDash(record.rank)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">{numOrDash(record.hrQualityScore, 1)}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-500">{textOrDash(record.odds)}</td>
                  <td className="px-3 py-2"><ResultBadge kind={classifyResultStatus(record.resultStatus)} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.atBats ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.hits ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{average(line?.hits ?? null, line?.atBats ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.doubles ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{numOrDash(line?.homeRuns ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.totalBases ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.rbi ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.runs ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.baseOnBalls ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.strikeOuts ?? null)}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={17} className="px-3 py-6 text-center text-slate-400">No graded picks match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
