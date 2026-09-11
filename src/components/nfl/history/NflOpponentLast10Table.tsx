/**
 * Opponent (current defense) Last-10 history table for the Yardage Props
 * Review detail panel. Market/position-specific column set, leakage-safe
 * historical fields sourced entirely from `yardage-history.json`. Column
 * configuration only; the shared `NflHistoryTable` (also used by the DFS
 * Calculator) owns the actual table shell/rendering, so this component
 * never hand-rolls table markup of its own.
 *
 * Fantasy PPR Points (passing/QB only): the opposing QB's per-game nflverse
 * Full PPR value carried verbatim on the artifact (`game.fantasyPointsPpr`),
 * never recomputed from the single-market stat slice.
 *
 * No Vegas Line column: it was intentionally removed from the universal
 * Yardage Last-10 presentation (the DFS Calculator keeps its own
 * archived-line / O-U columns as an explicit DFS-specific exception).
 *
 * No Score (Game Score) column on the passing/QB layout: dropped to reclaim
 * horizontal width on these dense QB tables (`game.gameScore` stays on the
 * artifact). Rushing/receiving keep their original Game Score column.
 */
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { NflYardageOpponentHistory, NflYardageOpponentHistoryGame, NflYardagePassingStatBlock, NflYardageRushingStatBlock, NflYardageReceivingStatBlock } from "@/lib/nfl/props/types/yardageHistory";
import {
  buildOpponentLast10Summary,
  buildOpponentLast10FooterAverages,
  computeVsAverageDiff,
  formatSignedDiff,
  lookupOpponentGameTimeTeam,
} from "@/lib/nfl/props/review/yardageHistoryView";
import { historicalOffRankHeatTone, currentOffenseRankHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import { NflHistoryTable, type NflHistoryColumn, type NflHistoryMobileColumn } from "@/components/nfl/history/NflHistoryTable";
import { TeamLogo } from "./NflTeamLogo";
import {
  NflYardageActualYardsCell,
  NflYardageFantasyPointsCell,
  NflYardageGameScoreCell,
  NflYardageHomeAwayPill,
  NflYardageLast10SummaryStrip,
  NflYardageRankCell,
  NflYardageVsAverageCell,
} from "./NflLast10Cells";

/**
 * Opp Player cell: name plus the offensive player's own GAME-TIME team logo --
 * resolved from that specific historical game via `teamByGame` (see
 * `buildOpponentGameTimeTeamByGame` / `lookupOpponentGameTimeTeam` in
 * yardageHistoryView.ts), never the player's CURRENT team. A player can have
 * changed teams since a historical game, so substituting their present-day
 * team would misrepresent who they played for that week; the logo is omitted
 * (never guessed) whenever the artifact doesn't carry that game's own
 * historical identity. The redundant "vs SEA" / "@ SEA" secondary line that
 * used to sit under the name is gone -- the table's own heading already
 * states the defense/opponent context ("SEA Defense -- Last 10 vs WR").
 *
 * On small/mobile screens the cell renders only the opposing QB's surname
 * (`lastNameOnly`); desktop/tablet keep the full name.
 */
const NAME_SUFFIX = /^(?:jr\.?|sr\.?|ii|iii|iv|v)$/i;

/**
 * Surname only, dropping a trailing generational suffix (Jr./Sr./II–V).
 * Deterministic and dependency-free -- used for the mobile-only compact Opp
 * QB presentation; desktop keeps the full name.
 */
function opponentLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIX.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? fullName.trim();
}

function OppPlayerCell({
  gameId,
  playerId,
  playerName,
  teamByGame,
  lastNameOnly = false,
}: {
  gameId: string | null;
  playerId: string;
  playerName: string;
  teamByGame: ReadonlyMap<string, string>;
  /** Mobile-only: render just the opposing QB's surname (logo stays to its left). */
  lastNameOnly?: boolean;
}) {
  const team = lookupOpponentGameTimeTeam(teamByGame, gameId, playerId);
  return (
    <span className="flex min-w-0 items-center gap-1">
      {team && <TeamLogo abbr={team} size="sm" />}
      <span className="truncate" title={playerName}>{lastNameOnly ? opponentLastName(playerName) : playerName}</span>
    </span>
  );
}

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
 * historical games -- never a played game. `offenseRank` is the opposing
 * player's team's pregame trailing-10-game EPA/play offense rank
 * (`yardage-history.json`'s `currentWeekEpaRanks`, built by
 * `buildPregameRollingEpaAt` in `nfl-epa-week-rank-core.mjs`) -- the EXACT
 * SAME rank definition as `oppOffRank` on the historical games below, just
 * evaluated at this week's cutoff instead of a played game. Deliberately
 * NOT `opponentContext.epaEdge.offenseRank` (an 8-game blend from the
 * frozen Season/Last-5 matchup-epa.json artifact) -- that would not be
 * apples-to-apples with the historical column.
 */
