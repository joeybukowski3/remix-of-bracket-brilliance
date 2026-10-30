import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeStarterGaps, describeStarterMatch, type OpponentBoxGame, type OpponentBoxPlayer, type OpponentBoxTable } from "@/lib/nba/props/boxScoreTables";
import { shortDate } from "@/lib/nba/props/recentForm";
import type { BoardMarket, BoardRow } from "@/lib/nba/props/propsBoard";
import { BODY_CELL, BoxCard, BoxNote, HEAD_CELL, IDENTITY, NUMERIC, SELECTED_COLUMN, STAT_LABEL, TeamTag, fmtAverage, fmtStat } from "@/components/nba/BoxScoreParts";
import { LowSample } from "@/components/nba/boardCells";
import { ROW_FOCUS, rowToggleHandlers } from "@/components/nba/rowToggle";

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;
const COLUMNS = 8;

const NOTE: Record<Exclude<OpponentBoxTable["status"], "ok">, string> = {
  stale: "This board was built before opponent box scores existed. Rebuild the private preview board to add them.",
  "no-position": "No estimated position for this player, so there is no opposing starter at the player's position to show.",
  "no-opponent": "The opponent is unknown, so there is no box score to show.",
  none: "The opponent has no completed regular-season game this season yet. Last season is never used to fill it.",
};

interface TableContext {
  market: BoardMarket;
  stat: string;
  opponent: string;
  position: string;
}

const dash = <span className="text-slate-400">–</span>;

/** Who started at the position in a game, or the plain reason no one is named. */
function StarterCell({ game, ctx }: { game: OpponentBoxGame; ctx: TableContext }) {
  const match = game.starterMatch;
  const title = describeStarterMatch(match, ctx.position);
  if (match.kind === "matched") {
    return <span data-testid="opp-box-starter" data-match="matched" title={title} className="font-semibold text-slate-900">{match.player.name}</span>;
  }
  const label = { multiple: `${match.kind === "multiple" ? match.players.length : 0} ${ctx.position} starters`, none: `No ${ctx.position} starter`, uncertain: "Position unclear", unavailable: "Starter n/a" }[match.kind];
  return (
    <span data-testid="opp-box-starter" data-match={match.kind} title={title} className={cn("text-[10px] font-semibold italic", match.kind === "unavailable" ? "text-slate-500" : "text-slate-700")}>
      {label}
    </span>
  );
}

/** One opposing player under an opponent game: the complete box score behind the two figures above it. */
function PlayerLine({ player, game, ctx }: { player: OpponentBoxPlayer; game: OpponentBoxGame; ctx: TableContext }) {
  const selected = (key: BoardMarket) => (key === ctx.market ? SELECTED_COLUMN : "");
  const match = game.starterMatch;
  const isMatched = match.kind === "matched" && match.player === player;
  const isCandidate = match.kind === "multiple" && match.players.includes(player);
  return (
    <tr
      data-testid="opp-box-player"
      data-game={game.gameId}
      data-starter={player.starter === null ? "unknown" : String(player.starter)}
      data-matched={isMatched ? "true" : "false"}
      className={cn("border-t border-slate-100 bg-white", isMatched && "bg-sky-50", isCandidate && "bg-slate-100")}
    >
      <td className={BODY_CELL} />
      <th scope="row" colSpan={3} className={cn(BODY_CELL, IDENTITY, "font-medium", player.starter ? "text-slate-900" : "text-slate-600")}>
        <span className="inline-flex flex-wrap items-center gap-x-1">
          {player.name}
          {player.starter ? <span className="rounded bg-slate-200 px-1 text-[8px] font-black leading-snug text-slate-700" title="Starter, per the source's starter flag">S</span> : null}
          <span className="text-[9px] font-semibold uppercase text-slate-500 max-sm:hidden" title="Estimated primary position (not a verified lineup spot)">{player.position ?? "n/a"}</span>
          {isMatched ? <span className="text-[9px] font-bold text-sky-700" title={`The ${ctx.position} starter this table reads`}>matched</span> : null}
          {isCandidate ? <span className="text-[9px] font-bold text-slate-700" title={`One of several starters estimated at ${ctx.position}: not chosen`}>not chosen</span> : null}
        </span>
      </th>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(player.minutes)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("pts"))}>{fmtStat(player.pts)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("reb"))}>{fmtStat(player.reb)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("ast"))}>{fmtStat(player.ast)}</td>
    </tr>
  );
}

