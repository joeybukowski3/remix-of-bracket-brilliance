import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpponentBoxGame, OpponentBoxPlayer, OpponentBoxTable } from "@/lib/nba/props/boxScoreTables";
import { shortDate } from "@/lib/nba/props/recentForm";
import type { BoardMarket, BoardRow } from "@/lib/nba/props/propsBoard";
import { BODY_CELL, BoxCard, BoxNote, HEAD_CELL, IDENTITY, NUMERIC, SELECTED_COLUMN, STAT_LABEL, SelectedResult, TeamTag, fmtAverage, fmtStat } from "@/components/nba/BoxScoreParts";
import { LowSample } from "@/components/nba/boardCells";
import { ROW_FOCUS, rowToggleHandlers } from "@/components/nba/rowToggle";

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;
const percent = (share: number | null): string => (share === null ? "–" : `${Math.round(share * 100)}%`);
const COLUMNS = 9;

const NOTE: Record<Exclude<OpponentBoxTable["status"], "ok">, string> = {
  stale: "This board was built before opponent box scores existed. Rebuild the private preview board to add them.",
  "no-position": "No estimated position for this player, so there is no opponent-vs-position box score to show.",
  "no-opponent": "The opponent is unknown, so there is no box score to show.",
  none: "The opponent has no completed game this season with opposing minutes attributed to a position yet. Last season is never used to fill it.",
};

interface TableContext {
  market: BoardMarket;
  stat: string;
  line: number | null;
  opponent: string;
  position: string;
}

/** One opposing player under an opponent game: the people behind the subtotal. */
function PlayerLine({ player, game, ctx, counted }: { player: OpponentBoxPlayer; game: OpponentBoxGame; ctx: TableContext; counted: boolean }) {
  const selected = (key: BoardMarket) => (key === ctx.market ? SELECTED_COLUMN : "");
  return (
    <tr data-testid={counted ? "opp-box-player" : "opp-box-unmatched"} data-game={game.gameId} className={cn("border-t border-slate-100 bg-white", !counted && "bg-amber-50/40 text-slate-500")}>
      <td colSpan={2} className={BODY_CELL} />
      <th scope="row" className={cn(BODY_CELL, IDENTITY, "pl-5 font-medium max-sm:pl-1", counted ? "text-slate-800" : "italic text-slate-600")}>
        {player.name}
        {counted ? null : <span className="ml-1 text-[9px] not-italic text-amber-800" title="This player has no estimated position for the season, so adds nothing to any subtotal">not counted</span>}
      </th>
      <td className={cn(BODY_CELL, NUMERIC, "max-sm:hidden")} title={counted ? "Estimated primary position, the one Defense vs. Position uses" : "No position estimate"}>{player.position ?? "n/a"}</td>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(player.minutes)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("pts"))}>{fmtStat(player.pts)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("reb"))}>{fmtStat(player.reb)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selected("ast"))}>{fmtStat(player.ast)}</td>
      <td className={cn(BODY_CELL, NUMERIC, "max-sm:hidden")}>{fmtStat(player.selected)}</td>
    </tr>
  );
}

function CoverageNote({ game, ctx }: { game: OpponentBoxGame; ctx: TableContext }) {
  if (game.subtotal === null) {
    return (
      <span className="text-amber-800" data-testid="opp-box-coverage" title="No opposing minute in this game had an estimated position, so nothing can be said about this position. It is missing data, not a shutout.">
        <LowSample why="No opposing minutes had an estimated position" />
        no positions assigned, not a shutout
      </span>
    );
  }
  const names = game.players.length === 0 ? `no ${ctx.position}` : `${game.players.length} ${game.players.length === 1 ? "player" : "players"}`;
  return (
    <span data-testid="opp-box-coverage" className="text-slate-600" title={`${percent(game.coverage)} of the opposing team's minutes in this game had an estimated position${game.isIncomplete ? "; the rest are not counted, so this subtotal is a floor" : ""}`}>
      <strong className="font-semibold text-slate-800">{names}</strong>
      {game.isIncomplete ? (
        <span className="ml-1 font-semibold text-amber-800">
          <LowSample why={`Incomplete: only ${percent(game.coverage)} of the opposing minutes had an estimated position`} />
          partial {percent(game.coverage)}
        </span>
      ) : (
        <span className="ml-1 text-slate-500">· 100% attributed</span>
      )}
    </span>
  );
}

