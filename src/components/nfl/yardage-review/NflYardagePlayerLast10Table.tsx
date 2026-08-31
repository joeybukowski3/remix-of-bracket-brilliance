/**
 * Player Last-10 history table for the Yardage Props Review detail panel.
 * Market-specific column set (passing/rushing/receiving), leakage-safe
 * historical fields sourced entirely from `yardage-history.json` -- see
 * `scripts/generate-nfl-yardage-history.mjs` for provenance. Pure
 * presentation; no computation happens in this component.
 */
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { NflYardagePlayerHistory, NflYardagePassingStatBlock, NflYardageRushingStatBlock, NflYardageReceivingStatBlock } from "@/lib/nfl/props/types/yardageHistory";
import {
  buildPlayerLast10Summary,
  buildPlayerLast10FooterAverages,
  computeVsAverageDiff,
  formatOpponentDisplay,
  formatSignedDiff,
} from "@/lib/nfl/props/review/yardageHistoryView";
import { historicalDefRankHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import { DenseTableScroller } from "@/components/ui/dense-table";
import {
  NflYardageActualYardsCell,
  NflYardageGameScoreCell,
  NflYardageHomeAwayPill,
  NflYardageLast10SummaryStrip,
  NflYardageRankCell,
  NflYardageVegasLineCell,
  NflYardageVsAverageCell,
} from "./NflYardageHistoryCells";

function fmtDate(dateUtc: string | null): string {
  if (!dateUtc) return "N/A";
  return new Date(dateUtc).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmt1(value: number | null): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}
function fmtAvgRank(value: number | null): string {
  return value != null && Number.isFinite(value) ? `${value.toFixed(1)} avg` : "N/A";
}
function fmtVegasAvg(value: number | null): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "—";
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
  const footer = buildPlayerLast10FooterAverages(history.games);
  const market = history.market;

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
        {playerName} — Last {history.games.length} Games
      </h4>
      <NflYardageLast10SummaryStrip summary={summary} />
      <DenseTableScroller
        label={`${playerName} last ${history.games.length} games`}
        className="rounded-md border-2 border-slate-300"
      >
        <table className="w-full min-w-[820px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-200/70 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
              <th className="px-2 py-1.5">Date</th>
              <th className="px-2 py-1.5">Opponent</th>
              <th className="px-2 py-1.5">Opp Def Rank</th>
              <th className="px-2 py-1.5 rounded-l border-l-2 border-y-2 border-slate-300 bg-slate-100/80">Opp Yds Allow Avg</th>
              <th className="px-2 py-1.5 border-y-2 border-slate-300 bg-slate-100/80">{MARKET_YARDS_LABEL[market]}</th>
              <th className="px-2 py-1.5 rounded-r border-r-2 border-y-2 border-slate-300 bg-slate-100/80">VS OPP AVG</th>
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
            {history.games.map((game) => {
              const vsOppAvg = computeVsAverageDiff(game.actualYards, game.oppYdsAllowAvg);
              return (
                <tr key={`${game.gameId ?? `${game.season}-${game.week}`}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-2 py-1.5 tabular-nums text-slate-600">{fmtDate(game.dateUtc)}</td>
                  <td className="px-2 py-1.5">
                    <span className="mr-1.5">{formatOpponentDisplay(game.opponentAbbr, game.homeAway)}</span>
                    <NflYardageHomeAwayPill homeAway={game.homeAway} />
                  </td>
                  <td className="px-2 py-1.5">
                    <NflYardageRankCell rank={game.oppDefRank} heatTone={historicalDefRankHeatTone(game.oppDefRank, game.oppDefRankPoolSize)} />
                  </td>
                  <td className="px-2 py-1.5 border-l-2 border-slate-200 bg-slate-50/70 tabular-nums text-slate-700">{fmt1(game.oppYdsAllowAvg)}</td>
                  <td className="px-2 py-1.5 bg-slate-50/70"><NflYardageActualYardsCell actualYards={game.actualYards} currentLine={currentLine} /></td>
                  <td className="px-2 py-1.5 border-r-2 border-slate-200 bg-slate-50/70"><NflYardageVsAverageCell diff={vsOppAvg} /></td>
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
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-400 bg-slate-200/60 font-bold text-slate-700">
              <td className="px-2 py-1.5 uppercase tracking-wide text-[10px]" colSpan={2}>Last 10 Avg</td>
              <td className="px-2 py-1.5 tabular-nums">{fmtAvgRank(footer.oppDefRankAvg)}</td>
              <td className="px-2 py-1.5 border-l-2 border-slate-300 bg-slate-100 tabular-nums">{fmt1(footer.oppYdsAllowAvgAvg)}</td>
              <td className="px-2 py-1.5 bg-slate-100 tabular-nums">{fmt1(footer.actualYardsAvg)}</td>
              <td className="px-2 py-1.5 border-r-2 border-slate-300 bg-slate-100 tabular-nums">{formatSignedDiff(footer.vsOppAvgAvg)}</td>
              {market === "passing" && (
                <td className="px-2 py-1.5 tabular-nums">
                  Avg {fmt1(footer.statAverages.completions)} / Avg {fmt1(footer.statAverages.attempts)}
                </td>
              )}
              {market === "passing" && (
                <td className="px-2 py-1.5 tabular-nums">
                  Avg {fmt1(footer.statAverages.passingTds)} / Avg {fmt1(footer.statAverages.interceptions)}
                </td>
              )}
              {market === "rushing" && <td className="px-2 py-1.5 tabular-nums">{fmt1(footer.statAverages.rushAttempts)}</td>}
              {market === "rushing" && <td className="px-2 py-1.5 tabular-nums">{fmt1(footer.statAverages.rushTds)}</td>}
              {market === "receiving" && (
                <td className="px-2 py-1.5 tabular-nums">
                  Avg {fmt1(footer.statAverages.targets)} / Avg {fmt1(footer.statAverages.receptions)}
                </td>
              )}
              {market === "receiving" && <td className="px-2 py-1.5 tabular-nums">{fmt1(footer.statAverages.recTds)}</td>}
              <td className="px-2 py-1.5">—</td>
              <td className="px-2 py-1.5 tabular-nums">{fmtVegasAvg(footer.vegasLineAvg)}</td>
            </tr>
          </tfoot>
        </table>
      </DenseTableScroller>
    </div>
  );
}
