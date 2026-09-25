import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import { useNflYardageHistory } from "@/hooks/useNflYardageHistory";
import { findPropBoxScore } from "@/lib/nfl/performance/propBoxScore";
import { PROPS_MARKET_LABEL } from "@/lib/nfl/performance/propsFilters";
import { NflResultBadge } from "./NflPerformanceBadges";
import { DirectionBadge } from "./NflPerformanceDirection";
import { directionTone } from "./directionTone";
import { TeamIdentity } from "./NflPerformanceIdentity";
import NflPerformancePropsDetail from "./NflPerformancePropsDetail";
import type { PropsSortKey, PropsSortState } from "@/lib/nfl/performance/propsFilters";
import type { PropsPerformanceRow, SidesPerformanceRow } from "@/types/nfl/performance";

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: PropsSortKey;
  sort: PropsSortState;
  onSort: (key: PropsSortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th scope="col" className="border-r border-slate-200/70 px-2 py-2 text-center align-bottom last:border-r-0">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "mx-auto flex items-center gap-1 rounded px-1 -mx-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
          active ? "text-sky-800" : "text-slate-600 hover:text-slate-900",
        )}
      >
        {label}
        {active && <span aria-hidden="true">{sort!.direction === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

/** Desktop table + mobile card list for starter-prop rows, sharing one expand/collapse state. */
export default function NflPerformancePropsTable({
  rows,
  games,
  sort,
  onSort,
}: {
  rows: readonly PropsPerformanceRow[];
  games?: readonly SidesPerformanceRow[];
  sort: PropsSortState;
  onSort: (key: PropsSortKey) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const gamesById = new Map(games?.map((game) => [game.game_id, game]) ?? []);
  const boxScoreHistory = useNflYardageHistory(rows[0]?.season ?? 2026, expandedId != null);

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-300 shadow-sm md:block">
        <NflTableScroller label="Starter props performance table">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className={cn(NFL_TABLE_HEAD_ROW, "[&>th:not(:last-child)]:border-r [&>th]:border-slate-200/70")}>
                <th scope="col" className="w-6 px-1 py-2" aria-hidden="true" />
                <SortHeader label="Week" sortKey="week" sort={sort} onSort={onSort} />
                <th scope="col" className="border-r border-slate-200/70 px-2 py-2 text-left align-bottom">Player</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">Pos</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">Market</th>
                <SortHeader label="Line" sortKey="line" sort={sort} onSort={onSort} />
                <SortHeader label="JKB" sortKey="jkb_projection" sort={sort} onSort={onSort} />
                <SortHeader label="Diff" sortKey="abs_difference" sort={sort} onSort={onSort} />
                <SortHeader label="Actual" sortKey="actual" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-center align-bottom">Direction</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">Result</th>
                <SortHeader label="Abs Error" sortKey="absolute_error" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedId === row.evaluation_row_id;
                const toggle = () => setExpandedId(expanded ? null : row.evaluation_row_id);
                return (
                  <Fragment key={row.evaluation_row_id}>
                    <tr
                      className={cn(NFL_TABLE_ROW, "cursor-pointer", directionTone[row.direction].row, "[&>td]:border-r [&>td]:border-slate-200/60 [&>td:last-child]:border-r-0")}
                      data-direction={row.direction.toLowerCase()}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expanded}
                      aria-label={expanded ? `Collapse details for ${row.player ?? row.player_id}` : `Expand details for ${row.player ?? row.player_id}`}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        toggle();
                      }}
                    >
                      <td className="px-1 py-1.5 text-center text-slate-400" aria-hidden="true">{expanded ? "▾" : "▸"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{row.week}</td>
                      <td className="px-2 py-1.5 text-left font-medium text-slate-800"><span className="flex items-center gap-2"><TeamIdentity abbr={row.team} compact /><span className="min-w-0">{row.player ?? row.player_id}</span></span></td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{row.position}</td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{PROPS_MARKET_LABEL[row.market]}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatMetric(row.line)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums font-semibold">{formatMetric(row.jkb_projection)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatSigned(row.difference)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatMetric(row.actual)}</td>
                      <td className="px-2 py-1.5 text-center"><DirectionBadge direction={row.direction} /></td>
                      <td className="px-2 py-1.5 text-center"><NflResultBadge result={row.result} /></td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatMetric(row.absolute_error)}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={12} className="p-0">
                          <NflPerformancePropsDetail row={row} game={gamesById.get(row.game_id)} boxScore={findPropBoxScore(row, boxScoreHistory.data)} boxScoreLoading={boxScoreHistory.loading} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </NflTableScroller>
      </div>

      {/* Mobile */}
      <div className="space-y-2 md:hidden" data-testid="nfl-props-mobile-list">
        {rows.map((row) => {
          const expanded = expandedId === row.evaluation_row_id;
          const toggle = () => setExpandedId(expanded ? null : row.evaluation_row_id);
          return (
            <div key={row.evaluation_row_id} data-direction={row.direction.toLowerCase()} className={cn("overflow-hidden rounded-lg border border-slate-200 bg-white", directionTone[row.direction].row)}>
              <button type="button" onClick={toggle} aria-expanded={expanded} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Week {row.week} · {PROPS_MARKET_LABEL[row.market]}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900"><TeamIdentity abbr={row.team} compact /><span className="truncate">{row.player ?? row.player_id}</span></span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Line {formatMetric(row.line)} · JKB {formatMetric(row.jkb_projection)} · Diff {formatSigned(row.difference)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1"><DirectionBadge direction={row.direction} /><NflResultBadge result={row.result} /></span>
              </button>
              {expanded && <NflPerformancePropsDetail row={row} game={gamesById.get(row.game_id)} boxScore={findPropBoxScore(row, boxScoreHistory.data)} boxScoreLoading={boxScoreHistory.loading} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
