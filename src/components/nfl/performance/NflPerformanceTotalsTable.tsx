import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import { NflResultBadge } from "./NflPerformanceBadges";
import NflPerformanceTotalsDetail from "./NflPerformanceTotalsDetail";
import type { TotalsSortKey, TotalsSortState } from "@/lib/nfl/performance/totalsFilters";
import type { TotalsPerformanceRow } from "@/types/nfl/performance";

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: TotalsSortKey;
  sort: TotalsSortState;
  onSort: (key: TotalsSortKey) => void;
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

/**
 * Desktop table (`table md:table` breakpoint) and mobile card list share one
 * file and one expand/collapse state -- both render the same
 * NflPerformanceTotalsDetail underneath the tapped row.
 */
export default function NflPerformanceTotalsTable({
  rows,
  sort,
  onSort,
}: {
  rows: readonly TotalsPerformanceRow[];
  sort: TotalsSortState;
  onSort: (key: TotalsSortKey) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-300 shadow-sm md:block">
        <NflTableScroller label="Totals performance table">
          <table className="w-full min-w-[860px] text-xs">
            <thead>
              <tr className={NFL_TABLE_HEAD_ROW}>
                <th scope="col" className="w-6 px-1 py-2" aria-hidden="true" />
                <SortHeader label="Week" sortKey="week" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-left align-bottom">Matchup</th>
                <SortHeader label="JKB Total" sortKey="projected_game_total" sort={sort} onSort={onSort} />
                <SortHeader label="Market Total" sortKey="market_total" sort={sort} onSort={onSort} />
                <SortHeader label="Diff" sortKey="abs_jkb_market_diff" sort={sort} onSort={onSort} />
                <SortHeader label="Actual" sortKey="actual_game_total" sort={sort} onSort={onSort} />
                <SortHeader label="Abs Error" sortKey="absolute_total_error" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-center align-bottom">Direction</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedId === row.game_id;
                const toggle = () => setExpandedId(expanded ? null : row.game_id);
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
                        {row.away_team.toUpperCase()} {formatMetric(row.away_expected_points)} – {row.home_team.toUpperCase()} {formatMetric(row.home_expected_points)}
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums font-semibold">{formatMetric(row.projected_game_total)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{row.market_total != null ? formatMetric(row.market_total) : "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatSigned(row.jkb_minus_market)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{row.game_completion_status === "final" ? formatMetric(row.actual_game_total, 0) : "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatMetric(row.absolute_total_error)}</td>
                      <td className="px-2 py-1.5 text-center text-slate-600">{row.jkb_market_direction ?? "—"}</td>
                      <td className="px-2 py-1.5 text-center"><NflResultBadge result={row.directional_result} /></td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <NflPerformanceTotalsDetail row={row} />
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
      <div className="space-y-2 md:hidden" data-testid="nfl-totals-mobile-list">
        {rows.map((row) => {
          const expanded = expandedId === row.game_id;
          const toggle = () => setExpandedId(expanded ? null : row.game_id);
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
                    {row.away_team.toUpperCase()} {formatMetric(row.away_expected_points)} – {row.home_team.toUpperCase()} {formatMetric(row.home_expected_points)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    JKB {formatMetric(row.projected_game_total)} · Market {row.market_total != null ? formatMetric(row.market_total) : "—"} · Diff {formatSigned(row.jkb_minus_market)}
                  </span>
                </span>
                <NflResultBadge result={row.directional_result} />
              </button>
              {expanded && <NflPerformanceTotalsDetail row={row} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
