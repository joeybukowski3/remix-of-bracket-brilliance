/**
 * Player Last-10 history table for the Yardage Props Review detail panel.
 * Market-specific column set (passing/rushing/receiving), leakage-safe
 * historical fields sourced entirely from `yardage-history.json` -- see
 * `scripts/generate-nfl-yardage-history.mjs` for provenance. Pure
 * presentation/column-configuration; the actual table shell/rendering comes
 * from the shared `NflHistoryTable` (also used by the DFS Calculator).
 *
 * No Fantasy Pts column: `game.stat` only carries the tracked market's own
 * stat block (e.g. a WR's game here has no rushing block even if he had one
 * carry that day), so any per-game DK total computed from it would be a
 * partial score misrepresented as a full one -- see nflClassicScoring.ts.
 */
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { NflYardagePlayerHistory, NflYardagePlayerHistoryGame, NflYardagePassingStatBlock, NflYardageRushingStatBlock, NflYardageReceivingStatBlock } from "@/lib/nfl/props/types/yardageHistory";
import {
  buildPlayerLast10Summary,
  buildPlayerLast10FooterAverages,
  computeVsAverageDiff,
  formatOpponentDisplay,
  formatSignedDiff,
} from "@/lib/nfl/props/review/yardageHistoryView";
import { historicalDefRankHeatTone } from "@/lib/nfl/props/review/yardageHeat";
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

const MARKET_YARDS_LABEL: Record<NflProjectionMarket, string> = { passing: "Pass Yds", rushing: "Rush Yds", receiving: "Rec Yds" };
/** Compact-column header for the mobile volume field -- "Cmp/Att", "Att", "Tgt/Rec". */
const MARKET_MOBILE_VOLUME_LABEL: Record<NflProjectionMarket, string> = { passing: "Cmp/Att", rushing: "Att", receiving: "Tgt/Rec" };
/** Compact-column header for the mobile score field -- "TD/INT" for passing, "TD" otherwise. */
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

function rowKey(game: NflYardagePlayerHistoryGame): string {
  return game.gameId ?? `${game.season}-${game.week}`;
}

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

  const mobileColumns: NflHistoryMobileColumn<NflYardagePlayerHistoryGame>[] = [
    { key: "date", header: "Date", width: "w-[17%]", render: (game) => fmtDate(game.dateUtc) },
    { key: "opp", header: "Opp", width: "w-[19%]", render: (game) => formatOpponentDisplay(game.opponentAbbr, game.homeAway) },
    { key: "volume", header: MARKET_MOBILE_VOLUME_LABEL[market], width: "w-[17%]", align: "center", render: (game) => mobileVolumeCell(market, game.stat) },
    { key: "yds", header: "Yds", width: "w-[16%]", align: "center", render: (game) => <NflYardageActualYardsCell actualYards={game.actualYards} currentLine={currentLine} /> },
    { key: "score", header: MARKET_MOBILE_SCORE_LABEL[market], width: "w-[15%]", align: "center", render: (game) => mobileScoreCell(market, game.stat) },
    { key: "rank", header: "Rk", width: "w-[16%]", align: "center", render: (game) => <NflYardageRankCell rank={game.oppDefRank} heatTone={historicalDefRankHeatTone(game.oppDefRank, game.oppDefRankPoolSize)} /> },
  ];

  const columns: NflHistoryColumn<NflYardagePlayerHistoryGame>[] = [
    { key: "date", header: "Date", render: (game) => <span className="tabular-nums text-slate-600">{fmtDate(game.dateUtc)}</span> },
    {
      key: "opponent",
      header: "Opponent",
      render: (game) => (
        <>
          <span className="mr-1.5">{formatOpponentDisplay(game.opponentAbbr, game.homeAway)}</span>
          <NflYardageHomeAwayPill homeAway={game.homeAway} />
        </>
      ),
    },
    {
      key: "oppDefRank",
      header: "Opp Def Rank",
      render: (game) => <NflYardageRankCell rank={game.oppDefRank} heatTone={historicalDefRankHeatTone(game.oppDefRank, game.oppDefRankPoolSize)} />,
      footer: <span className="tabular-nums">{fmtAvgRank(footer.oppDefRankAvg)}</span>,
    },
    {
      key: "oppYdsAllowAvg",
      header: "Opp Yds Allow Avg",
      className: "border-l-2 border-slate-200 bg-slate-50/70 tabular-nums text-slate-700",
      render: (game) => fmt1(game.oppYdsAllowAvg),
      footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.oppYdsAllowAvgAvg)}</span>,
    },
    {
      key: "yards",
      header: MARKET_YARDS_LABEL[market],
      className: "bg-slate-50/70",
      render: (game) => <NflYardageActualYardsCell actualYards={game.actualYards} currentLine={currentLine} />,
      footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.actualYardsAvg)}</span>,
    },
    {
      key: "vsOppAvg",
      header: "VS OPP AVG",
      className: "border-r-2 border-slate-200 bg-slate-50/70",
      render: (game) => <NflYardageVsAverageCell diff={computeVsAverageDiff(game.actualYards, game.oppYdsAllowAvg)} />,
      footer: <span className="tabular-nums bg-slate-100">{formatSignedDiff(footer.vsOppAvgAvg)}</span>,
    },
    ...(market === "passing"
      ? ([
          {
            key: "cmpAtt",
            header: "Cmp / Att",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).completions} / {(game.stat as NflYardagePassingStatBlock).attempts}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.completions)} / Avg {fmt1(footer.statAverages.attempts)}</span>,
          },
          {
            key: "tdInt",
            header: "TD / INT",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).passingTds} / {(game.stat as NflYardagePassingStatBlock).interceptions}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.passingTds)} / Avg {fmt1(footer.statAverages.interceptions)}</span>,
          },
        ] satisfies NflHistoryColumn<NflYardagePlayerHistoryGame>[])
      : []),
    ...(market === "rushing"
      ? ([
          {
            key: "rushAtt",
            header: "Rush Att",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushAttempts}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushAttempts)}</span>,
          },
          {
            key: "rushTd",
            header: "Rush TD",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushTds}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushTds)}</span>,
          },
        ] satisfies NflHistoryColumn<NflYardagePlayerHistoryGame>[])
      : []),
    ...(market === "receiving"
      ? ([
          {
            key: "targetsRec",
            header: "Targets / Rec",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).targets} / {(game.stat as NflYardageReceivingStatBlock).receptions}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.targets)} / Avg {fmt1(footer.statAverages.receptions)}</span>,
          },
          {
            key: "recTd",
            header: "Rec TD",
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).recTds}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.recTds)}</span>,
          },
        ] satisfies NflHistoryColumn<NflYardagePlayerHistoryGame>[])
      : []),
    { key: "gameScore", header: "Game Score", render: (game) => <NflYardageGameScoreCell score={game.gameScore} />, footer: <>—</> },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
        {playerName} — Last {history.games.length} Games
      </h4>
      <NflYardageLast10SummaryStrip summary={summary} />
      <NflHistoryTable
        rows={history.games}
        rowKey={rowKey}
        columns={columns}
        mobileColumns={mobileColumns}
        footerLabel="Last 10 Avg"
        footerLabelColSpan={2}
        scrollLabel={`${playerName} last ${history.games.length} games`}
      />
    </div>
  );
}
