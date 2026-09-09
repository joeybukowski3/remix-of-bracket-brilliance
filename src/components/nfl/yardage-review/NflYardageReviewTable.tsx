import { useMemo, useRef, useState } from "react";
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
import { isInteractiveTarget } from "./interactiveTarget";

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
  const expandedIndex = expandedKey == null ? -1 : entries.findIndex((e) => `${e.row.market}-${e.row.playerId}` === expandedKey);
  const expandedEntry = expandedIndex === -1 ? null : entries[expandedIndex];

  // Explicit, `table-layout: fixed` column widths -- shared, unconditionally, by BOTH table
  // fragments below (the row-set is split in two around an expanded detail panel; see the
  // comment at the panel's render site). Without an explicit width, `table-layout: auto` sizes
  // each column from that ONE table's own row content -- so the same "Player" column could come
  // out a different pixel width in the fragment above the expanded row than in the fragment
  // below it, if the two fragments' player names/values happen to differ in length. Fixed widths
  // make every column identical in both fragments regardless of content, so the columns stay
  // pixel-aligned across the break. Order matches the header/row cells exactly: chevron, Player,
  // Team, Opp, Pos, Role?, Proj Yds, Sportsbook, Diff, Matchup, Yds Allowed Szn/L5, Opp EPA/Success
  // Allowed, Team Edge.
  const columnWidths = [28, 150, 68, 68, 46, ...(showRoleStat ? [104] : []), 84, 96, 66, 104, 84, 84, 88, 112, 78];
  const tableMinWidth = columnWidths.reduce((sum, w) => sum + w, 0);
  const renderColgroup = () => (
    <colgroup>
      {columnWidths.map((width, i) => (
        <col key={i} style={{ width: `${width}px` }} />
      ))}
    </colgroup>
  );

  const renderHead = () => (
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
  );

  const renderRow = ({ row, marketInfo, band }: NflYardageReviewRow) => {
    const rowKey = `${row.market}-${row.playerId}`;
    const context = opponentContextByKey.get(rowKey);
    const expanded = expandedKey === rowKey;
    const toggle = () => setExpandedKey(expanded ? null : rowKey);
    return (
      <tr
        key={rowKey}
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
        <td className="truncate px-2 py-1.5 text-left font-medium text-slate-800" title={row.playerName}>{row.playerName}</td>
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
    );
  };

  const beforeAndExpanded = expandedIndex === -1 ? entries : entries.slice(0, expandedIndex + 1);
  const after = expandedIndex === -1 ? [] : entries.slice(expandedIndex + 1);

  // The split renders two independent horizontally-scrolling regions (see the comment at the
  // panel's render site) -- without this, scrolling the fragment above the panel to see the
  // "opponent context" columns (per the hint below) would NOT carry over to the fragment below
  // it, forcing the same horizontal scroll twice for one logical table. `DenseTableScroller`
  // doesn't forward a ref, so each region is wrapped in a plain div and its actual scrolling
  // element is found via `[role="region"]` rather than assigning it an id (this component can
  // have multiple live instances, e.g. one per market tab in tests).
  const firstScrollerWrapperRef = useRef<HTMLDivElement>(null);
  const secondScrollerWrapperRef = useRef<HTMLDivElement>(null);
  const syncScroll = (from: HTMLDivElement, to: React.RefObject<HTMLDivElement>) => {
    const target = to.current?.querySelector('[role="region"]');
    if (target && target.scrollLeft !== from.scrollLeft) target.scrollLeft = from.scrollLeft;
  };

  return (
    <div className="hidden md:block">
      <p className="mb-1 text-[10px] text-slate-400 xl:hidden">Scroll horizontally for opponent context columns →</p>
      <div className="rounded-lg border border-slate-300 shadow-sm">
        <div ref={firstScrollerWrapperRef}>
          <NflTableScroller
            label="Yardage projections table"
            onScroll={(e) => after.length > 0 && syncScroll(e.currentTarget, secondScrollerWrapperRef)}
          >
            <table className="w-full table-fixed text-xs" style={{ minWidth: `${tableMinWidth}px` }}>
              {renderColgroup()}
              {renderHead()}
              <tbody>{beforeAndExpanded.map(renderRow)}</tbody>
            </table>
          </NflTableScroller>
        </div>

        {/*
         * The expanded detail panel renders here, OUTSIDE the horizontally-scrolling,
         * width-forced comparison table above -- not inside a `<tr>`/`<td>` of it. A
         * colSpan cell inside that table is exactly as wide as the table's own rendered
         * width, which is often wider than the actual viewport (that's the whole point of
         * the "Scroll horizontally..." hint above); keeping the detail panel there would
         * force it to inherit that same forced-wide, scroll-to-see-it box regardless of
         * how much width its own content actually needs, and on many common laptop widths
         * would force the WHOLE table wider still to fit whatever the expanded panel
         * additionally demands. Splitting the row set here lets the panel size itself to
         * this wrapper's true, unscrolled width instead.
         *
         * Because that split renders the row set as two independent `<table>` elements
         * (one above the panel, one below), each table's columns are given explicit
         * `table-fixed` + `colgroup` widths (`columnWidths` above) rather than left to
         * `table-layout: auto` -- auto layout sizes each column from that ONE table's own
         * row content, so the same column could render a different pixel width in each
         * fragment if their content happens to differ in length. Fixed widths keep every
         * column pixel-identical across the split, in addition to matching the header.
         */}
        {expandedEntry && (
          <div className="border-t-2 border-slate-300">
            <NflYardageReviewDetailPanel
              row={expandedEntry.row}
              marketInfo={expandedEntry.marketInfo}
              opponentContext={opponentContextByKey.get(`${expandedEntry.row.market}-${expandedEntry.row.playerId}`)}
              season={season}
            />
          </div>
        )}

        {after.length > 0 && (
          <div ref={secondScrollerWrapperRef}>
            <NflTableScroller
              label="Yardage projections table (continued)"
              onScroll={(e) => syncScroll(e.currentTarget, firstScrollerWrapperRef)}
            >
              <table className="w-full table-fixed text-xs" style={{ minWidth: `${tableMinWidth}px` }}>
                {renderColgroup()}
                {renderHead()}
                <tbody>{after.map(renderRow)}</tbody>
              </table>
            </NflTableScroller>
          </div>
        )}
      </div>
    </div>
  );
}
