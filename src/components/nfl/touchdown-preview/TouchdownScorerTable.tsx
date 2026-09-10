import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { DenseTableScroller, DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW } from "@/components/ui/dense-table";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { sportsbookDisplayName } from "@/lib/nfl/bettingLinesView";
import type { TouchdownSort, TouchdownSortKey } from "@/lib/nfl/touchdown-preview/presentation";
import type { TouchdownPreviewPlayer, TouchdownWindowKey } from "@/lib/nfl/touchdown-preview/types";
import { cn } from "@/lib/utils";
import TouchdownMetricCell from "./TouchdownMetricCell";
import TouchdownPlayerDetail from "./TouchdownPlayerDetail";

const fmt1 = (value: number) => value.toFixed(1);
const fmt2 = (value: number) => value.toFixed(2);
const fmtPct = (value: number) => `${(value * 100).toFixed(1)}%`;
const fmtOdds = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** Columns hidden on phones — restored from `md` up. Keeps the mobile list to Player / Score / Anytime TD / Usage. */
const DESKTOP_ONLY = "hidden md:table-cell";

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

/** Team + opponent as one compact unit, e.g. "PHI vs WSH" / "BAL @ IND", logos preserved. */
function MatchupCell({ team, opponent, homeAway }: { team: string; opponent: string; homeAway: "home" | "away" }) {
  return (
    <span className="flex items-center justify-center gap-1 whitespace-nowrap font-semibold uppercase text-slate-700">
      <TeamLogo name={team} logo={nflLogoUrl(team)} className="h-4 w-4" />
      {team}
      <span className="mx-0.5 text-[9px] font-bold text-slate-400">{homeAway === "home" ? "VS" : "@"}</span>
      <TeamLogo name={opponent} logo={nflLogoUrl(opponent)} className="h-4 w-4" />
      {opponent}
    </span>
  );
}

function Header({ label, sortKey, sort, onSort, title, className }: { label: string; sortKey?: TouchdownSortKey; sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void; title?: string; className?: string }) {
  const active = sortKey && sort.key === sortKey;
  return <th scope="col" title={title} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined} className={cn("whitespace-nowrap px-2 py-2 text-center align-bottom", className)}>
    {sortKey ? <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600", active ? "text-sky-800" : "hover:text-slate-900")} aria-label={`Sort by ${label}`}>{label}{active ? sort.direction === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />}</button> : label}
  </th>;
}

export default function TouchdownScorerTable({ players, window, sort, onSort }: { players: readonly TouchdownPreviewPlayer[]; window: TouchdownWindowKey; sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" data-testid="touchdown-table">
    <DenseTableScroller label="NFL touchdown scorer rankings" data-testid="touchdown-table-scroller">
      <table className="w-full border-separate border-spacing-0 text-[11px] md:min-w-[900px]">
        <thead><tr className={DENSE_TABLE_HEAD_ROW}>
          <th className="w-7 px-1 py-2" aria-label="Expand" />
          <Header label="Player" sortKey="player" sort={sort} onSort={onSort} className="text-left" />
          <Header label="Matchup" sortKey="team" sort={sort} onSort={onSort} className={DESKTOP_ONLY} />
          <Header label="Pos" sort={sort} onSort={onSort} className={DESKTOP_ONLY} />
          <Header label="JKB TD Score" sortKey="score" sort={sort} onSort={onSort} title="Relative 0–100 player rating; not a touchdown probability" />
          <Header label="Anytime TD" sortKey="anytimeTd" sort={sort} onSort={onSort} title="Best approved-sportsbook price for this player to score a touchdown anytime, with the offering book beneath" />
          <Header label="Mkt Implied %" sortKey="marketImplied" sort={sort} onSort={onSort} title="Sportsbook-implied probability from the Anytime TD price, including vig -- not the JKB TD Score converted to a probability" className={DESKTOP_ONLY} />
          <Header label="TD/G" sortKey="tdPerGame" sort={sort} onSort={onSort} className={DESKTOP_ONLY} />
          <Header label="Usage" sortKey="usage" sort={sort} onSort={onSort} />
        </tr></thead>
        <tbody>{players.map((player) => {
          const metrics = player.windows[window]; const open = expanded === player.playerId;
          const scorePercentile = metrics.scoreRank && metrics.scorePoolSize ? ((metrics.scorePoolSize - metrics.scoreRank) / metrics.scorePoolSize) * 100 : null;
          const toggle = () => setExpanded(open ? null : player.playerId);
          return <Fragment key={player.playerId}><tr className={cn(DENSE_TABLE_ROW, "cursor-pointer")} tabIndex={0} role="button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} details for ${player.playerName}`} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
            <td className="px-1 py-1.5 text-center align-top"><ChevronRight className={cn("mx-auto mt-0.5 h-3.5 w-3.5 text-slate-400 transition-transform", open && "rotate-90")} /></td>
            <td className="px-2 py-1.5 align-top">
              <span className="block font-semibold text-slate-900">{player.playerName}</span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-500 md:hidden">
                {player.team} {player.homeAway === "home" ? "vs" : "@"} {player.opponent} · {player.position}
              </span>
            </td>
            <td className={cn("px-2 py-1.5 text-center align-top", DESKTOP_ONLY)}><MatchupCell team={player.team} opponent={player.opponent} homeAway={player.homeAway} /></td>
            <td className={cn("px-2 py-1.5 text-center align-top font-semibold text-slate-600", DESKTOP_ONLY)}>{player.position}</td>
            <td className="px-2 py-1.5 text-center align-top"><TouchdownMetricCell value={metrics.jkbTdScore} percentile={scorePercentile} format={fmt1} prominent rank={metrics.scoreRank} poolSize={metrics.scorePoolSize} /></td>
            <td className="px-2 py-1.5 text-center align-top"><AnytimeTdCell odds={player.anytimeTdOdds} book={player.anytimeTdBook} oddsSourceState={player.oddsSourceState} /></td>
            <td className={cn("px-2 py-1.5 text-center align-top tabular-nums text-slate-700", DESKTOP_ONLY)}>{player.marketImpliedProbability == null ? <span className="text-slate-400">—</span> : fmtPct(player.marketImpliedProbability)}</td>
            <td className={cn("px-2 py-1.5 text-center align-top", DESKTOP_ONLY)}><TouchdownMetricCell value={metrics.tdPerGame} percentile={metrics.components.tdSuccess.percentile} format={fmt2} /></td>
            <td className="px-2 py-1.5 text-center align-top"><TouchdownMetricCell value={metrics.usagePerGame} percentile={metrics.components.playerUsage.percentile} format={fmt1} /></td>
          </tr>{open && <tr><td colSpan={9} className="p-0">
            {/* Pin the detail panel to the viewport so the narrow mobile table cell
                cannot be stretched wide by the inner history tables. */}
            <div className="w-[calc(100vw-2rem)] max-w-full md:w-auto"><TouchdownPlayerDetail player={player} window={window} /></div>
          </td></tr>}</Fragment>;
        })}</tbody>
      </table>
    </DenseTableScroller>
  </div>;
}
