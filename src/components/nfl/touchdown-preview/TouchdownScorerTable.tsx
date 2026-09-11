import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { DenseTableScroller, DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW } from "@/components/ui/dense-table";
import { STICKY_TOP, useTouchdownStickyHeader, type TouchdownHeaderGeometry } from "./touchdownStickyHeader";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { sportsbookDisplayName } from "@/lib/nfl/bettingLinesView";
import { touchdownBoardPercentile, type TouchdownBoardHeat, type TouchdownSort, type TouchdownSortKey } from "@/lib/nfl/touchdown-preview/presentation";
import type { TouchdownPreviewPlayer, TouchdownWindowKey } from "@/lib/nfl/touchdown-preview/types";
import { cn } from "@/lib/utils";
import TouchdownMetricCell from "./TouchdownMetricCell";
import TouchdownPlayerDetail from "./TouchdownPlayerDetail";

const fmt1 = (value: number) => value.toFixed(1);
const fmt2 = (value: number) => value.toFixed(2);
const fmtPct = (value: number) => `${(value * 100).toFixed(1)}%`;
const fmtOdds = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/**
 * Progressive column disclosure. The smallest phone shows only the three
 * highest-priority columns (Player / JKB TD Score / Anytime TD, plus the expand
 * affordance); wider viewports add columns in analysis-priority order. Column DOM
 * order is fixed to the desktop order — only per-breakpoint visibility changes —
 * so the sticky clone (which measures live `<th>` boxes, hidden ones at width 0)
 * always mirrors exactly what is on screen.
 *
 * base : Player · JKB TD Score · Anytime TD
 * sm+  : + Opponent
 * md+  : + POS · TD/Game · TD/Game Last 5 · Team Usage %
 * lg+  : + Opp TD/Game vs Pos SZN · Opp TD/Game vs Pos Last 5
 */
const SM_UP = "hidden sm:table-cell";
const MD_UP = "hidden md:table-cell";
const LG_UP = "hidden lg:table-cell";
/** Shared per-cell horizontal rhythm: tighter on the smallest phone, normal from `sm` up. */
const CELL_X = "px-1 sm:px-2";

/**
 * Anytime TD price with the offering sportsbook as smaller secondary text beneath it.
 * Sportsbook context, not a JKB metric -- no percentile heat.
 */
function AnytimeTdCell({ odds, book, oddsSourceState }: { odds: number | null | undefined; book: string | null | undefined; oddsSourceState: TouchdownPreviewPlayer["oddsSourceState"] }) {
  if (odds == null) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className={cn("font-semibold tabular-nums text-slate-800", oddsSourceState === "suspended" && "text-slate-400")} title={oddsSourceState === "suspended" ? "Game has started -- odds are frozen, not live" : undefined}>
        {fmtOdds(odds)}{oddsSourceState === "suspended" && <span className="ml-1 text-[9px] font-normal uppercase text-amber-700">Suspended</span>}
      </span>
      {book ? <span className="text-[9px] font-normal normal-case text-slate-500">{sportsbookDisplayName(book)}</span> : null}
    </span>
  );
}

/**
 * Player name with the player's own team logo immediately before it, so team
 * identity is communicated once (here) and never repeated as a bare abbreviation
 * in the Opponent column. A mobile-only identity subline still carries the
 * matchup + position, which the desktop-only Opponent / POS columns drop.
 */
function PlayerCell({ name, team, opponent, homeAway, position }: { name: string; team: string; opponent: string; homeAway: "home" | "away"; position: string }) {
  return (
    <>
      <span className="flex items-center gap-1 sm:gap-1.5">
        <TeamLogo name={team} logo={nflLogoUrl(team)} className="h-4 w-4 shrink-0" />
        {/* Name may wrap to two lines at the narrowest widths; it is never hidden. */}
        <span className="font-semibold leading-tight text-slate-900">{name}</span>
      </span>
      {/* Below `sm` the Opponent column is hidden, so the matchup rides here as
          "@ OPP · POS". From `sm` up the Opponent column carries the matchup and
          only the position stays (until `md`, where the POS column takes over).
          The player's own team is never repeated — the logo above carries it. */}
      <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-slate-500 md:hidden">
        <span className="sm:hidden">{homeAway === "home" ? "vs" : "@"} {opponent} · </span>{position}
      </span>
    </>
  );
}

