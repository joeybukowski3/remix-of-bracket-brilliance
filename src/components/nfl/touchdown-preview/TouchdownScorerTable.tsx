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

/** Anytime TD odds and Book, cell together: sportsbook context, not a JKB metric -- no percentile heat. */
function AnytimeTdCell({ odds, book, oddsSourceState }: { odds: number | null | undefined; book: string | null | undefined; oddsSourceState: TouchdownPreviewPlayer["oddsSourceState"] }) {
  if (odds == null) return <span className="text-slate-400">—</span>;
  return <span className={cn("font-semibold tabular-nums text-slate-800", oddsSourceState === "suspended" && "text-slate-400")} title={oddsSourceState === "suspended" ? "Game has started -- odds are frozen, not live" : undefined}>
    {fmtOdds(odds)}{oddsSourceState === "suspended" && <span className="ml-1 text-[9px] font-normal uppercase text-amber-700">Suspended</span>}
  </span>;
}

function Header({ label, sortKey, sort, onSort, title }: { label: string; sortKey?: TouchdownSortKey; sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void; title?: string }) {
  const active = sortKey && sort.key === sortKey;
  return <th scope="col" title={title} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined} className="whitespace-nowrap px-2 py-2 text-center align-bottom">
    {sortKey ? <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600", active ? "text-sky-800" : "hover:text-slate-900")} aria-label={`Sort by ${label}`}>{label}{active ? sort.direction === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />}</button> : label}
  </th>;
}