function GameGroup({ game, ctx, open, onToggle }: { game: OpponentBoxGame; ctx: TableContext; open: boolean; onToggle: () => void }) {
  const sub = game.subtotal;
  const selected = (key: BoardMarket) => (key === ctx.market ? SELECTED_COLUMN : "");
  const dash = <span className="text-slate-400">–</span>;
  const label = `${shortDate(game.date)} ${game.defenseIsHome ? "vs" : "@"} ${game.versus}`;
  return (
    <>
      <tr
        data-testid="opp-box-game"
        data-game={game.gameId}
        data-incomplete={game.isIncomplete ? "true" : "false"}
        tabIndex={0}
        aria-expanded={open}
        className={cn("border-t border-slate-200 bg-slate-50 transition-colors hover:bg-sky-50", ROW_FOCUS)}
        {...rowToggleHandlers(onToggle)}
      >
        <th scope="row" className={cn(BODY_CELL, IDENTITY, "whitespace-nowrap font-semibold text-slate-700")}>
          <span className="inline-flex items-center gap-0.5 sm:gap-1">
            <button type="button" tabIndex={-1} data-row-toggle aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the opposing players for ${label}`} data-testid="opp-box-toggle" className="inline-flex h-5 w-3.5 items-center justify-center rounded text-slate-600 hover:bg-white/80 sm:w-4">
              <ChevronRight size={12} aria-hidden className={cn("transition-transform", open && "rotate-90")} />
            </button>
            {shortDate(game.date)}
          </span>
        </th>
        <td className={cn(BODY_CELL, IDENTITY)} title={`${ctx.opponent} ${game.defenseIsHome ? "hosted" : "visited"} ${game.versus}: the listed players are ${game.versus}'s`}>
          <TeamTag team={game.versus} prefix={game.defenseIsHome ? "vs" : "@"} />
        </td>
        <td className={cn(BODY_CELL, IDENTITY, "text-[10px]")}>
          <CoverageNote game={game} ctx={ctx} />
        </td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold max-sm:hidden")} title={`Subtotal: the opposing ${ctx.position}s counted for ${ctx.opponent}, Defense vs. Position's own assignment`}>{ctx.position}</td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold")}>{sub ? fmtStat(sub.minutes) : dash}</td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold", selected("pts"))} data-testid="opp-box-subtotal-pts">{sub ? fmtStat(sub.pts) : dash}</td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold", selected("reb"))} data-testid="opp-box-subtotal-reb">{sub ? fmtStat(sub.reb) : dash}</td>
        <td className={cn(BODY_CELL, NUMERIC, "font-bold", selected("ast"))} data-testid="opp-box-subtotal-ast">{sub ? fmtStat(sub.ast) : dash}</td>
        <td className={cn(BODY_CELL, NUMERIC, "max-sm:hidden")}>{sub ? <SelectedResult value={sub.selected} line={null} stat={ctx.stat} /> : dash}</td>
      </tr>
      {open ? (
        <>
          {game.players.map((player, i) => <PlayerLine key={`${game.gameId}-${i}`} player={player} game={game} ctx={ctx} counted />)}
          {game.players.length === 0 ? (
            <tr data-testid="opp-box-no-players" className="border-t border-slate-100 bg-white">
              <td colSpan={COLUMNS} className={cn(BODY_CELL, IDENTITY, "pl-8 text-[10px] italic text-slate-500")}>
                {game.subtotal === null ? `No opposing player in this game had an estimated position.` : `No ${game.versus} player at ${ctx.position} played${game.isIncomplete ? ", but some opposing minutes have no estimated position, so this may be missing data" : ""}.`}
              </td>
            </tr>
          ) : null}
          {game.unmatched.map((player, i) => <PlayerLine key={`${game.gameId}-u${i}`} player={player} game={game} ctx={ctx} counted={false} />)}
          {game.otherPositionPlayers > 0 ? (
            <tr className="border-t border-slate-100 bg-white" data-testid="opp-box-others">
              <td colSpan={COLUMNS} className={cn(BODY_CELL, IDENTITY, "pl-8 text-[10px] text-slate-500")}>
                + {game.otherPositionPlayers} {game.otherPositionPlayers === 1 ? "player" : "players"} at other positions, not shown or counted here
              </td>
            </tr>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/**
 * The opponent's last ten games at the player's estimated position, grouped by game, with the individual opposing players
 * behind each subtotal. Uses the position Defense vs. Position uses (boxScoreTables.ts) and shows how much of each game's
 * opposing minutes had a position at all: a partial game is a floor, and a game with none is missing data, not a shutout.
 */
export default function OpponentLastTenTable({ row, market }: { row: BoardRow; market: BoardMarket }) {
  const box = row.opponentBox;
  const [openGames, setOpenGames] = useState<ReadonlySet<string>>(() => new Set());
  const stat = STAT_LABEL[market];
  const opponent = row.entry.opponent ?? "Opponent";
  const position = box.position ?? "position n/a";
  const title = `${opponent} last 10 · ${stat} allowed to ${position} · box score`;
  if (box.status !== "ok") return <BoxCard title={title} testId="opp-box-card"><BoxNote testId="opp-box-note">{NOTE[box.status]}</BoxNote></BoxCard>;
  const ctx: TableContext = { market, stat, line: row.entry.line?.line ?? null, opponent, position };
  const toggle = (id: string) =>
    setOpenGames((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allOpen = box.games.every((g) => openGames.has(g.gameId));
  const { average } = box;
  const selected = (key: BoardMarket) => (key === market ? SELECTED_COLUMN : "");
  return (
    <BoxCard
      title={title}
      testId="opp-box-card"
      subtitle={`${opponent}'s ten most recent completed games, newest first: the opposing players whose estimated primary position is ${position}, game by game. Open a game for the players behind its subtotal.`}
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
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" data-testid="opp-box-table">
          <caption className="sr-only">{`${opponent}'s last ${games(box.games.length)}, newest to oldest, with the opposing ${position} players, minutes, points, rebounds, assists and the ${stat} subtotal`}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)}>Date</th>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)} title="The team that faced this defense; its players are listed"><span className="max-sm:sr-only">Opp </span>team</th>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)}>Player</th>
              <th scope="col" className={cn(HEAD_CELL, NUMERIC, "max-sm:hidden")} title="Estimated primary position (not verified minutes at a position)">Pos</th>
              <th scope="col" className={cn(HEAD_CELL, NUMERIC)}>MIN</th>
              {(["pts", "reb", "ast"] as const).map((key) => (
                <th key={key} scope="col" className={cn(HEAD_CELL, NUMERIC, selected(key))}>{STAT_LABEL[key]}</th>
              ))}
              <th scope="col" className={cn(HEAD_CELL, NUMERIC, "max-sm:hidden")} title={`The ${stat} subtotal for the game. It is a team-position total, so it is never compared to one player's line.`}>
                {`${stat} result`}
              </th>
            </tr>
          </thead>
          <tbody>
            {box.games.map((game) => (
              <GameGroup key={game.gameId} game={game} ctx={ctx} open={openGames.has(game.gameId)} onToggle={() => toggle(game.gameId)} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-black text-slate-800" data-testid="opp-box-average">
              <th scope="row" colSpan={3} className={cn(BODY_CELL, IDENTITY, "border-t border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600")}>
                L10 avg per game
                <span className="ml-1 font-semibold normal-case text-slate-500" data-testid="opp-box-average-note">
                  {box.gamesWithFigure < box.games.length ? `${box.gamesWithFigure} of ${games(box.games.length)} with positions` : games(box.games.length)}
                  {box.isSmallSample ? ", small sample" : ""}
                  {box.incompleteGames > 0 ? `, ${box.incompleteGames} partial (a floor)` : ""}
                </span>
              </th>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200 max-sm:hidden")}>{position}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200")}>{average ? fmtAverage(average.minutes) : "–"}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("pts"))} data-testid="opp-box-average-pts">{average ? fmtAverage(average.pts) : "–"}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("reb"))} data-testid="opp-box-average-reb">{average ? fmtAverage(average.reb) : "–"}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("ast"))} data-testid="opp-box-average-ast">{average ? fmtAverage(average.ast) : "–"}</td>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200 max-sm:hidden")}>{average ? <SelectedResult value={average.selected} line={null} stat={stat} average /> : "–"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="space-y-0.5 border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-slate-600" data-testid="opp-box-limits">
        <li data-testid="opp-box-coverage-summary">
          Attributed minutes: {percent(box.coverage)} of the opposing players' minutes across {games(box.games.length)} had an estimated position
          {box.incompleteGames > 0 ? `; ${games(box.incompleteGames)} ${box.incompleteGames === 1 ? "is" : "are"} partial, so ${box.incompleteGames === 1 ? "its subtotal is" : "their subtotals are"} a floor, not a full total` : ""}. A player with no estimate is listed as not counted and adds to no subtotal.
        </li>
        <li>Estimated primary position (the one Defense vs. Position uses), regular-season games only. A game with no assigned minutes is missing data, never a shutout. Context, not a projection input.</li>
      </ul>
    </BoxCard>
  );
}
