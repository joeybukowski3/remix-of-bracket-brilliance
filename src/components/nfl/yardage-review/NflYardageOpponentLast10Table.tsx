/**
 * Opponent (current defense) Last-10 history table for the Yardage Props
 * Review detail panel. Market/position-specific column set, leakage-safe
 * historical fields sourced entirely from `yardage-history.json`. Column
 * configuration only; the shared `NflHistoryTable` (also used by the DFS
 * Calculator) owns the actual table shell/rendering.
 *
 * No Fantasy Pts Allowed column: see NflYardagePlayerLast10Table.tsx --
 * `game.stat` is a single-market slice, never a full box score, so a
 * per-game DK total from it would misrepresent a partial score as full.
 */
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { NflYardageOpponentHistory, NflYardageOpponentHistoryGame, NflYardagePassingStatBlock, NflYardageRushingStatBlock, NflYardageReceivingStatBlock } from "@/lib/nfl/props/types/yardageHistory";
import {
  buildOpponentLast10Summary,
  buildOpponentLast10FooterAverages,
  computeVsAverageDiff,
  formatOpposingOffenseContext,
  formatSignedDiff,
} from "@/lib/nfl/props/review/yardageHistoryView";
import { historicalOffRankHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import { NflHistoryTable, type NflHistoryColumn, type NflHistoryMobileColumn } from "@/components/nfl/history/NflHistoryTable";
import {
  NflYardageActualYardsCell,
  NflYardageGameScoreCell,
  NflYardageHomeAwayPill,
  NflYardageLast10SummaryStrip,
  NflYardageRankCell,
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

function rowKey(game: NflYardageOpponentHistoryGame): string {
  return `${game.gameId ?? `${game.season}-${game.week}`}-${game.opponentPlayerId}`;
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

  const mobileColumns: NflHistoryMobileColumn<NflYardageOpponentHistoryGame>[] = [
    { key: "date", header: "Date", width: "w-[17%]", render: (game) => fmtDate(game.dateUtc) },
    {
      key: "opp",
      header: "Opp",
      width: "w-[24%]",
      render: (game) => (
        <>
          <span className="block truncate" title={game.opponentPlayerName}>{game.opponentPlayerName}</span>
          {formatOpposingOffenseContext(game.homeAway, opponentAbbr) && (
            <span className="block text-[8px] font-medium text-slate-400">{formatOpposingOffenseContext(game.homeAway, opponentAbbr)}</span>
          )}
        </>
      ),
    },
    { key: "volume", header: MARKET_MOBILE_VOLUME_LABEL[market], width: "w-[16%]", align: "center", render: (game) => mobileVolumeCell(market, game.stat) },
    { key: "yds", header: "Yds", width: "w-[16%]", align: "center", render: (game) => <NflYardageActualYardsCell actualYards={game.yardsAllowed} currentLine={currentLine} /> },
    { key: "score", header: MARKET_MOBILE_SCORE_LABEL[market], width: "w-[13%]", align: "center", render: (game) => mobileScoreCell(market, game.stat) },
    { key: "rank", header: "Rk", width: "w-[14%]", align: "center", render: (game) => <NflYardageRankCell rank={game.oppOffRank} heatTone={historicalOffRankHeatTone(game.oppOffRank, game.oppOffRankPoolSize)} /> },
  ];

  const columns: NflHistoryColumn<NflYardageOpponentHistoryGame>[] = [
    { key: "date", header: "Date", render: (game) => <span className="tabular-nums text-slate-600">{fmtDate(game.dateUtc)}</span> },
    {
      key: "opponent",
      header: OPPONENT_PLAYER_LABEL[market],
      render: (game) => (
        <>
          <span className="block">{game.opponentPlayerName}</span>
          {formatOpposingOffenseContext(game.homeAway, opponentAbbr) && (
            <span className="block text-[9px] font-medium text-slate-400">{formatOpposingOffenseContext(game.homeAway, opponentAbbr)}</span>
          )}
        </>
      ),
    },
    { key: "homeAway", header: "Home/Away", render: (game) => <NflYardageHomeAwayPill homeAway={game.homeAway} /> },
    {
      key: "oppOffRank",
      header: "Opp Off Rank",
      render: (game) => <NflYardageRankCell rank={game.oppOffRank} heatTone={historicalOffRankHeatTone(game.oppOffRank, game.oppOffRankPoolSize)} />,
      footer: <span className="tabular-nums">{fmtAvgRank(footer.oppOffRankAvg)}</span>,
    },
    {
      key: "oppPlayerYpg",
      header: MARKET_YPG_LABEL[market],
      className: "border-l-2 border-slate-200 bg-slate-50/70 tabular-nums text-slate-700",
      render: (game) => fmt1(game.oppPlayerYpg),
      footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.oppPlayerYpgAvg)}</span>,
    },
    {
      key: "yardsAllowed",
      header: MARKET_ALLOWED_LABEL[market],
      className: "bg-slate-50/70",
      render: (game) => <NflYardageActualYardsCell actualYards={game.yardsAllowed} currentLine={currentLine} />,
      footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.yardsAllowedAvg)}</span>,
    },
    {
      key: "vsPlayerAvg",
      header: MARKET_VS_AVG_LABEL[market],
      className: "border-r-2 border-slate-200 bg-slate-50/70",
      render: (game) => <NflYardageVsAverageCell diff={computeVsAverageDiff(game.yardsAllowed, game.oppPlayerYpg)} />,
      footer: <span className="tabular-nums bg-slate-100">{formatSignedDiff(footer.vsPlayerAvgAvg)}</span>,
    },
    ...(market === "passing"
      ? ([
          {
            key: "cmpAttAllowed",
            header: "Cmp / Att Allowed",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).completions} / {(game.stat as NflYardagePassingStatBlock).attempts}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.completions)} / Avg {fmt1(footer.statAverages.attempts)}</span>,
          },
          {
            key: "tdIntAllowed",
            header: "TD / INT",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).passingTds} / {(game.stat as NflYardagePassingStatBlock).interceptions}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.passingTds)} / Avg {fmt1(footer.statAverages.interceptions)}</span>,
          },
        ] satisfies NflHistoryColumn<NflYardageOpponentHistoryGame>[])
      : []),
    ...(market === "rushing"
      ? ([
          {
            key: "rushAttAllowed",
            header: "Rush Att Allowed",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushAttempts}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushAttempts)}</span>,
          },
          {
            key: "rushTdAllowed",
            header: "Rush TD Allowed",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushTds}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushTds)}</span>,
          },
        ] satisfies NflHistoryColumn<NflYardageOpponentHistoryGame>[])
      : []),
    ...(market === "receiving"
      ? ([
          {
            key: "targetsRecAllowed",
            header: "Targets / Rec Allowed",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).targets} / {(game.stat as NflYardageReceivingStatBlock).receptions}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.targets)} / Avg {fmt1(footer.statAverages.receptions)}</span>,
          },
          {
            key: "recTdAllowed",
            header: "Rec TD Allowed",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).recTds}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.recTds)}</span>,
          },
        ] satisfies NflHistoryColumn<NflYardageOpponentHistoryGame>[])
      : []),
    { key: "gameScore", header: "Game Score", render: (game) => <NflYardageGameScoreCell score={game.gameScore} />, footer: <>—</> },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
        {opponentAbbr.toUpperCase()} Defense — Last {history.games.length} vs {position}
      </h4>
      <NflYardageLast10SummaryStrip summary={summary} allowedLabel />
      <NflHistoryTable
        rows={history.games}
        rowKey={rowKey}
        columns={columns}
        mobileColumns={mobileColumns}
        footerLabel="Last 10 Avg"
        footerLabelColSpan={3}
        minWidthClassName="min-w-[860px]"
        scrollLabel={`${opponentAbbr.toUpperCase()} defense last ${history.games.length} vs ${position}`}
      />
    </div>
  );
}