/**
 * Compact opponent indicator: `@ [logo]` for a road game, `vs [logo]` for a home
 * game. Home/away semantics come straight from `homeAway`. The logo's `alt` and
 * the wrapper `title` keep the opponent identity available to assistive tech and
 * on hover without spending a second abbreviation of horizontal space.
 */
function OpponentCell({ opponent, homeAway }: { opponent: string; homeAway: "home" | "away" }) {
  const prefix = homeAway === "home" ? "vs" : "@";
  return (
    <span className="flex items-center justify-center gap-1 whitespace-nowrap font-semibold uppercase text-slate-700" title={`${prefix} ${opponent}`}>
      <span className="text-[9px] font-bold text-slate-400">{prefix}</span>
      <TeamLogo name={opponent} logo={nflLogoUrl(opponent)} className="h-4 w-4" />
    </span>
  );
}

/**
 * "Opp TD/Game vs Pos SZN" board cell (lg+ only). A `prior_season_fallback`
 * value carries a subtle prior-year tag beneath the number and a cell `title`
 * so it is never read as true current-season YTD; a `current_season` value
 * renders as the bare heat cell to keep the row from growing taller.
 */
function SeasonOppCell({ metrics, season }: { metrics: TouchdownPreviewPlayer["windows"][TouchdownWindowKey]; season: number }) {
  const cell = <TouchdownMetricCell value={metrics.opponentPositionTdsAllowedPerGameSeason} percentile={metrics.opponentPositionTdsAllowedPerGameSeasonPercentile} format={fmt2} />;
  const isFallback = metrics.opponentPositionTdsAllowedPerGameSeasonSource === "prior_season_fallback";
  return (
    <td
      className={cn(CELL_X, "py-1.5 text-center align-top", LG_UP)}
      title={isFallback ? `Opponent has no ${season} games yet — showing the full ${season - 1} season rate` : undefined}
    >
      {isFallback ? (
        <span className="inline-flex flex-col items-center leading-none">
          {cell}
          <span className="mt-0.5 text-[8px] font-normal uppercase tracking-wide text-slate-400">{season - 1}</span>
        </span>
      ) : cell}
    </td>
  );
}

function Header({ label, sortKey, sort, onSort, title, className, buttonTabIndex }: { label: string; sortKey?: TouchdownSortKey; sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void; title?: string; className?: string; buttonTabIndex?: number }) {
  const active = sortKey && sort.key === sortKey;
  return <th scope="col" title={title} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined} className={cn("whitespace-nowrap px-1 py-2 text-center align-bottom text-[9px] leading-tight sm:px-2 sm:text-[10px]", className)}>
    {sortKey ? <button type="button" tabIndex={buttonTabIndex} onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600", active ? "text-sky-800" : "hover:text-slate-900")} aria-label={`Sort by ${label}`}>{label}{active ? sort.direction === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />}</button> : label}
  </th>;
}

/**
 * The single row of header cells, shared verbatim by the real (normal-flow)
 * `<thead>` and the page-scroll fixed clone so the two can never drift.
 * `clone` neutralises the clone's tab stops — the real header keeps them.
 */
