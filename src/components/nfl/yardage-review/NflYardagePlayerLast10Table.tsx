/**
 * Player Last-10 history table for the Yardage Props Review detail panel.
 * Market-specific column set (passing/rushing/receiving), leakage-safe
 * historical fields sourced entirely from `yardage-history.json` -- see
 * `scripts/generate-nfl-yardage-history.mjs` for provenance. Pure
 * presentation; no computation happens in this component.
 */
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { NflYardagePlayerHistory, NflYardagePassingStatBlock, NflYardageRushingStatBlock, NflYardageReceivingStatBlock } from "@/lib/nfl/props/types/yardageHistory";
import { buildPlayerLast10Summary, formatOpponentDisplay } from "@/lib/nfl/props/review/yardageHistoryView";
import {
  NflYardageActualYardsCell,
  NflYardageGameScoreCell,
  NflYardageHomeAwayPill,
  NflYardageLast10SummaryStrip,
  NflYardageRankCell,
  NflYardageVegasLineCell,
} from "./NflYardageHistoryCells";

function fmtDate(dateUtc: string | null): string {
  if (!dateUtc) return "N/A";
  return new Date(dateUtc).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmt1(value: number | null): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}

const MARKET_YARDS_LABEL: Record<NflProjectionMarket, string> = { passing: "Pass Yds", rushing: "Rush Yds", receiving: "Rec Yds" };

export default function NflYardagePlayerLast10Table({
  playerName,
  history,
  currentLine,
}: {
  playerName: string;
  history: NflYardagePlayerHistory | null;
  currentLine: number | null;
}) {
  if (!history || history.games.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-[11px] text-slate-400">
        No leakage-safe Last-10 history available for {playerName} yet.
      </div>
    );
  }

  const summary = buildPlayerLast10Summary(history.games, currentLine);
  const market = history.market;

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
        {playerName} — Last {history.games.length} Games
      </h4>
      <NflYardageLast10SummaryStrip summary={summary} />
      <div className="overflow-x-auto rounded-md border-2 border-slate-300">
        <table className="w-full min-w-[720px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-200/70 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
              <th className="px-2 py-1.5">Date</th>
              <th className="px-2 py-1.5">Opponent</th>
              <th className="px-2 py-1.5">Opp Def Rank</th>
              <th className="px-2 py-1.5 bg-slate-100/80">Opp Yds Allow Avg</th>
              <th className="px-2 py-1.5 bg-slate-100/80">{MARKET_YARDS_LABEL[market]}</th>
              {market === "passing" && <th className="px-2 py-1.5">Cmp / Att</th>}
              {market === "passing" && <th className="px-2 py-1.5">TD / INT</th>}
              {market === "rushing" && <th className="px-2 py-1.5">Rush Att</th>}
              {market === "rushing" && <th className="px-2 py-1.5">Rush TD</th>}
              {market === "receiving" && <th className="px-2 py-1.5">Targets / Rec</th>}
              {market === "receiving" && <th className="px-2 py-1.5">Rec TD</th>}
              <th className="px-2 py-1.5">Game Score</th>
              <th className="px-2 py-1.5">Vegas Line</th>
            </tr>
          </thead>
          <tbody>
            {history.games.map((game) => (
              <tr key={`${game.gameId ?? `${game.season}-${game.week}`}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-1.5 tabular-nums text-slate-600">{fmtDate(game.dateUtc)}</td>
                <td className="px-2 py-1.5">
                  <span className="mr-1.5">{formatOpponentDisplay(game.opponentAbbr, game.homeAway)}</span>
                  <NflYardageHomeAwayPill homeAway={game.homeAway} />
                </td>
                <td className="px-2 py-1.5"><NflYardageRankCell rank={game.oppDefRank} /></td>
                <td className="px-2 py-1.5 bg-slate-50/70 tabular-nums text-slate-700">{fmt1(game.oppYdsAllowAvg)}</td>
                <td className="px-2 py-1.5 bg-slate-50/70"><NflYardageActualYardsCell actualYards={game.actualYards} currentLine={currentLine} /></td>
                {market === "passing" && (
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">
                    {(game.stat as NflYardagePassingStatBlock).completions} / {(game.stat as NflYardagePassingStatBlock).attempts}
                  </td>
                )}
                {market === "passing" && (
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">
                    {(game.stat as NflYardagePassingStatBlock).passingTds} / {(game.stat as NflYardagePassingStatBlock).interceptions}
                  </td>
                )}
                {market === "rushing" && (
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushAttempts}</td>
                )}
                {market === "rushing" && (
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushTds}</td>
                )}
                {market === "receiving" && (
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">
                    {(game.stat as NflYardageReceivingStatBlock).targets} / {(game.stat as NflYardageReceivingStatBlock).receptions}
                  </td>
                )}
                {market === "receiving" && (
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).recTds}</td>
                )}
                <td className="px-2 py-1.5"><NflYardageGameScoreCell score={game.gameScore} /></td>
                <td className="px-2 py-1.5"><NflYardageVegasLineCell line={game.vegasLine} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
