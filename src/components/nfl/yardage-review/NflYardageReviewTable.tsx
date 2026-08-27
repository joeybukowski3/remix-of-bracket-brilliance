import { Fragment, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import type { NflYardageReviewRow } from "@/lib/nfl/props/review/yardageMarketJoin";
import { weeklyHeatClass, weeklyHeatStyle, type NflYardageOpponentContextWithHeat, type WeeklyHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import type { NflYardageReviewSortKey, NflYardageReviewSortState } from "@/lib/nfl/props/review/reviewFilters";
import NflYardageReviewTeamCell from "./NflYardageReviewTeamCell";
import { NflMatchupScoreBadge } from "./NflYardageReviewBadges";
import { marketRoleStat } from "./marketRoleStat";
import {
  OPP_DEFENSE_RANK_DIRECTION_HINT,
  OppEdgeCell,
  OppEpaAllowedCell,
  OppSuccessAllowedCell,
  OppYardsAllowedL5Cell,
  OppYardsAllowedSeasonCell,
} from "./opponentContextCells";
import NflYardageReviewDetailPanel from "./NflYardageReviewDetailPanel";

/**
 * True when a click/keydown originated on a native interactive child (button,
 * link, form control) rather than the row background -- used so the
 * whole-row expand toggle never fires from a click meant for a child
 * control. Deliberately excludes `[role="button"]` -- the row itself carries
 * that role for its own click/keyboard handling, and matching it here would
 * make every click on the row look like a click on an "interactive child".
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input, select, textarea") != null;
}

function SortArrow({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 opacity-40" fill="none" aria-hidden="true">
        <path d="M5 6.5 8 3.5 11 6.5M5 9.5 8 12.5 11 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const d = direction === "desc" ? "M8 3v9M4.5 9 8 12.5 11.5 9" : "M8 13V4M4.5 7 8 3.5 11.5 7";
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-sky-700" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "center",
  title,
}: {
  label: string;
  sortKey: NflYardageReviewSortKey;
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  align?: "left" | "center";
  title?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      scope="col"
      title={title}
      aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}
      className={`px-2 py-2 ${align === "left" ? "text-left" : "text-center"} align-bottom`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={`flex items-center gap-1 rounded px-1 -mx-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${align === "center" ? "mx-auto" : ""} ${active ? "text-sky-800" : "text-slate-600 hover:text-slate-900"}`}
      >
        {label}
        <SortArrow direction={active ? sort!.direction : null} />
      </button>
    </th>
  );
}

/** Desktop-density table for one yardage market. Mobile gets a separate card list (NflYardageReviewCardList). */
export default function NflYardageReviewTable({
  entries,
  sort,
  onSort,
  opponentContextByKey,
  projectedYardsHeatByKey,
  season,
}: {
  entries: readonly NflYardageReviewRow[];
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  opponentContextByKey: ReadonlyMap<string, NflYardageOpponentContextWithHeat>;
  projectedYardsHeatByKey: ReadonlyMap<string, WeeklyHeatTone>;
  season: number;
}) {
  // Passing has no opportunity x efficiency breakdown (no carries/targets leg) --
  // the Role column is always empty for that market, so it is dropped rather
  // than shown as a column of dashes.
  const showRoleStat = useMemo(() => entries.some((e) => marketRoleStat(e.row) != null), [entries]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="hidden md:block">
      <p className="mb-1 text-[10px] text-slate-400 xl:hidden">Scroll horizontally for opponent context columns →</p>
      <div className="rounded-lg border border-slate-300 shadow-sm">
        <NflTableScroller label="Yardage projections table">
          <table className="w-full min-w-[1120px] text-xs">
            <thead>
              <tr className={NFL_TABLE_HEAD_ROW}>
                <th scope="col" className="w-6 px-1 py-2" aria-hidden="true" />
                <SortHeader label="Player" sortKey="player" sort={sort} onSort={onSort} align="left" />
                <SortHeader label="Team" sortKey="team" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-center align-bottom">Opp</th>
                <th scope="col" className="px-2 py-2 text-center align-bottom">Pos</th>
                {showRoleStat && <th scope="col" className="px-2 py-2 text-center align-bottom">Role</th>}
                <SortHeader label="Proj Yds" sortKey="projectedYards" sort={sort} onSort={onSort} />
                <th scope="col" className="px-2 py-2 text-center align-bottom">Sportsbook</th>
                <SortHeader label="Diff" sortKey="difference" sort={sort} onSort={onSort} />
                <SortHeader label="Matchup" sortKey="matchupScore" sort={sort} onSort={onSort} />
                <SortHeader
                  label="Yds Allowed Szn"
                  sortKey="oppYardsAllowedSeason"
                  sort={sort}
                  onSort={onSort}
                  title="Opponent yards allowed -- 2025 season"
                />
                <SortHeader
                  label="Yds Allowed L5"
                  sortKey="oppYardsAllowedL5"
                  sort={sort}
                  onSort={onSort}
                  title="Opponent yards allowed -- final 5 applicable 2025 games"
                />
                <SortHeader
                  label="Opp EPA Allowed"
                  sortKey="oppEpaAllowedRank"
                  sort={sort}
                  onSort={onSort}
                  title={`Opponent EPA allowed, by defensive rank. ${OPP_DEFENSE_RANK_DIRECTION_HINT}`}
                />
                <SortHeader
                  label="Opp Success Allowed"
                  sortKey="oppSuccessAllowedRank"
                  sort={sort}
                  onSort={onSort}
                  title={`Opponent Success Rate allowed, by defensive rank. ${OPP_DEFENSE_RANK_DIRECTION_HINT}`}
                />
                <th scope="col" className="px-2 py-2 text-center align-bottom" title="Team Edge: opponent EPA-defense rank minus offense rank; positive favors the offense">Team Edge</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ row, marketInfo, band }) => {
                const rowKey = `${row.market}-${row.playerId}`;
                const context = opponentContextByKey.get(rowKey);
                const expanded = expandedKey === rowKey;
                const toggle = () => setExpandedKey(expanded ? null : rowKey);
                return (
                  <Fragment key={rowKey}>
                  <tr
                    className={cn(NFL_TABLE_ROW, "cursor-pointer")}
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    aria-label={expanded ? `Collapse details for ${row.playerName}` : `Expand details for ${row.playerName}`}
                    onClick={(event) => {
                      if (isInteractiveTarget(event.target)) return;
                      toggle();
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggle();
                    }}
                  >
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={toggle}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none rounded p-0.5 text-slate-400 transition"
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} aria-hidden="true" />
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-left font-medium text-slate-800">{row.playerName}</td>
                    <td className="px-2 py-1.5 text-center"><NflYardageReviewTeamCell abbr={row.team} /></td>
                    <td className="px-2 py-1.5 text-center"><NflYardageReviewTeamCell abbr={row.opponent} /></td>
                    <td className="px-2 py-1.5 text-center text-slate-600">{row.position}</td>
                    {showRoleStat && <td className="px-2 py-1.5 text-center text-[10px] text-slate-500">{marketRoleStat(row) ?? "—"}</td>}
                    {/* Projection is the primary numeric value on this page -- deliberately the largest, boldest figure in the row. Heat is a presentation-only rank within the row's market+position pool; the value shown is always the raw projection, never a rank. */}
                    <td className="px-2 py-1.5 text-center tabular-nums">
                      {row.projectedYards != null ? (
                        <span
                          className={cn(
                            "inline-flex min-w-[3rem] items-center justify-center rounded px-1.5 py-0.5 text-sm font-bold",
                            weeklyHeatClass(projectedYardsHeatByKey.get(rowKey) ?? "missing"),
                          )}
                          style={weeklyHeatStyle(projectedYardsHeatByKey.get(rowKey) ?? "missing")}
                        >
                          {row.projectedYards.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-slate-900">—</span>
                      )}
                    </td>
                    {/* Sportsbook line is deliberately smaller/lighter than the projection above -- distinct, but secondary. */}
                    <td className="px-2 py-1.5 text-center tabular-nums">
                      {marketInfo.available ? (
                        <span className="inline-flex flex-col leading-tight">
                          <span className="font-semibold text-slate-700">{marketInfo.line.toFixed(1)}</span>
                          <span className="text-[9px] font-normal text-slate-400">{marketInfo.overPrice} / {marketInfo.underPrice}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400" title="No matching sportsbook line for this player">Unavailable</span>
                      )}
                    </td>
                    {/* Research context only -- neutral color on purpose, never green/red "bet this side" styling. */}
                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">
                      {marketInfo.available ? (
                        <span title="Projection minus sportsbook line -- research context only, not a recommendation">
                          {marketInfo.rawDifference >= 0 ? "+" : ""}
                          {marketInfo.rawDifference.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <NflMatchupScoreBadge score={row.matchupScore?.matchupScore ?? null} band={band} />
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums"><OppYardsAllowedSeasonCell context={context} /></td>
                    <td className="px-2 py-1.5 text-center tabular-nums"><OppYardsAllowedL5Cell context={context} /></td>
                    <td className="px-2 py-1.5 text-center tabular-nums"><OppEpaAllowedCell context={context} /></td>
                    <td className="px-2 py-1.5 text-center tabular-nums"><OppSuccessAllowedCell context={context} /></td>
                    <td className="px-2 py-1.5 text-center tabular-nums"><OppEdgeCell context={context} /></td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-slate-100">
                      <td colSpan={showRoleStat ? 15 : 14} className="p-0">
                        <NflYardageReviewDetailPanel row={row} marketInfo={marketInfo} opponentContext={context} season={season} />
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
    </div>
  );
}