export type NflYardageOpponentCurrentMatchup = {
  playerName: string;
  /** The offensive player's own team, for the same logo treatment as the historical rows' Opp Player cell -- this is always known outright (it's `row.team`), never resolved via the best-effort lookup. */
  teamAbbr: string;
  /** The DEFENSE's own home/away status for this upcoming game -- same convention as `game.homeAway` below. */
  homeAway: "home" | "away";
  offenseRank: number | null;
};

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

const EMPTY_TEAM_BY_GAME: ReadonlyMap<string, string> = new Map();

function rowKey(game: NflYardageOpponentHistoryGame): string {
  return `${game.gameId ?? `${game.season}-${game.week}`}-${game.opponentPlayerId}`;
}

export default function NflOpponentLast10Table({
  opponentAbbr,
  position,
  history,
  currentLine,
  currentMatchup,
  compact = false,
  teamByGame,
}: {
  opponentAbbr: string;
  position: string;
  history: NflYardageOpponentHistory | null;
  currentLine: number | null;
  /** This week's reference row -- omitted (not blanked) when no current-matchup context is available. */
  currentMatchup?: NflYardageOpponentCurrentMatchup | null;
  /** Tighter padding/headers/date format for the side-by-side desktop comparison. Mobile presentation is unaffected. */
  compact?: boolean;
  /** Game-time (never current-week) team lookup for the Opp Player logo -- see OppPlayerCell and `buildOpponentGameTimeTeamByGame`. Defaults to empty (no logos) so this component still works standalone, e.g. in isolation in tests. */
  teamByGame?: ReadonlyMap<string, string>;
}) {
  const resolvedTeamByGame = teamByGame ?? EMPTY_TEAM_BY_GAME;
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
  const passing = market === "passing";
  const label = {
    date: "Date",
    thisWeek: compact ? "Wk" : "This Week",
    offRank: passing ? "OFF Rank" : compact ? "Off Rank" : "Opp Off Rank",
    vsAvg: compact ? "VS AVG" : MARKET_VS_AVG_LABEL[market],
    cmpAtt: passing ? "Comp/Att" : compact ? "Cmp/Att" : "Cmp / Att Allowed",
    tdInt: passing ? "TD/INT" : compact ? "TD/INT" : "TD / INT",
    rushAtt: compact ? "Rush Att" : "Rush Att Allowed",
    rushTd: compact ? "Rush TD" : "Rush TD Allowed",
    tgtRec: compact ? "Tgt/Rec" : "Targets / Rec Allowed",
    recTd: compact ? "Rec TD" : "Rec TD Allowed",
    allowed: compact ? "Allowed" : MARKET_ALLOWED_LABEL[market],
    score: compact ? "Score" : "Game Score",
  };

  const prefixDash = () => <span className="text-slate-400">—</span>;

  const mobileColumns: NflHistoryMobileColumn<NflYardageOpponentHistoryGame>[] = [
    {
      key: "date",
      header: "Date",
      width: "w-[17%]",
      render: (game) => fmtDate(game.dateUtc, false),
      prefixRender: currentMatchup ? () => <span className="font-semibold uppercase tracking-wide text-violet-700">This Wk</span> : undefined,
    },
    {
      key: "opp",
      header: "Opp",
      width: "w-[24%]",
      render: (game) => <OppPlayerCell gameId={game.gameId} playerId={game.opponentPlayerId} playerName={game.opponentPlayerName} teamByGame={resolvedTeamByGame} lastNameOnly />,
      prefixRender: currentMatchup
        ? () => (
            <span className="flex min-w-0 items-center gap-1">
              <TeamLogo abbr={currentMatchup.teamAbbr} size="sm" />
              <span className="truncate" title={currentMatchup.playerName}>{opponentLastName(currentMatchup.playerName)}</span>
            </span>
          )
        : undefined,
    },
    { key: "volume", header: MARKET_MOBILE_VOLUME_LABEL[market], width: "w-[16%]", align: "center", render: (game) => mobileVolumeCell(market, game.stat), prefixRender: currentMatchup ? prefixDash : undefined },
    { key: "yds", header: "Yds", width: "w-[16%]", align: "center", render: (game) => <NflYardageActualYardsCell actualYards={game.yardsAllowed} currentLine={currentLine} />, prefixRender: currentMatchup ? prefixDash : undefined },
    { key: "score", header: MARKET_MOBILE_SCORE_LABEL[market], width: "w-[13%]", align: "center", render: (game) => mobileScoreCell(market, game.stat), prefixRender: currentMatchup ? prefixDash : undefined },
    {
      key: "rank",
      header: "Rk",
      width: "w-[14%]",
      align: "center",
      render: (game) => <NflYardageRankCell rank={game.oppOffRank} heatTone={historicalOffRankHeatTone(game.oppOffRank, game.oppOffRankPoolSize)} />,
      prefixRender: currentMatchup ? () => <NflYardageRankCell rank={currentMatchup.offenseRank} heatTone={currentOffenseRankHeatTone(currentMatchup.offenseRank)} /> : undefined,
    },
  ];

  const statColumns: NflHistoryColumn<NflYardageOpponentHistoryGame>[] =
    market === "passing"
      ? [
          {
            key: "cmpAttAllowed",
            header: label.cmpAtt,
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).completions} / {(game.stat as NflYardagePassingStatBlock).attempts}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.completions)} / {fmt1(footer.statAverages.attempts)}</span>,
            prefixRender: currentMatchup ? prefixDash : undefined,
          },
          {
            key: "tdIntAllowed",
            header: label.tdInt,
            render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardagePassingStatBlock).passingTds} / {(game.stat as NflYardagePassingStatBlock).interceptions}</span>,
            footer: <span className="tabular-nums">{fmt1(footer.statAverages.passingTds)} / {fmt1(footer.statAverages.interceptions)}</span>,
            prefixRender: currentMatchup ? prefixDash : undefined,
          },
        ]
      : market === "rushing"
        ? [
            {
              key: "rushAttAllowed",
              header: label.rushAtt,
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushAttempts}</span>,
              footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushAttempts)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
            {
              key: "rushTdAllowed",
              header: label.rushTd,
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageRushingStatBlock).rushTds}</span>,
              footer: <span className="tabular-nums">{fmt1(footer.statAverages.rushTds)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
          ]
        : [
            {
              key: "targetsRecAllowed",
              header: label.tgtRec,
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).targets} / {(game.stat as NflYardageReceivingStatBlock).receptions}</span>,
              footer: <span className="tabular-nums">Avg {fmt1(footer.statAverages.targets)} / Avg {fmt1(footer.statAverages.receptions)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
            {
              key: "recTdAllowed",
              header: label.recTd,
              render: (game) => <span className="tabular-nums text-slate-700">{(game.stat as NflYardageReceivingStatBlock).recTds}</span>,
              footer: <span className="tabular-nums">{fmt1(footer.statAverages.recTds)}</span>,
              prefixRender: currentMatchup ? prefixDash : undefined,
            },
          ];

  const dateColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "date",
    header: label.date,
    render: (game) => <span className="tabular-nums text-slate-600">{fmtDate(game.dateUtc, compact)}</span>,
    prefixRender: currentMatchup ? () => <span className="font-semibold uppercase tracking-wide text-[10px] text-violet-700">{label.thisWeek}</span> : undefined,
  };
  const opponentColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "opponent",
    header: passing ? "Opp QB" : OPPONENT_PLAYER_LABEL[market],
    render: (game) => <OppPlayerCell gameId={game.gameId} playerId={game.opponentPlayerId} playerName={game.opponentPlayerName} teamByGame={resolvedTeamByGame} />,
    prefixRender: currentMatchup
      ? () => (
          <span className="flex min-w-0 items-center gap-1 text-slate-600">
            <TeamLogo abbr={currentMatchup.teamAbbr} size="sm" />
            <span className="truncate">{currentMatchup.playerName}</span>
          </span>
        )
      : undefined,
  };
  const homeAwayColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "homeAway",
    header: "Home/Away",
    render: (game) => <NflYardageHomeAwayPill homeAway={game.homeAway} />,
    prefixRender: currentMatchup ? () => <NflYardageHomeAwayPill homeAway={currentMatchup.homeAway} /> : undefined,
  };
  const offRankColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "oppOffRank",
    header: label.offRank,
    render: (game) => <NflYardageRankCell rank={game.oppOffRank} heatTone={historicalOffRankHeatTone(game.oppOffRank, game.oppOffRankPoolSize)} />,
    footer: <span className="tabular-nums">{fmtAvgRank(footer.oppOffRankAvg)}</span>,
    prefixRender: currentMatchup
      ? () => <NflYardageRankCell rank={currentMatchup.offenseRank} heatTone={currentOffenseRankHeatTone(currentMatchup.offenseRank)} />
      : undefined,
  };
  const ypgColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "oppPlayerYpg",
    header: MARKET_YPG_LABEL[market],
    headerClassName: passing ? "whitespace-normal leading-tight max-w-[52px]" : undefined,
    className: "border-l-2 border-slate-200 bg-slate-50/70 tabular-nums text-slate-700",
    render: (game) => fmt1(game.oppPlayerYpg),
    footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.oppPlayerYpgAvg)}</span>,
    prefixRender: currentMatchup ? prefixDash : undefined,
  };
  const yardsColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "yardsAllowed",
    header: passing ? "Yards" : label.allowed,
    className: "bg-slate-50/70",
    render: (game) => <NflYardageActualYardsCell actualYards={game.yardsAllowed} currentLine={currentLine} />,
    footer: <span className="tabular-nums bg-slate-100">{fmt1(footer.yardsAllowedAvg)}</span>,
    prefixRender: currentMatchup ? prefixDash : undefined,
  };
  const vsAvgColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "vsPlayerAvg",
    header: label.vsAvg,
    className: "border-r-2 border-slate-200 bg-slate-50/70",
    render: (game) => <NflYardageVsAverageCell diff={computeVsAverageDiff(game.yardsAllowed, game.oppPlayerYpg)} />,
    footer: <span className="tabular-nums bg-slate-100">{formatSignedDiff(footer.vsPlayerAvgAvg)}</span>,
    prefixRender: currentMatchup ? prefixDash : undefined,
  };
  const scoreColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "gameScore",
    header: passing ? "Score" : label.score,
    render: (game) => <NflYardageGameScoreCell score={game.gameScore} />,
    footer: <>—</>,
    prefixRender: currentMatchup ? prefixDash : undefined,
  };
  // Opposing QB's Fantasy PPR Points -- verbatim nflverse Full PPR value on
  // the artifact (`game.fantasyPointsPpr`), passing/QB only.
  const fantasyPprColumn: NflHistoryColumn<NflYardageOpponentHistoryGame> = {
    key: "fantasyPprPoints",
    header: "Fantasy PPR Points",
    headerClassName: "whitespace-normal leading-tight max-w-[52px]",
    className: "tabular-nums",
    render: (game) => <NflYardageFantasyPointsCell points={game.fantasyPointsPpr ?? null} />,
    footer: <span className="tabular-nums">{fmt1(footer.fantasyPointsPprAvg)}</span>,
    prefixRender: currentMatchup ? prefixDash : undefined,
  };

  // Passing/QB: approved shared order (Date, Opp QB, Home/Away, Comp/Att,
  // Yards, TD/INT, Fantasy PPR Points, QB YPG, OFF Rank). No VS QB AVG and no
  // Score column in this layout. Rushing/receiving keep their original columns,
  // Game Score included.
  const columns: NflHistoryColumn<NflYardageOpponentHistoryGame>[] = passing
    ? [
        dateColumn,
        opponentColumn,
        homeAwayColumn,
        ...statColumns.slice(0, 1), // Comp/Att
        yardsColumn,
        ...statColumns.slice(1, 2), // TD/INT
        fantasyPprColumn,
        ypgColumn,
        offRankColumn,
      ]
    : [dateColumn, opponentColumn, homeAwayColumn, offRankColumn, ypgColumn, yardsColumn, vsAvgColumn, ...statColumns, scoreColumn];

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
        compact={compact}
        minWidthClassName={passing ? (compact ? "min-w-[620px]" : "min-w-[800px]") : compact ? "min-w-[660px]" : "min-w-[860px]"}
        prefixRow={currentMatchup ? { className: "border-b-2 border-violet-200 bg-violet-50/60", mobileClassName: "border-b-2 border-violet-200 bg-violet-50/70" } : null}
        scrollLabel={`${opponentAbbr.toUpperCase()} defense last ${history.games.length} vs ${position}`}
      />
    </div>
  );
}
