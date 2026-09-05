/**
 * Opponent (current defense) Last-10 history table for the Yardage Props
 * Review detail panel. Market/position-specific column set, leakage-safe
 * historical fields sourced entirely from `yardage-history.json`. Pure
 * presentation; no computation happens in this component.
 */
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { NflYardageOpponentHistory, NflYardagePassingStatBlock, NflYardageRushingStatBlock, NflYardageReceivingStatBlock } from "@/lib/nfl/props/types/yardageHistory";
import {
  buildOpponentLast10Summary,
  buildOpponentLast10FooterAverages,
  computeVsAverageDiff,
  formatOpposingOffenseContext,
  formatSignedDiff,
} from "@/lib/nfl/props/review/yardageHistoryView";
import { historicalOffRankHeatTone } from "@/lib/nfl/props/review/yardageHeat";
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

const MARKET_ALLOWED_LABEL: Record<NflProjectionMarket, string> = {
  passing: "Pass Yds Allowed",
  rushing: "Rush Yds Allowed",
  receiving: "Rec Yds Allowed",
};
const MARKET_YPG_LABEL: Record<NflProjectionMarket, string> = { passing: "QB YPG", rushing: "RB YPG", receiving: "YPG" };
const MARKET_VS_AVG_LABEL: Record<NflProjectionMarket, string> = { passing: "VS QB AVG", rushing: "VS RB AVG", receiving: "VS PLAYER AVG" };
const OPPONENT_PLAYER_LABEL: Record<NflProjectionMarket, string> = { passing: "Opp QB", rushing: "Opp Player / Team", receiving: "Opp Player" };
/** Compact-column header for the mobile result field -- "Cmp/Att", "Att", "Tgt/Rec". */
const MARKET_MOBILE_VOLUME_LABEL: Record<NflProjectionMarket, string> = { passing: "Cmp/Att", rushing: "Att", receiving: "Tgt/Rec" };
/** Compact-column header for the mobile score field -- "TD/INT" for passing (both live in one field), "TD" otherwise. */
const MARKET_MOBILE_SCORE_LABEL: Record<NflProjectionMarket, string> = { passing: "TD/INT", rushing: "TD", receiving: "TD" };

function mobileVolumeCell(market: NflProjectionMarket, stat: NflYardagePassingStatBlock | NflYardageRushingStatBlock | NflYardageReceivingStatBlock): string {
  if (market === "passing") {
    const s = stat as NflYardagePassingStatBlock;
    return `${s.completions}/${s.attempts}`;
  }
  if (market === "rushing") return String((stat as NflYardageRushingStatBlock).rushAttempts);
  const s = stat as NflYardageReceivingStatBlock;
  return `${s.targets}/${s.receptions}`;
}

function mobileScoreCell(market: NflProjectionMarket, stat: NflYardagePassingStatBlock | NflYardageRushingStatBlock | NflYardageReceivingStatBlock): string {
  if (market === "passing") {
    const s = stat as NflYardagePassingStatBlock;
    return `${s.passingTds}/${s.interceptions}`;
  }
  if (market === "rushing") return String((stat as NflYardageRushingStatBlock).rushTds);
  return String((stat as NflYardageReceivingStatBlock).recTds);
}

