/**
 * Player Last-10 history table for the Yardage Props Review detail panel.
 * Market-specific column set (passing/rushing/receiving), leakage-safe
 * historical fields sourced entirely from `yardage-history.json` -- see
 * `scripts/generate-nfl-yardage-history.mjs` for provenance. Pure
 * presentation/column-configuration; the actual table shell/rendering comes
 * from the shared `NflHistoryTable` (also used by the DFS Calculator), so
 * this component never hand-rolls table markup of its own.
 *
 * No Fantasy Pts column: `game.stat` only carries the tracked market's own
 * stat block (e.g. a WR's game here has no rushing block even if he had one
 * carry that day), so any per-game DK total computed from it would be a
 * partial score misrepresented as a full one -- see nflClassicScoring.ts.
 *
 * No Vegas Line column: it was intentionally removed from the universal
 * Yardage Last-10 presentation. The DFS Calculator's own history keeps its
 * archived-line / O-U columns as an explicit DFS-specific exception.
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
import { historicalDefRankHeatTone, opponentDefenseRankHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import { NflHistoryTable, type NflHistoryColumn, type NflHistoryMobileColumn } from "@/components/nfl/history/NflHistoryTable";
import {
  NflYardageActualYardsCell,
  NflYardageGameScoreCell,
  NflYardageHomeAwayPill,
  NflYardageLast10SummaryStrip,
  NflYardageRankCell,
  NflYardageVsAverageCell,
} from "./NflYardageHistoryCells";

/** `compact` (the side-by-side desktop comparison) drops the year -- "Sep 8" -- to save column width; the full single-table view keeps "Sep 8, 2025". */
function fmtDate(dateUtc: string | null, compact: boolean): string {
  if (!dateUtc) return "N/A";
  return new Date(dateUtc).toLocaleDateString(undefined, compact ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
function fmt1(value: number | null): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}
function fmtAvgRank(value: number | null): string {
  return value != null && Number.isFinite(value) ? `${value.toFixed(1)} avg` : "N/A";
}

/**
 * This week's upcoming matchup, rendered as a reference row above the
 * historical games -- never a played game. `opponentDefRank` is the
 * opponent's pregame trailing-10-game EPA/play defense rank
 * (`yardage-history.json`'s `currentWeekEpaRanks`, built by
 * `buildPregameRollingEpaAt` in `nfl-epa-week-rank-core.mjs`) -- the EXACT
 * SAME rank definition as `oppDefRank` on the historical games below, just
 * evaluated at this week's cutoff instead of a played game. Deliberately
 * NOT `opponentContext.epaEdge.defenseRank` (an 8-game blend from the
 * frozen Season/Last-5 matchup-epa.json artifact) -- that would not be
 * apples-to-apples with the historical column.
 */
export type NflYardagePlayerCurrentMatchup = {
  opponentAbbr: string;
  homeAway: "home" | "away";
  opponentDefRank: number | null;
};

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
  currentMatchup,
  compact = false,
}: {
  playerName: string;
  history: NflYardagePlayerHistory | null;
  currentLine: number | null;
  /** This week's reference row -- omitted (not blanked) when no current-matchup context is available. */
  currentMatchup?: NflYardagePlayerCurrentMatchup | null;
  /** Tighter padding/headers/date format for the side-by-side desktop comparison, so the two tables fit without each forcing its own horizontal scroll. Mobile presentation is unaffected. */
  compact?: boolean;
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
  const label = {
    date: "Date",
    thisWeek: compact ? "Wk" : "This Week",
    opponent: "Opponent",
    defRank: compact ? "Def Rank" : "Opp Def Rank",
    ydsAllow: compact ? "Yds Allow" : "Opp Yds Allow Avg",
    vsAvg: compact ? "VS AVG" : "VS OPP AVG",
    cmpAtt: compact ? "Cmp/Att" : "Cmp / Att",
    tdInt: compact ? "TD/INT" : "TD / INT",
    tgtRec: compact ? "Tgt/Rec" : "Targets / Rec",
    score: compact ? "Score" : "Game Score",
  };

  const prefixDash = () => <span className="text-slate-400">—</span>;

  const mobileColumns: NflHistoryMobileColumn<NflYardagePlayerHistoryGame>[] = [
    {
      key: "date",
      header: "Date",
      width: "w-[17%]",
      render: (game) => fmtDate(game.dateUtc, false),
      prefixRender: currentMatchup ? () => <span className="font-semibold uppercase tracking-wide text-sky-700">This Wk</span> : undefined,
    },
    {
      key: "opp",
      header: "Opp",
      width: "w-[19%]",
      render: (game) => formatOpponentDisplay(game.opponentAbbr, game.homeAway),
      prefixRender: currentMatchup ? () => formatOpponentDisplay(currentMatchup.opponentAbbr, currentMatchup.homeAway) : undefined,
    },
    { key: "volume", header: MARKET_MOBILE_VOLUME_LABEL[market], width: "w-[17%]", align: "center", render: (game) => mobileVolumeCell(market, game.stat), prefixRender: currentMatchup ? prefixDash : undefined },
    { key: "yds", header: "Yds", width: "w-[16%]", align: "center", render: (game) => <NflYardageActualYardsCell actualYards={game.actualYards} currentLine={currentLine} />, prefixRender: currentMatchup ? prefixDash : undefined },
    { key: "score", header: MARKET_MOBILE_SCORE_LABEL[market], width: "w-[15%]", align: "center", render: (game) => mobileScoreCell(market, game.stat), prefixRender: currentMatchup ? prefixDash : undefined },
    {
      key: "rank",
      header: "Rk",
      width: "w-[16%]",
      align: "center",
      render: (game) => <NflYardageRankCell rank={game.oppDefRank} heatTone={historicalDefRankHeatTone(game.oppDefRank, game.oppDefRankPoolSize)} />,
      prefixRender: currentMatchup ? () => <NflYardageRankCell rank={currentMatchup.opponentDefRank} heatTone={opponentDefenseRankHeatTone(currentMatchup.opponentDefRank)} /> : undefined,
    },
  ];

  const statColumns: NflHistoryColumn<NflYardagePlayerHistoryGame>[] =
    market === "passing"
      ? [
          {
            key: "cmpAtt",
            header: label.cmpAtt,
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).completions} / {(game.stat as NflYardagePassingStatBlock).attempts}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.completions)} / Avg {fmt1(footer.statAverages.attempts)}</span>,
            prefixRender: currentMatchup ? prefixDash : undefined,
          },
          {
            key: "tdInt",
            header: label.tdInt,
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).passingTds} / {(game.stat as NflYardagePassingStatBlock).interceptions}</span>,
            footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.passingTds)} / Avg {fmt1(footer.statAverages.interceptions)}</span>,
            prefixRender: currentMatchup ? prefixDash : undefined,
          },
        ]
      : market === "rushing"
        ? [
            {
              key: "rushAtt",
              header: "Rush Att",
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushAttempts}</span>,
              footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushAttempts)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
            {
              key: "rushTd",
              header: "Rush TD",
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushTds}</span>,
              footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushTds)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
          ]
        : [
            {
              key: "targetsRec",
              header: label.tgtRec,
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).targets} / {(game.stat as NflYardageReceivingStatBlock).receptions}</span>,
              footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.targets)} / Avg {fmt1(footer.statAverages.receptions)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
            {
              key: "recTd",
              header: "Rec TD",
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).recTds}</span>,
              footer: <span className="tabular-nums">{fmt1(footer.statAverages.recTds)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
          ];

  const columns: NflHistoryColumn<NflYardagePlayerHistoryGame>[] = [
    {
      key: "date",
      header: label.date,
      render: (game) => <span className="tabular-nums text-slate-600">{fmtDate(game.dateUtc, compact)}</span>,
      prefixRender: currentMatchup ? () => <span className="font-semibold uppercase tracking-wide text-[10px] text-sky-700">{label.thisWeek}</span> : undefined,
    },
    {
      key: "opponent",
      header: label.opponent,
      render: (game) => (
        <>
          <span className="mr-1.5">{formatOpponentDisplay(game.opponentAbbr, game.homeAway)}</span>
          <NflYardageHomeAwayPill homeAway={game.homeAway} />
        </>
      ),
      prefixRender: currentMatchup
        ? () => (
            <>
              <span className="mr-1.5 text-slate-600">{formatOpponentDisplay(currentMatchup.opponentAbbr, currentMatchup.homeAway)}</span>
              <NflYardageHomeAwayPill homeAway={currentMatchup.homeAway} />
            </>
          )
        : undefined,
    },
    {
      key: "oppDefRank",
      header: label.defRank,
      render: (game) => <NflYardageRankCell rank={game.oppDefRank} heatTone={historicalDefRankHeatTone(game.oppDefRank, game.oppDefRankPoolSize)} />,
      footer: <span className="tabular-nums">{fmtAvgRank(footer.oppDefRankAvg)}</span>,
      prefixRender: currentMatchup
        ? () => <NflYardageRankCell rank={currentMatchup.opponentDefRank} heatTone={opponentDefenseRankHeatTone(currentMatchup.opponentDefRank)} />
        : undefined,
    },
    {
      key: "oppYdsAllowAvg",
      header: label.ydsAllow,
      className: "border-l-2 border-slate-200 bg-slate-50/70 tabular-nums text-slate-700",
      render: (game) => fmt1(game.oppYdsAllowAvg),
      footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.oppYdsAllowAvgAvg)}</span>,
      prefixRender: currentMatchup ? prefixDash : undefined,
    },
    {
      key: "yards",
      header: MARKET_YARDS_LABEL[market],
      className: "bg-slate-50/70",
      render: (game) => <NflYardageActualYardsCell actualYards={game.actualYards} currentLine={currentLine} />,
      footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.actualYardsAvg)}</span>,
      prefixRender: currentMatchup ? prefixDash : undefined,
    },
    {
      key: "vsOppAvg",
      header: label.vsAvg,
      className: "border-r-2 border-slate-200 bg-slate-50/70",
      render: (game) => <NflYardageVsAverageCell diff={computeVsAverageDiff(game.actualYards, game.oppYdsAllowAvg)} />,
      footer: <span className="tabular-nums bg-slate-100">{formatSignedDiff(footer.vsOppAvgAvg)}</span>,
      prefixRender: currentMatchup ? prefixDash : undefined,
    },
    ...statColumns,
    { key: "gameScore", header: label.score, render: (game) => <NflYardageGameScoreCell score={game.gameScore} />, footer: <>—</>, prefixRender: currentMatchup ? prefixDash : undefined },
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
        compact={compact}
        minWidthClassName={compact ? "min-w-[640px]" : "min-w-[820px]"}
        prefixRow={currentMatchup ? { className: "border-b-2 border-sky-200 bg-sky-50/60", mobileClassName: "border-b-2 border-sky-200 bg-sky-50/70" } : null}
        scrollLabel={`${playerName} last ${history.games.length} games`}
      />
    </div>
  );
}
