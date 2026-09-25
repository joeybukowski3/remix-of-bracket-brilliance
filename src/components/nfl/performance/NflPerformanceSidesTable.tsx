import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import { NflResultBadge } from "./NflPerformanceBadges";
import { computeSuResult } from "@/lib/nfl/performance/records";
import NflPerformanceSidesDetail from "./NflPerformanceSidesDetail";
import { MatchupIdentity, TeamIdentity } from "./NflPerformanceIdentity";
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
          <table className="w-full min-w-[920px] text-xs">
            <thead>
              <tr className={cn(NFL_TABLE_HEAD_ROW, "[&>th:not(:last-child)]:border-r [&>th]:border-slate-200/70")}>
                <th scope="col" className="w-6 px-1 py-2" aria-hidden="true" />
                <SortHeader label="Week" sortKey="week" sort={sort} onSort={onSort} />
                <th scope="col" className="border-r border-slate-200/70 px-2 py-2 text-left align-bottom">Matchup</th>
                <SortHeader label="JKB Margin" sortKey="projected_home_margin" sort={sort} onSort={onSort} />
                <SortHeader label="Market Spread" sortKey="market_spread" sort={sort} onSort={onSort} />
                <SortHeader label="Diff" sortKey="abs_jkb_market_diff" sort={sort} onSort={onSort} />
                <SortHeader label="Actual Margin" sortKey="actual_margin" sort={sort} onSort={onSort} />
                <SortHeader label="Abs Error" sortKey="absolute_margin_error" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-center align-bottom">JKB Side</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">ATS</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">SU</th>
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
                      className={cn(NFL_TABLE_ROW, "cursor-pointer [&>td]:border-r [&>td]:border-slate-200/60 [&>td:last-child]:border-r-0", row.ats_result === "WIN" && "bg-emerald-50/25", row.ats_result === "LOSS" && "bg-rose-50/25", (row.ats_result === "PUSH" || row.ats_result === "NEUTRAL") && "bg-amber-50/25")}
                      data-ats-result={row.ats_result?.toLowerCase() ?? "ungraded"}
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
                        <MatchupIdentity away={row.away_team} home={row.home_team} />
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-sky-800">{formatSigned(row.projected_home_margin)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-700">{row.market_spread != null ? formatMetric(row.market_spread) : "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatSigned(row.jkb_minus_market)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{final ? formatSigned(row.actual_margin, 0) : "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{final ? formatMetric(row.absolute_margin_error) : "—"}</td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{row.jkb_supports_team ? <TeamIdentity abbr={row.jkb_supports_team} compact /> : jkbSideLabel(row)}</td>
                      <td className="px-2 py-1.5 text-center"><NflResultBadge result={row.ats_result} /></td>
                      <td className="px-2 py-1.5 text-center"><NflResultBadge result={computeSuResult(row)} /></td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={11} className="p-0">
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
            <div key={row.game_id} data-ats-result={row.ats_result?.toLowerCase() ?? "ungraded"} className={cn("overflow-hidden rounded-lg border border-slate-200 bg-white", row.ats_result === "WIN" && "border-l-emerald-300", row.ats_result === "LOSS" && "border-l-rose-300", (row.ats_result === "PUSH" || row.ats_result === "NEUTRAL") && "border-l-amber-300")}>
              <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Week {row.week}</span>
                  <span className="block text-sm font-semibold text-slate-900"><MatchupIdentity away={row.away_team} home={row.home_team} /></span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    JKB {formatSigned(row.projected_home_margin)} · Market {row.market_spread != null ? formatMetric(row.market_spread) : "—"} · Diff {formatSigned(row.jkb_minus_market)}
                    {final ? ` · Actual ${formatSigned(row.actual_margin, 0)}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-400">ATS <NflResultBadge result={row.ats_result} /></span>
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-400">SU <NflResultBadge result={computeSuResult(row)} /></span>
                </span>
              </button>
              {expanded && <NflPerformanceSidesDetail row={row} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
