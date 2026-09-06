import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import { NflResultBadge } from "./NflPerformanceBadges";
import NflPerformanceSidesDetail from "./NflPerformanceSidesDetail";
import type { SidesSortKey, SidesSortState } from "@/lib/nfl/performance/sidesFilters";
import type { SidesPerformanceRow } from "@/types/nfl/performance";

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SidesSortKey;
  sort: SidesSortState;
  onSort: (key: SidesSortKey) => void;
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

function jkbSideLabel(row: SidesPerformanceRow): string {
  if (row.jkb_ats_side == null) return "—";
  if (row.jkb_ats_side === "pick") return "Pick";
  return (row.jkb_supports_team ?? row.jkb_ats_side).toUpperCase();
}

/**
 * Desktop table (`md:` breakpoint) and mobile card list share one file and
 * one expand/collapse state -- both render NflPerformanceSidesDetail
 * underneath the tapped row.
 */
export default function NflPerformanceSidesTable({
  rows,
  sort,
  onSort,
}: {
  rows: readonly SidesPerformanceRow[];
  sort: SidesSortState;
  onSort: (key: SidesSortKey) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-300 shadow-sm md:block">
        <NflTableScroller label="Sides performance table">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className={NFL_TABLE_HEAD_ROW}>
                <th scope="col" className="w-6 px-1 py-2" aria-hidden="true" />
                <SortHeader label="Week" sortKey="week" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-left align-bottom">Matchup</th>
                <SortHeader label="JKB Margin" sortKey="projected_home_margin" sort={sort} onSort={onSort} />
                <SortHeader label="Market Spread" sortKey="market_spread" sort={sort} onSort={onSort} />
                <SortHeader label="Diff" sortKey="abs_jkb_market_diff" sort={sort} onSort={onSort} />
                <SortHeader label="Actual Margin" sortKey="actual_margin" sort={sort} onSort={onSort} />
                <SortHeader label="Abs Error" sortKey="absolute_margin_error" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-center align-bottom">JKB Side</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedId === row.game_id;
                const toggle = () => setExpandedId(expanded ? null : row.game_id);
                const final = row.game_completion_status === "final";
                return (
                  <Fragment key={row.game_id}>
                    <tr
                      className={cn(NFL_TABLE_ROW, "cursor-pointer")}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expanded}
                      aria-label={expanded ? `Collapse details for ${row.away_team} at ${row.home_team}` : `Expand details for ${row.away_team} at ${row.home_team}`}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        toggle();
                      }}
                    >
                      <td className="px-1 py-1.5 text-center text-slate-400" aria-hidden="true">{expanded ? "▾" : "▸"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{row.week}</td>
                      <td className="px-2 py-1.5 text-left font-medium text-slate-800">
                        {row.away_team.toUpperCase()} @ {row.home_team.toUpperCase()}
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums font-semibold">{formatSigned(row.projected_home_margin)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{row.market_spread != null ? formatMetric(row.market_spread) : "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatSigned(row.jkb_minus_market)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{final ? formatSigned(row.actual_margin, 0) : "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{final ? formatMetric(row.absolute_margin_error) : "—"}</td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{jkbSideLabel(row)}</td>
                      <td className="px-2 py-1.5 text-center"><NflResultBadge result={row.ats_result} /></td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <NflPerformanceSidesDetail row={row} />
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
      <div className="space-y-2 md:hidden" data-testid="nfl-sides-mobile-list">
        {rows.map((row) => {
          const expanded = expandedId === row.game_id;
          const toggle = () => setExpandedId(expanded ? null : row.game_id);
          const final = row.game_completion_status === "final";
          return (
            <div key={row.game_id} className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
              <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Week {row.week}</span>
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {row.away_team.toUpperCase()} @ {row.home_team.toUpperCase()}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    JKB {formatSigned(row.projected_home_margin)} · Market {row.market_spread != null ? formatMetric(row.market_spread) : "—"} · Diff {formatSigned(row.jkb_minus_market)}
                    {final ? ` · Actual ${formatSigned(row.actual_margin, 0)}` : ""}
                  </span>
                </span>
                <NflResultBadge result={row.ats_result} />
              </button>
              {expanded && <NflPerformanceSidesDetail row={row} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