export default function TouchdownScorerTable({ players, window, sort, onSort }: { players: readonly TouchdownPreviewPlayer[]; window: TouchdownWindowKey; sort: TouchdownSort; onSort: (key: TouchdownSortKey) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" data-testid="touchdown-table">
    <p className="border-b border-slate-100 px-3 py-1.5 text-[10px] text-slate-500 lg:hidden">Swipe horizontally to compare all touchdown signals.</p>
    <DenseTableScroller label="NFL touchdown scorer rankings" data-testid="touchdown-table-scroller">
      <table className="w-full min-w-[2010px] border-separate border-spacing-0 text-[11px]">
        <thead><tr className={DENSE_TABLE_HEAD_ROW}>
          <th className="w-7 px-1 py-2" aria-label="Expand" />
          <Header label="Player" sortKey="player" sort={sort} onSort={onSort} /><Header label="Team" sortKey="team" sort={sort} onSort={onSort} /><Header label="Opp" sort={sort} onSort={onSort} /><Header label="Pos" sort={sort} onSort={onSort} />
          <Header label="JKB TD Score" sortKey="score" sort={sort} onSort={onSort} title="Relative 0–100 player rating; not a touchdown probability" />
          <Header label="Anytime TD" sortKey="anytimeTd" sort={sort} onSort={onSort} title="Best approved-sportsbook price for this player to score a touchdown anytime" />
          <Header label="Book" sort={sort} onSort={onSort} title="Sportsbook offering the selected Anytime TD price" />
          <Header label="Mkt Implied %" sortKey="marketImplied" sort={sort} onSort={onSort} title="Sportsbook-implied probability from the Anytime TD price, including vig -- not the JKB TD Score converted to a probability" />
          <Header label="TD/G" sortKey="tdPerGame" sort={sort} onSort={onSort} /><Header label="TD L5/G" sortKey="tdLast5" sort={sort} onSort={onSort} /><Header label="Usage" sortKey="usage" sort={sort} onSort={onSort} />
          <Header label="Team Usage %" sortKey="teamUsage" sort={sort} onSort={onSort} /><Header label="RZ Opp/G" sortKey="rz" sort={sort} onSort={onSort} /><Header label="Inside 10/G" sortKey="inside10" sort={sort} onSort={onSort} /><Header label="Goal Line/G" sortKey="goalLine" sort={sort} onSort={onSort} />
          <Header label="RZ Share" sortKey="rzShare" sort={sort} onSort={onSort} /><Header label="GL Share" sortKey="goalLineShare" sort={sort} onSort={onSort} /><Header label="Team Implied Pts" sortKey="implied" sort={sort} onSort={onSort} />
          <Header label="Opp TD Opp/G" sortKey="oppOpportunities" sort={sort} onSort={onSort} title="Scoring-area opportunities allowed; higher is favorable for the player" /><Header label="Opp TD Allowed vs Pos" sortKey="oppPositionTds" sort={sort} onSort={onSort} title="Rushing + receiving TD allowed to this position per game; higher is favorable" />
        </tr></thead>
        <tbody>{players.map((player) => {
          const metrics = player.windows[window]; const open = expanded === player.playerId;
          const scorePercentile = metrics.scoreRank && metrics.scorePoolSize ? ((metrics.scorePoolSize - metrics.scoreRank) / metrics.scorePoolSize) * 100 : null;
          const toggle = () => setExpanded(open ? null : player.playerId);
          return <Fragment key={player.playerId}><tr className={cn(DENSE_TABLE_ROW, "cursor-pointer")} tabIndex={0} role="button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} details for ${player.playerName}`} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
            <td className="px-1 py-1 text-center"><ChevronRight className={cn("mx-auto h-3.5 w-3.5 text-slate-400 transition-transform", open && "rotate-90")} /></td>
            <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-900">{player.playerName}</td>
            <td className="px-2 py-1.5"><span className="flex items-center justify-center gap-1.5 font-semibold uppercase text-slate-700"><TeamLogo name={player.team} logo={nflLogoUrl(player.team)} className="h-4 w-4" />{player.team}</span></td>
            <td className="whitespace-nowrap px-2 py-1.5 text-center uppercase text-slate-600"><span className="mr-1 text-[9px] font-bold text-slate-400">{player.homeAway === "home" ? "VS" : "@"}</span>{player.opponent}</td>
            <td className="px-2 py-1.5 text-center font-semibold text-slate-600">{player.position}</td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.jkbTdScore} percentile={scorePercentile} format={fmt1} prominent rank={metrics.scoreRank} poolSize={metrics.scorePoolSize} /></td>
            <td className="px-2 py-1.5 text-center"><AnytimeTdCell odds={player.anytimeTdOdds} book={player.anytimeTdBook} oddsSourceState={player.oddsSourceState} /></td>
            <td className="whitespace-nowrap px-2 py-1.5 text-center text-slate-600">{player.anytimeTdBook ? sportsbookDisplayName(player.anytimeTdBook) : <span className="text-slate-400">—</span>}</td>
            <td className="px-2 py-1.5 text-center tabular-nums text-slate-700">{player.marketImpliedProbability == null ? <span className="text-slate-400">—</span> : fmtPct(player.marketImpliedProbability)}</td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.tdPerGame} percentile={metrics.components.tdSuccess.percentile} format={fmt2} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.tdLast5PerGame} percentile={metrics.components.tdSuccess.percentile} format={fmt2} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.usagePerGame} percentile={metrics.components.playerUsage.percentile} format={fmt1} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.teamUsageShare} percentile={metrics.components.teamUsage.percentile} format={fmtPct} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.rzOpportunitiesPerGame} percentile={metrics.components.tdOpportunities.percentile} format={fmt2} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.inside10OpportunitiesPerGame} percentile={metrics.components.tdOpportunities.percentile} format={fmt2} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.goalLineOpportunitiesPerGame} percentile={metrics.components.tdOpportunities.percentile} format={fmt2} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.rzOpportunityShare} percentile={metrics.components.teamUsage.percentile} format={fmtPct} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.goalLineOpportunityShare} percentile={metrics.components.teamUsage.percentile} format={fmtPct} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.impliedTeamPoints} percentile={metrics.components.impliedTeamPoints.percentile} format={fmt1} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.opponentTdOpportunitiesPerGame} percentile={metrics.components.opponentTdOpportunities.percentile} format={fmt2} /></td>
            <td className="px-2 py-1.5 text-center"><TouchdownMetricCell value={metrics.opponentPositionTdsAllowedPerGame} percentile={metrics.components.opponentPositionTdsAllowed.percentile} format={fmt2} /></td>
          </tr>{open && <tr><td colSpan={21} className="p-0"><TouchdownPlayerDetail player={player} window={window} /></td></tr>}</Fragment>;
        })}</tbody>
      </table>
    </DenseTableScroller>
  </div>;
}
