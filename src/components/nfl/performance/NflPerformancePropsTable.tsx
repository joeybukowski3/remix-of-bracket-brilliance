import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import { PROPS_MARKET_LABEL } from "@/lib/nfl/performance/propsFilters";
import { NflResultBadge } from "./NflPerformanceBadges";
import NflPerformancePropsDetail from "./NflPerformancePropsDetail";
import type { PropsSortKey, PropsSortState } from "@/lib/nfl/performance/propsFilters";
import type { PropsPerformanceRow } from "@/types/nfl/performance";

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
    <th scope="col" className="px-2 py-2 text-center align-bottom">
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
  sort,
  onSort,
}: {
  rows: readonly PropsPerformanceRow[];
  sort: PropsSortState;
  onSort: (key: PropsSortKey) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-300 shadow-sm md:block">
        <NflTableScroller label="Starter props performance table">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className={NFL_TABLE_HEAD_ROW}>
                <th scope="col" className="w-6 px-1 py-2" aria-hidden="true" />
                <SortHeader label="Week" sortKey="week" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-left align-bottom">Player</th>
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
                      className={cn(NFL_TABLE_ROW, "cursor-pointer")}
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
                      <td className="px-2 py-1.5 text-left font-medium text-slate-800">{row.player ?? row.player_id}</td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{row.position}</td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{PROPS_MARKET_LABEL[row.market]}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatMetric(row.line)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums font-semibold">{formatMetric(row.jkb_projection)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatSigned(row.difference)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatMetric(row.actual)}</td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{row.direction}</td>
                      <td className="px-2 py-1.5 text-center"><NflResultBadge result={row.result} /></td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatMetric(row.absolute_error)}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={11} className="p-0">
                          <NflPerformancePropsDetail row={row} />
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
            <div key={row.evaluation_row_id} className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
              <button type="button" onClick={toggle} aria-expanded={expanded} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Week {row.week} · {PROPS_MARKET_LABEL[row.market]}
                  </span>
                  <span className="block truncate text-sm font-semibold text-slate-900">{row.player ?? row.player_id}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Line {formatMetric(row.line)} · JKB {formatMetric(row.jkb_projection)} · Diff {formatSigned(row.difference)}
                  </span>
                </span>
                <NflResultBadge result={row.result} />
              </button>
              {expanded && <NflPerformancePropsDetail row={row} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