export default function NflYardageOpponentLast10Table({
  opponentAbbr,
  position,
  history,
  currentLine,
}: {
  opponentAbbr: string;
  position: string;
  history: NflYardageOpponentHistory | null;
  currentLine: number | null;
}) {
  if (!history || history.games.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-[11px] text-slate-400">
        No leakage-safe Last-10 defensive history available for {opponentAbbr.toUpperCase()} vs {position} yet.
      </div>
    );
  }

  const summary = buildOpponentLast10Summary(history.games, currentLine);
  const footer = buildOpponentLast10FooterAverages(history.games);
  const market = history.market;

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
        {opponentAbbr.toUpperCase()} Defense — Last {history.games.length} vs {position}
      </h4>
      <NflYardageLast10SummaryStrip summary={summary} allowedLabel />

      {/* Compact mobile-width table -- Date / Opp / volume / Yards Allowed vs line / TD(-INT) / Opp Off Rank, no horizontal scroll (table-fixed keeps all 6 columns within a ~360px viewport). */}
      <div className="overflow-hidden rounded-md border-2 border-slate-300 md:hidden">
        <table className="w-full table-fixed border-collapse text-[10px]">
          <colgroup>
            <col className="w-[17%]" />
            <col className="w-[24%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-200/70 text-left text-[8px] font-bold uppercase tracking-wide text-slate-600">
              <th className="px-1 py-1.5">Date</th>
              <th className="px-1 py-1.5">Opp</th>
              <th className="px-1 py-1.5 text-center">{MARKET_MOBILE_VOLUME_LABEL[market]}</th>
              <th className="px-1 py-1.5 text-center">Yds</th>
              <th className="px-1 py-1.5 text-center">{MARKET_MOBILE_SCORE_LABEL[market]}</th>
              <th className="px-1 py-1.5 text-center">Rk</th>
            </tr>
          </thead>
          <tbody>
            {history.games.map((game) => (
              <tr key={`m-${game.gameId ?? `${game.season}-${game.week}`}-${game.opponentPlayerId}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-1 py-1.5 tabular-nums text-slate-600">{fmtDate(game.dateUtc)}</td>
                <td className="px-1 py-1.5 text-slate-800">
                  <span className="block truncate" title={game.opponentPlayerName}>{game.opponentPlayerName}</span>
                  {/* Where THAT offense played against this defense -- derived from the defense's own canonical homeAway field, never a display-string guess. */}
                  {formatOpposingOffenseContext(game.homeAway, opponentAbbr) && (
                    <span className="block text-[8px] font-medium text-slate-400">{formatOpposingOffenseContext(game.homeAway, opponentAbbr)}</span>
                  )}
                </td>
                <td className="px-1 py-1.5 text-center tabular-nums text-slate-700">{mobileVolumeCell(market, game.stat)}</td>
                <td className="px-1 py-1.5 text-center"><NflYardageActualYardsCell actualYards={game.yardsAllowed} currentLine={currentLine} /></td>
                <td className="px-1 py-1.5 text-center tabular-nums text-slate-700">{mobileScoreCell(market, game.stat)}</td>
                <td className="px-1 py-1.5 text-center">
                  <NflYardageRankCell rank={game.oppOffRank} heatTone={historicalOffRankHeatTone(game.oppOffRank, game.oppOffRankPoolSize)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DenseTableScroller
        label={`${opponentAbbr.toUpperCase()} defense last ${history.games.length} vs ${position}`}
        className="hidden rounded-md border-2 border-slate-300 md:block"
      >
        <table className="w-full min-w-[860px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-200/70 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
              <th className="px-2 py-1.5">Date</th>
              <th className="px-2 py-1.5">{OPPONENT_PLAYER_LABEL[market]}</th>
              <th className="px-2 py-1.5">Home/Away</th>
              <th className="px-2 py-1.5">Opp Off Rank</th>
              <th className="px-2 py-1.5 rounded-l border-l-2 border-y-2 border-slate-300 bg-slate-100/80">{MARKET_YPG_LABEL[market]}</th>
              <th className="px-2 py-1.5 border-y-2 border-slate-300 bg-slate-100/80">{MARKET_ALLOWED_LABEL[market]}</th>
              <th className="px-2 py-1.5 rounded-r border-r-2 border-y-2 border-slate-300 bg-slate-100/80">{MARKET_VS_AVG_LABEL[market]}</th>
              {market === "passing" && <th className="px-2 py-1.5">Cmp / Att Allowed</th>}
              {market === "passing" && <th className="px-2 py-1.5">TD / INT</th>}
              {market === "rushing" && <th className="px-2 py-1.5">Rush Att Allowed</th>}
              {market === "rushing" && <th className="px-2 py-1.5">Rush TD Allowed</th>}
              {market === "receiving" && <th className="px-2 py-1.5">Targets / Rec Allowed</th>}
              {market === "receiving" && <th className="px-2 py-1.5">Rec TD Allowed</th>}
              <th className="px-2 py-1.5">Game Score</th>
              <th className="px-2 py-1.5">Vegas Line</th>
            </tr>
          </thead>
          <tbody>
            {history.games.map((game) => {
              const vsPlayerAvg = computeVsAverageDiff(game.yardsAllowed, game.oppPlayerYpg);
              return (
                <tr key={`${game.gameId ?? `${game.season}-${game.week}`}-${game.opponentPlayerId}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-2 py-1.5 tabular-nums text-slate-600">{fmtDate(game.dateUtc)}</td>
                  <td className="px-2 py-1.5 text-slate-800">
                    <span className="block">{game.opponentPlayerName}</span>
                    {/* Where THAT offense played against this defense -- derived from the defense's own canonical homeAway field, never a display-string guess. */}
                    {formatOpposingOffenseContext(game.homeAway, opponentAbbr) && (
                      <span className="block text-[9px] font-medium text-slate-400">{formatOpposingOffenseContext(game.homeAway, opponentAbbr)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5"><NflYardageHomeAwayPill homeAway={game.homeAway} /></td>
                  <td className="px-2 py-1.5">
                    <NflYardageRankCell rank={game.oppOffRank} heatTone={historicalOffRankHeatTone(game.oppOffRank, game.oppOffRankPoolSize)} />
                  </td>
                  <td className="px-2 py-1.5 border-l-2 border-slate-200 bg-slate-50/70 tabular-nums text-slate-700">{fmt1(game.oppPlayerYpg)}</td>
                  <td className="px-2 py-1.5 bg-slate-50/70"><NflYardageActualYardsCell actualYards={game.yardsAllowed} currentLine={currentLine} /></td>
                  <td className="px-2 py-1.5 border-r-2 border-slate-200 bg-slate-50/70"><NflYardageVsAverageCell diff={vsPlayerAvg} /></td>
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
              <td className="px-2 py-1.5 uppercase tracking-wide text-[10px]" colSpan={3}>Last 10 Avg</td>
              <td className="px-2 py-1.5 tabular-nums">{fmtAvgRank(footer.oppOffRankAvg)}</td>
              <td className="px-2 py-1.5 border-l-2 border-slate-300 bg-slate-100 tabular-nums">{fmt1(footer.oppPlayerYpgAvg)}</td>
              <td className="px-2 py-1.5 bg-slate-100 tabular-nums">{fmt1(footer.yardsAllowedAvg)}</td>
              <td className="px-2 py-1.5 border-r-2 border-slate-300 bg-slate-100 tabular-nums">{formatSignedDiff(footer.vsPlayerAvgAvg)}</td>
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
