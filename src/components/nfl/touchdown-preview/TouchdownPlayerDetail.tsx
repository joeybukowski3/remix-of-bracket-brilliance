import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import {
  computeOpponentHistoryAverages,
  computePlayerHistoryAverages,
  deltaTone,
  formatOpportunityDelta,
  historyAverageRowLabel,
  opportunityDelta,
  type DeltaTone,
} from "@/lib/nfl/touchdown-preview/historyAverages";
import { OPPONENT_POSITION_TD_ALLOWED_LABEL } from "@/lib/nfl/touchdown-preview/presentation";
import type { TouchdownPreviewPlayer, TouchdownWindowKey } from "@/lib/nfl/touchdown-preview/types";
import { cn } from "@/lib/utils";

const number = (value: number | null, digits = 1) => value == null ? "N/A" : value.toFixed(digits);
const score = (a: number | null, b: number | null) => a == null || b == null ? "N/A" : `${a}–${b}`;
const badge = (homeAway: "home" | "away") => <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${homeAway === "home" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-700"}`}>{homeAway === "home" ? "H" : "A"}</span>;

const DELTA_TONE_CLASS: Record<DeltaTone, string> = { positive: "text-emerald-700", negative: "text-rose-700", neutral: "text-slate-400" };

/** Team abbreviation with its logo, compact and inline -- not a separate wide column. */
function OpponentCell({ team }: { team: string }) {
  return <span className="flex items-center justify-center gap-1 font-semibold uppercase"><TeamLogo name={team} logo={nflLogoUrl(team)} className="h-3.5 w-3.5" />{team}</span>;
}

/** A cell value plus a compact, muted delta vs. the displayed-sample average, e.g. "4 (+1.2)". */
function DeltaCell({ value, average: sampleAverage, digits = 0 }: { value: number | null; average: number | null; digits?: number }) {
  if (value == null) return <span className="text-slate-400">N/A</span>;
  const delta = opportunityDelta(value, sampleAverage);
  const formatted = formatOpportunityDelta(delta);
  return <>{value.toFixed(digits)}{formatted && <span className={cn("ml-1 font-normal tabular-nums", DELTA_TONE_CLASS[deltaTone(delta)])}>{formatted}</span>}</>;
}

/** "62nd percentile" context for an Additional Stats metric, reusing an already-computed population percentile. No new baseline is invented here. */
function ordinal(n: number): string {
  const mod100 = Math.round(n) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${Math.round(n)}th`;
  switch (Math.round(n) % 10) {
    case 1: return `${Math.round(n)}st`;
    case 2: return `${Math.round(n)}nd`;
    case 3: return `${Math.round(n)}rd`;
    default: return `${Math.round(n)}th`;
  }
}
function PercentileContext({ percentile }: { percentile: number | null }) {
  if (percentile == null) return null;
  return <span className="ml-1 text-[9px] font-normal normal-case tracking-normal text-slate-400">{ordinal(percentile)} pctile</span>;
}

export default function TouchdownPlayerDetail({ player, window }: { player: TouchdownPreviewPlayer; window: TouchdownWindowKey }) {
  const metrics = player.windows[window];
  const playerGames = player.playerHistory.filter((game) => window === "last8" || game.season === Number(window)).slice(0, window === "last8" ? 8 : 10);
  const opponentGames = player.opponentHistory.filter((game) => window === "last8" || game.season === Number(window)).slice(0, window === "last8" ? 8 : 10);
  const playerAverages = computePlayerHistoryAverages(playerGames);
  const opponentAverages = computeOpponentHistoryAverages(opponentGames, player.position);
  const positionTdAllowedLabel = OPPONENT_POSITION_TD_ALLOWED_LABEL[player.position];
  const stats = [
    ["TD Success", metrics.tdSuccessRate == null ? "N/A" : `${(metrics.tdSuccessRate * 100).toFixed(1)}%`, metrics.components.tdSuccess.percentile],
    ["RZ Share", metrics.rzOpportunityShare == null ? "N/A" : `${(metrics.rzOpportunityShare * 100).toFixed(1)}%`, metrics.components.teamUsage.percentile],
    ["Goal-Line Share", metrics.goalLineOpportunityShare == null ? "N/A" : `${(metrics.goalLineOpportunityShare * 100).toFixed(1)}%`, metrics.components.teamUsage.percentile],
    ["Team Implied Pts", number(metrics.impliedTeamPoints), metrics.components.impliedTeamPoints.percentile],
    ["Anytime TD Odds", player.anytimeTdOdds == null ? "Unavailable" : String(player.anytimeTdOdds), null],
  ] as const;
  return <div className="bg-slate-50 px-2 py-2.5 sm:px-4" data-testid="touchdown-player-detail">
    <section aria-labelledby={`additional-${player.playerId}`}>
      <h3 id={`additional-${player.playerId}`} className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Additional stats</h3>
      <dl className="grid grid-cols-2 overflow-hidden rounded border border-slate-200 bg-white sm:grid-cols-5">
        {stats.map(([label, value, percentile]) => <div key={label} className="border-b border-r border-slate-100 px-2 py-1.5"><dt className="text-[9px] uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 text-xs font-semibold tabular-nums text-slate-800">{value}<PercentileContext percentile={percentile} /></dd></div>)}
      </dl>
    </section>
    <section className="mt-2 overflow-hidden rounded border border-sky-200 bg-white" aria-labelledby={`player-history-${player.playerId}`}>
      <h3 id={`player-history-${player.playerId}`} className="bg-sky-700 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">Player game history</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[10px]"><thead className="bg-sky-50 text-sky-900"><tr>{["Week","Opp","H/A","Score","TD","Rush TD","Rec TD","RZ Opps","Inside 10 Opps","Goal Line Opps","Usage"].map((head) => <th key={head} className="px-2 py-1 text-center">{head}</th>)}</tr></thead>
        <tbody>{playerGames.length ? <>{playerGames.map((game) => <tr key={game.gameId} className="border-t border-slate-100"><td className="px-2 py-1 text-center">{game.season} W{game.week}</td><td className="px-2 py-1 text-center"><OpponentCell team={game.opponent} /></td><td className="px-2 py-1 text-center">{badge(game.homeAway)}</td><td className="px-2 py-1 text-center">{score(game.teamScore, game.opponentScore)}</td><td className="px-2 py-1 text-center font-bold">{game.touchdowns}</td><td className="px-2 py-1 text-center">{game.rushingTds}</td><td className="px-2 py-1 text-center">{game.receivingTds}</td><td className="px-2 py-1 text-center"><DeltaCell value={game.rzOpportunities} average={playerAverages.rzOpportunities} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.inside10Opportunities} average={playerAverages.inside10Opportunities} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.goalLineOpportunities} average={playerAverages.goalLineOpportunities} /></td><td className="px-2 py-1 text-center">{game.scorerOpportunities ?? "N/A"}</td></tr>)}
          <tr className="border-t-2 border-sky-200 bg-sky-50/60 font-semibold text-sky-900"><td colSpan={4} className="px-2 py-1 text-right uppercase tracking-wide text-[9px]">{historyAverageRowLabel(playerGames.length)}</td><td className="px-2 py-1 text-center">{number(playerAverages.touchdowns, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.rushingTds, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.receivingTds, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.rzOpportunities, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.inside10Opportunities, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.goalLineOpportunities, 2)}</td><td className="px-2 py-1 text-center">{number(playerAverages.scorerOpportunities, 2)}</td></tr>
        </> : <tr><td colSpan={11} className="px-3 py-3 text-center text-slate-500">No applicable player games in this window.</td></tr>}</tbody></table></div>
    </section>
    <section className="mt-2 overflow-hidden rounded border border-violet-200 bg-white" aria-labelledby={`opponent-history-${player.playerId}`}>
      <h3 id={`opponent-history-${player.playerId}`} className="bg-violet-700 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">Opponent game history</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[10px]"><thead className="bg-violet-50 text-violet-900"><tr>{["Week","Opp","H/A","Score","Off TD Allowed","RZ Opps Allowed","Inside 10 Opps Allowed","Goal Line Opps Allowed",positionTdAllowedLabel].map((head) => <th key={head} className="px-2 py-1 text-center">{head}</th>)}</tr></thead>
        <tbody>{opponentGames.length ? <>{opponentGames.map((game) => <tr key={`${game.gameId}-${game.defense}`} className="border-t border-slate-100"><td className="px-2 py-1 text-center">{game.season} W{game.week}</td><td className="px-2 py-1 text-center"><OpponentCell team={game.opponent} /></td><td className="px-2 py-1 text-center">{badge(game.homeAway)}</td><td className="px-2 py-1 text-center">{score(game.defenseScore, game.opponentScore)}</td><td className="px-2 py-1 text-center font-bold">{game.offensiveTdsAllowed}</td><td className="px-2 py-1 text-center"><DeltaCell value={game.rzOpportunitiesAllowed} average={opponentAverages.rzOpportunitiesAllowed} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.inside10OpportunitiesAllowed} average={opponentAverages.inside10OpportunitiesAllowed} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.goalLineOpportunitiesAllowed} average={opponentAverages.goalLineOpportunitiesAllowed} /></td><td className="px-2 py-1 text-center"><DeltaCell value={game.touchdownsAllowedByPosition[player.position]} average={opponentAverages.positionTdsAllowed} /></td></tr>)}
          <tr className="border-t-2 border-violet-200 bg-violet-50/60 font-semibold text-violet-900"><td colSpan={4} className="px-2 py-1 text-right uppercase tracking-wide text-[9px]">{historyAverageRowLabel(opponentGames.length)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.offensiveTdsAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.rzOpportunitiesAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.inside10OpportunitiesAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.goalLineOpportunitiesAllowed, 2)}</td><td className="px-2 py-1 text-center">{number(opponentAverages.positionTdsAllowed, 2)}</td></tr>
        </> : <tr><td colSpan={9} className="px-3 py-3 text-center text-slate-500">No applicable opponent games in this window.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
