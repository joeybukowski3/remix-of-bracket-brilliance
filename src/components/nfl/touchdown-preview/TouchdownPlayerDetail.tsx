import type { TouchdownPreviewPlayer, TouchdownWindowKey } from "@/lib/nfl/touchdown-preview/types";

const number = (value: number | null, digits = 1) => value == null ? "N/A" : value.toFixed(digits);
const score = (a: number | null, b: number | null) => a == null || b == null ? "N/A" : `${a}–${b}`;
const badge = (homeAway: "home" | "away") => <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${homeAway === "home" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-700"}`}>{homeAway === "home" ? "H" : "A"}</span>;

export default function TouchdownPlayerDetail({ player, window }: { player: TouchdownPreviewPlayer; window: TouchdownWindowKey }) {
  const metrics = player.windows[window];
  const playerGames = player.playerHistory.filter((game) => window === "last8" || game.season === Number(window)).slice(0, window === "last8" ? 8 : 10);
  const opponentGames = player.opponentHistory.filter((game) => window === "last8" || game.season === Number(window)).slice(0, window === "last8" ? 8 : 10);
  const stats = [
    ["TD Success", metrics.tdSuccessRate == null ? "N/A" : `${(metrics.tdSuccessRate * 100).toFixed(1)}%`],
    ["RZ Share", metrics.rzOpportunityShare == null ? "N/A" : `${(metrics.rzOpportunityShare * 100).toFixed(1)}%`],
    ["Goal-Line Share", metrics.goalLineOpportunityShare == null ? "N/A" : `${(metrics.goalLineOpportunityShare * 100).toFixed(1)}%`],
    ["Team Implied Pts", number(metrics.impliedTeamPoints)], ["Anytime TD Odds", player.anytimeTdOdds == null ? "Unavailable" : String(player.anytimeTdOdds)],
  ];
  return <div className="bg-slate-50 px-2 py-2.5 sm:px-4" data-testid="touchdown-player-detail">
    <section aria-labelledby={`additional-${player.playerId}`}>
      <h3 id={`additional-${player.playerId}`} className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Additional stats</h3>
      <dl className="grid grid-cols-2 overflow-hidden rounded border border-slate-200 bg-white sm:grid-cols-5">
        {stats.map(([label, value]) => <div key={label} className="border-b border-r border-slate-100 px-2 py-1.5"><dt className="text-[9px] uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 text-xs font-semibold tabular-nums text-slate-800">{value}</dd></div>)}
      </dl>
    </section>
    <section className="mt-2 overflow-hidden rounded border border-sky-200 bg-white" aria-labelledby={`player-history-${player.playerId}`}>
      <h3 id={`player-history-${player.playerId}`} className="bg-sky-700 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">Player game history</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[10px]"><thead className="bg-sky-50 text-sky-900"><tr>{["Week","Opp","H/A","Score","TD","Rush TD","Rec TD","RZ Opp","I10 Opp","GL Opp","Usage"].map((head) => <th key={head} className="px-2 py-1 text-center">{head}</th>)}</tr></thead>
        <tbody>{playerGames.length ? playerGames.map((game) => <tr key={game.gameId} className="border-t border-slate-100"><td className="px-2 py-1 text-center">{game.season} W{game.week}</td><td className="px-2 py-1 text-center font-semibold uppercase">{game.opponent}</td><td className="px-2 py-1 text-center">{badge(game.homeAway)}</td><td className="px-2 py-1 text-center">{score(game.teamScore, game.opponentScore)}</td><td className="px-2 py-1 text-center font-bold">{game.touchdowns}</td><td className="px-2 py-1 text-center">{game.rushingTds}</td><td className="px-2 py-1 text-center">{game.receivingTds}</td><td className="px-2 py-1 text-center">{game.rzOpportunities ?? "N/A"}</td><td className="px-2 py-1 text-center">{game.inside10Opportunities ?? "N/A"}</td><td className="px-2 py-1 text-center">{game.goalLineOpportunities ?? "N/A"}</td><td className="px-2 py-1 text-center">{game.scorerOpportunities ?? "N/A"}</td></tr>) : <tr><td colSpan={11} className="px-3 py-3 text-center text-slate-500">No applicable player games in this window.</td></tr>}</tbody></table></div>
    </section>
    <section className="mt-2 overflow-hidden rounded border border-violet-200 bg-white" aria-labelledby={`opponent-history-${player.playerId}`}>
      <h3 id={`opponent-history-${player.playerId}`} className="bg-violet-700 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">Opponent game history</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[790px] text-[10px]"><thead className="bg-violet-50 text-violet-900"><tr>{["Week","Opp","H/A","Score","Off TD Allowed","RZ Against","I10 Against","GL Against","QB TD","RB TD","WR TD","TE TD"].map((head) => <th key={head} className="px-2 py-1 text-center">{head}</th>)}</tr></thead>
        <tbody>{opponentGames.length ? opponentGames.map((game) => <tr key={`${game.gameId}-${game.defense}`} className="border-t border-slate-100"><td className="px-2 py-1 text-center">{game.season} W{game.week}</td><td className="px-2 py-1 text-center font-semibold uppercase">{game.opponent}</td><td className="px-2 py-1 text-center">{badge(game.homeAway)}</td><td className="px-2 py-1 text-center">{score(game.defenseScore, game.opponentScore)}</td><td className="px-2 py-1 text-center font-bold">{game.offensiveTdsAllowed}</td><td className="px-2 py-1 text-center">{game.rzOpportunitiesAllowed ?? "N/A"}</td><td className="px-2 py-1 text-center">{game.inside10OpportunitiesAllowed ?? "N/A"}</td><td className="px-2 py-1 text-center">{game.goalLineOpportunitiesAllowed ?? "N/A"}</td>{(["QB","RB","WR","TE"] as const).map((pos) => <td key={pos} className="px-2 py-1 text-center">{game.touchdownsAllowedByPosition[pos]}</td>)}</tr>) : <tr><td colSpan={12} className="px-3 py-3 text-center text-slate-500">No applicable opponent games in this window.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