function HeaderCells({ sort, onSort, clone = false }: { sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void; clone?: boolean }) {
  const tab = clone ? -1 : undefined;
  return <>
    <th className="w-6 px-1 py-2 sm:w-7" aria-label="Expand" />
    <Header label="Player" sortKey="player" sort={sort} onSort={onSort} className="text-left" buttonTabIndex={tab} />
    <Header label="Opponent" sortKey="opponent" sort={sort} onSort={onSort} className={SM_UP} title="This week's opponent; @ = road game, vs = home game. Sorts A–Z by opponent." buttonTabIndex={tab} />
    <Header label="POS" sort={sort} onSort={onSort} className={MD_UP} buttonTabIndex={tab} />
    <Header label="JKB TD Score" sortKey="score" sort={sort} onSort={onSort} title="Relative 0–100 player rating; not a touchdown probability" buttonTabIndex={tab} />
    <Header label="Anytime TD" sortKey="anytimeTd" sort={sort} onSort={onSort} title="Best approved-sportsbook price for this player to score a touchdown anytime, with the offering book beneath" buttonTabIndex={tab} />
    <Header label="TD/Game" sortKey="tdPerGame" sort={sort} onSort={onSort} className={MD_UP} title="Touchdowns per game across the selected window; color is a full-board percentile, not position-relative" buttonTabIndex={tab} />
    <Header label="TD/Game Last 5" sortKey="tdLast5" sort={sort} onSort={onSort} className={MD_UP} title="Touchdowns per game over the last 5 applicable games; color is a full-board percentile, not position-relative" buttonTabIndex={tab} />
    <Header label="Opp TD/Game vs Pos SZN" sortKey="oppTdVsPosSeason" sort={sort} onSort={onSort} className={LG_UP} title="Current-season TDs the opponent has allowed to this position, per game; falls back to the opponent's full prior season until it has played a current-season game. Higher = more favorable. Full-board percentile heat." buttonTabIndex={tab} />
    <Header label="Opp TD/Game vs Pos Last 5" sortKey="oppTdVsPosLast5" sort={sort} onSort={onSort} className={LG_UP} title="TDs the opponent has allowed to this position per game over its trailing five games, crossing the season boundary until five current-season games exist. Higher = more favorable. Full-board percentile heat." buttonTabIndex={tab} />
    <Header label="Team Usage %" sortKey="teamUsage" sort={sort} onSort={onSort} className={MD_UP} title="Player's share of the team's scorer opportunities; color is a full-board percentile" buttonTabIndex={tab} />
  </>;
}

/**
 * `position: fixed` clone of the header row, mounted only while the real
 * `<thead>` has scrolled under the 72px `SiteHeader` and the table body is still
 * on screen (see `useTouchdownStickyHeader`). It is measured from the live header
 * cells, so column widths — including the responsive `sm:` / `md:` / `lg:`
 * columns, which measure 0 until their breakpoint — line up exactly with the
 * body at every viewport. The inner
 * layer is translated by `-scrollLeft` so horizontal table scroll stays in sync.
 */
function TouchdownStickyHeaderClone({ geometry, sort, onSort }: { geometry: TouchdownHeaderGeometry; sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void }) {
  if (!geometry.active || geometry.columns.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="touchdown-sticky-header"
      className="fixed z-20 overflow-hidden border-b border-slate-300 bg-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
      style={{ top: STICKY_TOP, left: geometry.left, width: geometry.width, height: geometry.height }}
    >
      <div className="absolute left-0 top-0" style={{ width: geometry.tableWidth || undefined, transform: `translateX(${-geometry.scrollLeft}px)` }}>
        <table className="w-full border-separate border-spacing-0 text-[11px]">
          <colgroup>{geometry.columns.map((col, index) => <col key={index} style={{ width: `${col.width}px` }} />)}</colgroup>
          <thead><tr className={DENSE_TABLE_HEAD_ROW}><HeaderCells sort={sort} onSort={onSort} clone /></tr></thead>
        </table>
      </div>
    </div>
  );
}