/** The opposing team's totals for the game: what the listed players add up to, which is the team's score for points. */
function TeamTotalLine({ game, ctx }: { game: OpponentBoxGame; ctx: TableContext }) {
  const total = (field: "minutes" | "pts" | "reb" | "ast"): number => game.players.reduce((sum, p) => sum + p[field], 0);
  const selected = (key: BoardMarket) => (key === ctx.market ? SELECTED_COLUMN : "");
  return (
    <tr data-testid="opp-box-total" data-game={game.gameId} className="border-t border-slate-200 bg-slate-50 font-bold text-slate-700">
      <td className={BODY_CELL} />
      <th scope="row" colSpan={3} className={cn(BODY_CELL, IDENTITY, "text-[10px] uppercase tracking-wide")}>
        {game.versus} total
        {game.teamPtsAllowed === null ? <span className="ml-1 font-semibold normal-case text-slate-700" title="The listed minutes do not add up to a full game, so a player row may be missing and this is not the team's score">incomplete box score</span> : null}
      </th>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(total("minutes"))}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("pts"))}>{fmtStat(total("pts"))}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("reb"))}>{fmtStat(total("reb"))}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("ast"))}>{fmtStat(total("ast"))}</td>
    </tr>
  );
}

function GameGroup({ game, ctx, open, onToggle }: { game: OpponentBoxGame; ctx: TableContext; open: boolean; onToggle: () => void }) {
  const starter = game.starter;
  const selected = (key: BoardMarket) => (key === ctx.market ? SELECTED_COLUMN : "");
  const label = `${shortDate(game.date)} ${game.defenseIsHome ? "vs" : "@"} ${game.versus}`;
  return (
    <>
      <tr
        data-testid="opp-box-game"
        data-game={game.gameId}
        data-match={game.starterMatch.kind}
        tabIndex={0}
        aria-expanded={open}
        className={cn("border-t border-slate-200 bg-slate-50 transition-colors hover:bg-sky-50", ROW_FOCUS)}
        {...rowToggleHandlers(onToggle)}
      >
        <th scope="row" className={cn(BODY_CELL, IDENTITY, "whitespace-nowrap font-semibold text-slate-700")}>
          <span className="inline-flex items-center gap-0.5 sm:gap-1">
            <button type="button" tabIndex={-1} data-row-toggle aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the full ${game.versus} box score for ${label}`} data-testid="opp-box-toggle" className="inline-flex h-5 w-3.5 items-center justify-center rounded text-slate-600 hover:bg-white/80 sm:w-4">
              <ChevronRight size={12} aria-hidden className={cn("transition-transform", open && "rotate-90")} />
            </button>
            {shortDate(game.date)}
          </span>
        </th>
        <td className={cn(BODY_CELL, IDENTITY)} title={`${ctx.opponent} ${game.defenseIsHome ? "hosted" : "visited"} ${game.versus}: the listed players are ${game.versus}'s`}>
          <TeamTag team={game.versus} prefix={game.defenseIsHome ? "vs" : "@"} />
        </td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold text-slate-900")} data-testid="opp-box-team-pts" title={game.teamPtsAllowed === null ? `${ctx.opponent}'s points allowed are unknown: the ${game.versus} box score is not a complete game` : `${ctx.opponent} allowed ${game.teamPtsAllowed} points: ${game.versus}'s final score`}>
          {game.teamPtsAllowed === null ? dash : game.teamPtsAllowed}
        </td>
        <td className={cn(BODY_CELL, IDENTITY, "max-sm:leading-tight")}><StarterCell game={game} ctx={ctx} /></td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold")}>{starter ? fmtStat(starter.minutes) : dash}</td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold", selected("pts"))} data-testid="opp-box-starter-pts">{starter ? fmtStat(starter.pts) : dash}</td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold", selected("reb"))} data-testid="opp-box-starter-reb">{starter ? fmtStat(starter.reb) : dash}</td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold", selected("ast"))} data-testid="opp-box-starter-ast">{starter ? fmtStat(starter.ast) : dash}</td>
      </tr>
      {open ? (
        <>
          {game.players.map((player, i) => <PlayerLine key={`${game.gameId}-${i}`} player={player} game={game} ctx={ctx} />)}
          <TeamTotalLine game={game} ctx={ctx} />
        </>
      ) : null}
    </>
  );
}

/**
 * The opponent's last ten games, newest first: the points the defense allowed (the opposing team's score), and separately what
 * the opposing starter at the player's estimated position did, with the complete opposing box score behind each game. A game
 * with no single identifiable starter shows why, and is left out of the average rather than filled by a guess.
 */
