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
  formatSignedDiff,
  lookupOpponentGameTimeTeam,
} from "@/lib/nfl/props/review/yardageHistoryView";
import { historicalOffRankHeatTone, currentOffenseRankHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import { DenseTableScroller } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { TeamLogo } from "./NflYardageReviewTeamCell";
import {
  NflYardageActualYardsCell,
  NflYardageGameScoreCell,
  NflYardageHomeAwayPill,
  NflYardageLast10SummaryStrip,
  NflYardageRankCell,
  NflYardageVegasLineCell,
  NflYardageVsAverageCell,
} from "./NflYardageHistoryCells";

/**
 * Opp Player cell: name plus the offensive player's own GAME-TIME team logo --
 * resolved from that specific historical game via `teamByGame` (see
 * `buildOpponentGameTimeTeamByGame`/`lookupOpponentGameTimeTeam` in
 * yardageHistoryView.ts), never the player's CURRENT team. A player can have
 * changed teams since a historical game, so substituting their present-day
 * team would misrepresent who they played for that week; the logo is omitted
 * (never guessed) whenever the artifact doesn't carry that game's own
 * historical identity. The redundant "vs SEA" / "@ SEA" secondary line that
 * used to sit under the name is gone -- the table's own heading already
 * states the defense/opponent context ("SEA Defense -- Last 10 vs WR"), so
 * repeating it per row added nothing.
 */
function OppPlayerCell({
  gameId,
  playerId,
  playerName,
  teamByGame,
}: {
  gameId: string | null;
  playerId: string;
  playerName: string;
  teamByGame: ReadonlyMap<string, string>;
}) {
  const team = lookupOpponentGameTimeTeam(teamByGame, gameId, playerId);
  return (
    <span className="flex min-w-0 items-center gap-1">
      {team && <TeamLogo abbr={team} size="sm" />}
      <span className="truncate" title={playerName}>{playerName}</span>
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
function fmtVegasAvg(value: number | null): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "—";
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

export default function NflYardageOpponentLast10Table({
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
  /** Tighter padding/headers/date format for the side-by-side desktop comparison, plus folding the Home/Away column into the player-name cell (mirroring the Player table's Opponent column) so the two tables fit without each forcing its own horizontal scroll. Mobile presentation is unaffected. */
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
  const label = {
    date: "Date",
    thisWeek: compact ? "Wk" : "This Week",
    offRank: compact ? "Off Rank" : "Opp Off Rank",
    vsAvg: compact ? "VS AVG" : MARKET_VS_AVG_LABEL[market],
    cmpAtt: compact ? "Cmp/Att" : "Cmp / Att Allowed",
    tdInt: compact ? "TD/INT" : "TD / INT",
    rushAtt: compact ? "Rush Att" : "Rush Att Allowed",
    rushTd: compact ? "Rush TD" : "Rush TD Allowed",
    tgtRec: compact ? "Tgt/Rec" : "Targets / Rec Allowed",
    recTd: compact ? "Rec TD" : "Rec TD Allowed",
    allowed: compact ? "Allowed" : MARKET_ALLOWED_LABEL[market],
    score: compact ? "Score" : "Game Score",
    vegas: compact ? "Vegas" : "Vegas Line",
  };

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
            {currentMatchup && (
              <tr className="border-b-2 border-violet-200 bg-violet-50/70">
                <td className="px-1 py-1.5 font-semibold uppercase tracking-wide text-violet-700">This Wk</td>
                <td className="px-1 py-1.5 text-slate-600">
                  <span className="flex min-w-0 items-center gap-1">
                    <TeamLogo abbr={currentMatchup.teamAbbr} size="sm" />
                    <span className="truncate" title={currentMatchup.playerName}>{currentMatchup.playerName}</span>
                  </span>
                </td>
                <td className="px-1 py-1.5 text-center text-slate-400">—</td>
                <td className="px-1 py-1.5 text-center text-slate-400">—</td>
                <td className="px-1 py-1.5 text-center text-slate-400">—</td>
                <td className="px-1 py-1.5 text-center">
                  <NflYardageRankCell rank={currentMatchup.offenseRank} heatTone={currentOffenseRankHeatTone(currentMatchup.offenseRank)} />
                </td>
              </tr>
            )}
            {history.games.map((game) => (
              <tr key={`m-${game.gameId ?? `${game.season}-${game.week}`}-${game.opponentPlayerId}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-1 py-1.5 tabular-nums text-slate-600">{fmtDate(game.dateUtc, false)}</td>
                <td className="px-1 py-1.5 text-slate-800">
                  <OppPlayerCell gameId={game.gameId} playerId={game.opponentPlayerId} playerName={game.opponentPlayerName} teamByGame={resolvedTeamByGame} />
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
        <table className={cn("w-full border-collapse text-[11px]", compact ? "min-w-[660px]" : "min-w-[860px]")}>
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-200/70 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
              <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.date}</th>
              <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{OPPONENT_PLAYER_LABEL[market]}</th>
              {/* Compact folds Home/Away into the player-name cell below (mirroring the Player table's Opponent column) instead of its own column. */}
              {!compact && <th className="px-2 py-1.5">Home/Away</th>}
              <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.offRank}</th>
              <th className={cn("px-2 py-1.5 rounded-l border-l-2 border-y-2 border-slate-300 bg-slate-100/80", compact && "px-1.5 py-1")}>{MARKET_YPG_LABEL[market]}</th>
              <th className={cn("px-2 py-1.5 border-y-2 border-slate-300 bg-slate-100/80", compact && "px-1.5 py-1")}>{label.allowed}</th>
              <th className={cn("px-2 py-1.5 rounded-r border-r-2 border-y-2 border-slate-300 bg-slate-100/80", compact && "px-1.5 py-1")}>{label.vsAvg}</th>
              {market === "passing" && <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.cmpAtt}</th>}
              {market === "passing" && <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.tdInt}</th>}
              {market === "rushing" && <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.rushAtt}</th>}
              {market === "rushing" && <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.rushTd}</th>}
              {market === "receiving" && <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.tgtRec}</th>}
              {market === "receiving" && <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.recTd}</th>}
              <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.score}</th>
              <th className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>{label.vegas}</th>
            </tr>
          </thead>
          <tbody>
            {currentMatchup && (
              <tr className="border-b-2 border-violet-200 bg-violet-50/60">
                <td className={cn("px-2 py-1.5 font-semibold uppercase tracking-wide text-[10px] text-violet-700", compact && "px-1.5 py-1")}>{label.thisWeek}</td>
                <td className={cn("px-2 py-1.5 text-slate-600", compact && "px-1.5 py-1")}>
                  <span className={cn("inline-flex min-w-0 items-center gap-1", compact && "mr-1.5")}>
                    <TeamLogo abbr={currentMatchup.teamAbbr} size="sm" />
                    <span className="truncate">{currentMatchup.playerName}</span>
                  </span>
                  {compact && <NflYardageHomeAwayPill homeAway={currentMatchup.homeAway} />}
                </td>
                {!compact && <td className="px-2 py-1.5"><NflYardageHomeAwayPill homeAway={currentMatchup.homeAway} /></td>}
                <td className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>
                  <NflYardageRankCell rank={currentMatchup.offenseRank} heatTone={currentOffenseRankHeatTone(currentMatchup.offenseRank)} />
                </td>
                <td className={cn("px-2 py-1.5 border-l-2 border-slate-200 bg-slate-50/40 text-slate-400", compact && "px-1.5 py-1")}>—</td>
                <td className={cn("px-2 py-1.5 bg-slate-50/40 text-slate-400", compact && "px-1.5 py-1")}>—</td>
                <td className={cn("px-2 py-1.5 border-r-2 border-slate-200 bg-slate-50/40 text-slate-400", compact && "px-1.5 py-1")}>—</td>
                {market === "passing" && <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>}
                {market === "passing" && <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>}
                {market === "rushing" && <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>}
                {market === "rushing" && <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>}
                {market === "receiving" && <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>}
                {market === "receiving" && <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>}
                <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>
                <td className={cn("px-2 py-1.5 text-slate-400", compact && "px-1.5 py-1")}>—</td>
              </tr>
            )}
            {history.games.map((game) => {
              const vsPlayerAvg = computeVsAverageDiff(game.yardsAllowed, game.oppPlayerYpg);
              return (
                <tr key={`${game.gameId ?? `${game.season}-${game.week}`}-${game.opponentPlayerId}`} className="border-b border-slate-100 last:border-b-0">
                  <td className={cn("px-2 py-1.5 tabular-nums text-slate-600", compact && "px-1.5 py-1")}>{fmtDate(game.dateUtc, compact)}</td>
                  <td className={cn("px-2 py-1.5 text-slate-800", compact && "px-1.5 py-1")}>
                    <span className={cn("inline-flex", compact && "mr-1.5")}>
                      <OppPlayerCell gameId={game.gameId} playerId={game.opponentPlayerId} playerName={game.opponentPlayerName} teamByGame={resolvedTeamByGame} />
                    </span>
                    {compact && <NflYardageHomeAwayPill homeAway={game.homeAway} />}
                  </td>
                  {!compact && <td className="px-2 py-1.5"><NflYardageHomeAwayPill homeAway={game.homeAway} /></td>}
                  <td className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>
                    <NflYardageRankCell rank={game.oppOffRank} heatTone={historicalOffRankHeatTone(game.oppOffRank, game.oppOffRankPoolSize)} />
                  </td>
                  <td className={cn("px-2 py-1.5 border-l-2 border-slate-200 bg-slate-50/70 tabular-nums text-slate-700", compact && "px-1.5 py-1")}>{fmt1(game.oppPlayerYpg)}</td>
                  <td className={cn("px-2 py-1.5 bg-slate-50/70", compact && "px-1.5 py-1")}><NflYardageActualYardsCell actualYards={game.yardsAllowed} currentLine={currentLine} /></td>
                  <td className={cn("px-2 py-1.5 border-r-2 border-slate-200 bg-slate-50/70", compact && "px-1.5 py-1")}><NflYardageVsAverageCell diff={vsPlayerAvg} /></td>
                  {market === "passing" && (
                    <td className={cn("px-2 py-1.5 tabular-nums text-slate-700", compact && "px-1.5 py-1")}>
                      {(game.stat as NflYardagePassingStatBlock).completions} / {(game.stat as NflYardagePassingStatBlock).attempts}
                    </td>
                  )}
                  {market === "passing" && (
                    <td className={cn("px-2 py-1.5 tabular-nums text-slate-700", compact && "px-1.5 py-1")}>
                      {(game.stat as NflYardagePassingStatBlock).passingTds} / {(game.stat as NflYardagePassingStatBlock).interceptions}
                    </td>
                  )}
                  {market === "rushing" && (
                    <td className={cn("px-2 py-1.5 tabular-nums text-slate-700", compact && "px-1.5 py-1")}>{(game.stat as NflYardageRushingStatBlock).rushAttempts}</td>
                  )}
                  {market === "rushing" && (
                    <td className={cn("px-2 py-1.5 tabular-nums text-slate-700", compact && "px-1.5 py-1")}>{(game.stat as NflYardageRushingStatBlock).rushTds}</td>
                  )}
                  {market === "receiving" && (
                    <td className={cn("px-2 py-1.5 tabular-nums text-slate-700", compact && "px-1.5 py-1")}>
                      {(game.stat as NflYardageReceivingStatBlock).targets} / {(game.stat as NflYardageReceivingStatBlock).receptions}
                    </td>
                  )}
                  {market === "receiving" && (
                    <td className={cn("px-2 py-1.5 tabular-nums text-slate-700", compact && "px-1.5 py-1")}>{(game.stat as NflYardageReceivingStatBlock).recTds}</td>
                  )}
                  <td className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}><NflYardageGameScoreCell score={game.gameScore} /></td>
                  <td className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}><NflYardageVegasLineCell line={game.vegasLine} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-400 bg-slate-200/60 font-bold text-slate-700">
              <td className={cn("px-2 py-1.5 uppercase tracking-wide text-[10px]", compact && "px-1.5 py-1")} colSpan={compact ? 2 : 3}>Last 10 Avg</td>
              <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>{fmtAvgRank(footer.oppOffRankAvg)}</td>
              <td className={cn("px-2 py-1.5 border-l-2 border-slate-300 bg-slate-100 tabular-nums", compact && "px-1.5 py-1")}>{fmt1(footer.oppPlayerYpgAvg)}</td>
              <td className={cn("px-2 py-1.5 bg-slate-100 tabular-nums", compact && "px-1.5 py-1")}>{fmt1(footer.yardsAllowedAvg)}</td>
              <td className={cn("px-2 py-1.5 border-r-2 border-slate-300 bg-slate-100 tabular-nums", compact && "px-1.5 py-1")}>{formatSignedDiff(footer.vsPlayerAvgAvg)}</td>
              {market === "passing" && (
                <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>
                  Avg {fmt1(footer.statAverages.completions)} / Avg {fmt1(footer.statAverages.attempts)}
                </td>
              )}
              {market === "passing" && (
                <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>
                  Avg {fmt1(footer.statAverages.passingTds)} / Avg {fmt1(footer.statAverages.interceptions)}
                </td>
              )}
              {market === "rushing" && <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>{fmt1(footer.statAverages.rushAttempts)}</td>}
              {market === "rushing" && <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>{fmt1(footer.statAverages.rushTds)}</td>}
              {market === "receiving" && (
                <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>
                  Avg {fmt1(footer.statAverages.targets)} / Avg {fmt1(footer.statAverages.receptions)}
                </td>
              )}
              {market === "receiving" && <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>{fmt1(footer.statAverages.recTds)}</td>}
              <td className={cn("px-2 py-1.5", compact && "px-1.5 py-1")}>—</td>
              <td className={cn("px-2 py-1.5 tabular-nums", compact && "px-1.5 py-1")}>{fmtVegasAvg(footer.vegasLineAvg)}</td>
            </tr>
          </tfoot>
        </table>
      </DenseTableScroller>
    </div>
  );
}