export default function TouchdownScorerTable({ players, window, season, heat, sort, onSort }: { players: readonly TouchdownPreviewPlayer[]; window: TouchdownWindowKey; season: number; heat: TouchdownBoardHeat; sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { wrapRef, scrollRef, theadRef, geometry } = useTouchdownStickyHeader();
  return <div ref={wrapRef} className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" data-testid="touchdown-table">
    <DenseTableScroller label="NFL touchdown scorer rankings" data-testid="touchdown-table-scroller" scrollRef={scrollRef}>
      <table className="w-full border-separate border-spacing-0 text-[10px] sm:text-[11px] md:min-w-[1080px]">
        {/* Normal flow — no sticky offset here. `DenseTableScroller`'s
            `overflow-x` makes it (not the viewport) the sticky containing block,
            so a `top-[72px]` sticky `<thead>` would just be shoved 72px down
            inside the scroller (PR #327 bug). The 72px `SiteHeader`-relative pin
            is done by `TouchdownStickyHeaderClone` below instead. */}
        <thead ref={theadRef}><tr className={DENSE_TABLE_HEAD_ROW}>
          <HeaderCells sort={sort} onSort={onSort} />
        </tr></thead>
        <tbody>{players.map((player) => {
          const metrics = player.windows[window]; const open = expanded === player.playerId;
          const scorePercentile = metrics.scoreRank && metrics.scorePoolSize ? ((metrics.scorePoolSize - metrics.scoreRank) / metrics.scorePoolSize) * 100 : null;
          const toggle = () => setExpanded(open ? null : player.playerId);
          return <Fragment key={player.playerId}><tr className={cn(DENSE_TABLE_ROW, "cursor-pointer")} tabIndex={0} role="button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} details for ${player.playerName}`} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
            <td className={cn(CELL_X, "py-1.5 text-center align-top")}><ChevronRight className={cn("mx-auto mt-0.5 h-3.5 w-3.5 text-slate-400 transition-transform", open && "rotate-90")} /></td>
            <td className={cn(CELL_X, "py-1.5 align-top")}>
              <PlayerCell name={player.playerName} team={player.team} opponent={player.opponent} homeAway={player.homeAway} position={player.position} />
            </td>
            <td className={cn(CELL_X, "py-1.5 text-center align-top", SM_UP)}><OpponentCell opponent={player.opponent} homeAway={player.homeAway} /></td>
            <td className={cn(CELL_X, "py-1.5 text-center align-top font-semibold text-slate-600", MD_UP)}>{player.position}</td>
            <td className={cn(CELL_X, "py-1.5 text-center align-top")}><TouchdownMetricCell value={metrics.jkbTdScore} percentile={scorePercentile} format={fmt1} prominent rank={metrics.scoreRank} poolSize={metrics.scorePoolSize} /></td>
            <td className={cn(CELL_X, "py-1.5 text-center align-top")}><AnytimeTdCell odds={player.anytimeTdOdds} book={player.anytimeTdBook} oddsSourceState={player.oddsSourceState} /></td>
            <td className={cn(CELL_X, "py-1.5 text-center align-top", MD_UP)}><TouchdownMetricCell value={metrics.tdPerGame} percentile={touchdownBoardPercentile(metrics.tdPerGame, heat.tdPerGame)} format={fmt2} /></td>
            <td className={cn(CELL_X, "py-1.5 text-center align-top", MD_UP)}><TouchdownMetricCell value={metrics.tdLast5PerGame} percentile={touchdownBoardPercentile(metrics.tdLast5PerGame, heat.tdLast5PerGame)} format={fmt2} /></td>
            <SeasonOppCell metrics={metrics} season={season} />
            <td className={cn(CELL_X, "py-1.5 text-center align-top", LG_UP)}><TouchdownMetricCell value={metrics.opponentPositionTdsAllowedPerGameLast5} percentile={metrics.opponentPositionTdsAllowedPerGameLast5Percentile} format={fmt2} /></td>
            <td className={cn(CELL_X, "py-1.5 text-center align-top", MD_UP)}><TouchdownMetricCell value={metrics.teamUsageShare} percentile={touchdownBoardPercentile(metrics.teamUsageShare, heat.teamUsageShare)} format={fmtPct} /></td>
          </tr>{open && <tr><td colSpan={11} className="p-0">
            {/* Pin the detail panel to the viewport so the narrow mobile table cell
                cannot be stretched wide by the inner history tables. */}
            <div className="w-[calc(100vw-2rem)] max-w-full md:w-auto"><TouchdownPlayerDetail player={player} window={window} season={season} /></div>
          </td></tr>}</Fragment>;
        })}</tbody>
      </table>
    </DenseTableScroller>
    <TouchdownStickyHeaderClone geometry={geometry} sort={sort} onSort={onSort} />
  </div>;
}