export default function OpponentLastTenTable({ row, market }: { row: BoardRow; market: BoardMarket }) {
  const box = row.opponentBox;
  const [openGames, setOpenGames] = useState<ReadonlySet<string>>(() => new Set());
  const stat = STAT_LABEL[market];
  const opponent = row.entry.opponent ?? "Opponent";
  const position = box.position ?? "position n/a";
  const title = `${opponent} last 10 · points allowed and the ${position} starter · box score`;
  if (box.status !== "ok") return <BoxCard title={title} testId="opp-box-card"><BoxNote testId="opp-box-note">{NOTE[box.status]}</BoxNote></BoxCard>;
  const ctx: TableContext = { market, stat, opponent, position };
  const toggle = (id: string) =>
    setOpenGames((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allOpen = box.games.every((g) => openGames.has(g.gameId));
  const { average } = box;
  const selected = (key: BoardMarket) => (key === market ? SELECTED_COLUMN : "");
  const gaps = describeStarterGaps(box.gaps, position);
  return (
    <BoxCard
      title={title}
      testId="opp-box-card"
      subtitle={`${opponent}'s ten most recent completed games, newest first. Team PTS is the total ${opponent} allowed; the ${position} starter columns are the one opposing starter estimated at ${position}. Open a game for the full opposing box score.`}
      actions={
        <button
          type="button"
          data-testid="opp-box-expand-all"
          onClick={() => setOpenGames(allOpen ? new Set() : new Set(box.games.map((g) => g.gameId)))}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      }
    >
      {box.starterData === "none" ? (
        <BoxNote testId="opp-box-starter-note">
          This board's box scores carry no starter status (it was built before that was added), so the {position} starter cannot be named. Team points allowed and the full opposing box scores are shown. Rebuild the private preview board to add starters.
        </BoxNote>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] max-sm:text-[10px]" data-testid="opp-box-table">
          <caption className="sr-only">{`${opponent}'s last ${games(box.games.length)}, newest to oldest: team points allowed, then the opposing ${position} starter's minutes, points, rebounds and assists`}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)}>Date</th>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)} title="The team that faced this defense; its players are listed"><span className="max-sm:sr-only">Opp </span>team</th>
              <th scope="col" aria-label="Team PTS allowed" className={cn(HEAD_CELL, NUMERIC)} title={`Points ${opponent} allowed: the opposing team's total score. Not a position figure.`}>Team PTS<span className="max-sm:hidden"> allowed</span></th>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)} title="The opposing starter estimated at the player's position, per the source's starter flags. One player's own line, never a sum.">{position} starter</th>
              <th scope="col" className={cn(HEAD_CELL, NUMERIC)}>MIN</th>
              {(["pts", "reb", "ast"] as const).map((key) => (
                <th key={key} scope="col" className={cn(HEAD_CELL, NUMERIC, selected(key))}>{STAT_LABEL[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {box.games.map((game) => (
              <GameGroup key={game.gameId} game={game} ctx={ctx} open={openGames.has(game.gameId)} onToggle={() => toggle(game.gameId)} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-black text-slate-800" data-testid="opp-box-average">
              <th scope="row" colSpan={2} className={cn(BODY_CELL, IDENTITY, "border-t border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600")}>
                L10 avg per game
                <span className="ml-1 font-semibold normal-case text-slate-500" data-testid="opp-box-average-note">
                  {games(box.games.length)}
                  {box.isSmallSample ? ", small sample" : ""}
                </span>
              </th>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200")} data-testid="opp-box-average-team-pts" title={box.teamPtsKnown < box.games.length ? `Average of the ${box.teamPtsKnown} of ${games(box.games.length)} with a complete opposing box score` : undefined}>
                {box.teamPtsAverage === null ? "–" : fmtAverage(box.teamPtsAverage)}
                {box.teamPtsKnown < box.games.length ? <LowSample why={`Only ${box.teamPtsKnown} of ${games(box.games.length)} have a complete opposing box score`} games={box.teamPtsKnown} /> : null}
              </td>
              <td className={cn(BODY_CELL, IDENTITY, "border-t border-slate-200 text-[10px] font-semibold normal-case text-slate-600")} data-testid="opp-box-average-starters">
                {box.gamesWithFigure} of {games(box.games.length)}
              </td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200")}>{average ? fmtAverage(average.minutes) : "–"}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("pts"))} data-testid="opp-box-average-pts">{average ? fmtAverage(average.pts) : "–"}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("reb"))} data-testid="opp-box-average-reb">{average ? fmtAverage(average.reb) : "–"}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("ast"))} data-testid="opp-box-average-ast">{average ? fmtAverage(average.ast) : "–"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="space-y-0.5 border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-slate-600" data-testid="opp-box-limits">
        <li data-testid="opp-box-coverage-summary">
          {position} starter identified in {box.gamesWithFigure} of {games(box.games.length)}
          {gaps ? `; not counted: ${gaps}` : ""}. A game without exactly one identified starter is left out of the starter average, never filled by a guess.
        </li>
        <li>Starters are the source's explicit starter flags; the position is each player's estimated primary position (the one Defense vs. Position uses), not a verified lineup spot. Team points allowed are the opposing team's full score, left blank when its box score is incomplete. Regular-season games only. Context, not a projection input.</li>
      </ul>
    </BoxCard>
  );
}
