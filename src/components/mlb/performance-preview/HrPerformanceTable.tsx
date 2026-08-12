import { useMemo, useState } from "react";
import type { HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import MobileAccordionRows from "./MobileAccordionRows";
import type { PerformanceRow } from "./PerformanceRow";
import PlayerCell from "./PlayerCell";
import ResultBadge, { classifyResultStatus } from "./ResultBadge";
import ResultFilter, { type ResultFilterValue } from "./ResultFilter";
import ShowMoreFooter from "./ShowMoreFooter";
import { numOrDash, textOrDash } from "./format";
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

export default function HrPerformanceTable({ records }: { records: HrPredictionRecord[] }) {
  const [filter, setFilter] = useState<ResultFilterValue>("all");

  const sortedFiltered = useMemo(() => {
    return records
      .filter((r) => matchesFilter(r, filter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.gameId - a.gameId);
  }, [records, filter]);

  const { visibleRows, visibleCount, totalCount, hasMore, canShowAll, showMore, showAll } = usePaginatedRows(sortedFiltered);
  const mobileRows = useMemo(() => visibleRows.map(toPerformanceRow), [visibleRows]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ResultFilter value={filter} onChange={setFilter} />
      </div>

      {/* Mobile: compact accordion rows, no horizontal scroll. */}
      <div className="sm:hidden">
        <MobileAccordionRows rows={mobileRows} />
      </div>

      {/* Desktop: table. */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2 text-right">HR Score</th>
              <th className="px-3 py-2 text-right">Rank</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Lineup</th>
              <th className="px-3 py-2">Odds</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2 text-right">AB</th>
              <th className="px-3 py-2 text-right">H</th>
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
              const line = record.result.battingLine;
              return (
                <tr key={`${record.date}-${record.playerId}-${record.gameId}`} className="hover:bg-sky-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{record.date}</td>
                  <td className="px-3 py-2"><PlayerCell name={record.playerName} team={record.team} /></td>
                  <td className="px-3 py-2 text-slate-600">{record.opponent}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">{numOrDash(record.hrQualityScore, 1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{numOrDash(record.hrRank)}</td>
                  <td className="px-3 py-2 capitalize text-slate-500">{textOrDash(record.confidenceLevel)}</td>
                  <td className="px-3 py-2 capitalize text-slate-500">{textOrDash(record.lineupStatus)}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-500">{textOrDash(record.hrOddsYes)}</td>
                  <td className="px-3 py-2"><ResultBadge kind={classifyResultStatus(record.result.status)} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.atBats)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.hits)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.doubles)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{numOrDash(record.result.hrCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.totalBases)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.rbi)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.runs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.baseOnBalls)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numOrDash(line?.strikeOuts)}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={18} className="px-3 py-6 text-center text-slate-400">No graded plays match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMoreFooter visibleCount={visibleCount} totalCount={totalCount} hasMore={hasMore} canShowAll={canShowAll} onShowMore={showMore} onShowAll={showAll} />
    </div>
  );
}
