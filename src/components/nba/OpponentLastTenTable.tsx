import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTATION_GAME_MINUTES, describeStarterGaps, describeStarterMatch, type OpponentBoxGame, type OpponentBoxPlayer, type OpponentBoxTable } from "@/lib/nba/props/boxScoreTables";
import { shortDate } from "@/lib/nba/props/recentForm";
import type { BoardMarket, BoardRow } from "@/lib/nba/props/propsBoard";
import { BODY_CELL, BoxCard, BoxNote, HEAD_CELL, IDENTITY, NUMERIC, SELECTED_COLUMN, STAT_LABEL, TeamTag, fmtAverage, fmtStat } from "@/components/nba/BoxScoreParts";
import { DEFENSE_EMPTY, DefenseRating } from "@/components/nba/DefenseRating";
import { LowSample } from "@/components/nba/boardCells";
import { ROW_FOCUS, rowToggleHandlers } from "@/components/nba/rowToggle";

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;
const BOARD_STATS = ["pts", "reb", "ast"] as const;

const NOTE: Record<Exclude<OpponentBoxTable["status"], "ok">, string> = {
  stale: "This board was built before opponent box scores existed. Rebuild the private preview board to add them.",
  "no-opponent": "The opponent is unknown, so there is no box score to show.",
  none: "The opponent has no completed regular-season game this season yet. Last season is never used to fill it.",
};

interface TableContext {
  market: BoardMarket;
  opponent: string;
  position: string;
  showPosition: boolean;
  showAllPlayers: boolean;
}

const dash = <span className="text-slate-400">–</span>;
const selectedClass = (ctx: TableContext, key: BoardMarket): string => (key === ctx.market ? SELECTED_COLUMN : "");
const titleCase = (text: string): string => `${text[0].toUpperCase()}${text.slice(1)}`;
const STAT_WORD: Record<BoardMarket, string> = { pts: "points", reb: "rebounds", ast: "assists" };

/** Who started at the position in a game, or the plain reason no one is named. Position detail only. */
function StarterCell({ game, ctx }: { game: OpponentBoxGame; ctx: TableContext }) {
  const match = game.starterMatch;
  if (match === null) return dash;
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

/** One opposing player under an opponent game: the box score behind the team figures, most minutes first. */
function PlayerLine({ player, game, ctx }: { player: OpponentBoxPlayer; game: OpponentBoxGame; ctx: TableContext }) {
  const match = ctx.showPosition ? game.starterMatch : null;
  const isMatched = match?.kind === "matched" && match.player === player;
  const isCandidate = match?.kind === "multiple" && match.players.includes(player);
  return (
    <tr
      data-testid="opp-box-player"
      data-game={game.gameId}
      data-starter={player.starter === null ? "unknown" : String(player.starter)}
      data-rotation={player.inRotation ? "true" : "false"}
      data-matched={isMatched ? "true" : "false"}
      className={cn("border-t border-slate-100 bg-white", isMatched && "bg-sky-50", isCandidate && "bg-slate-100")}
    >
      <td className={BODY_CELL} />
      <th scope="row" colSpan={ctx.showPosition ? 2 : 1} className={cn(BODY_CELL, IDENTITY, "font-medium", player.starter ? "text-slate-900" : "text-slate-600")}>
        <span className="inline-flex flex-wrap items-center gap-x-1">
          {player.name}
          {player.starter ? <span className="rounded bg-slate-200 px-1 text-[8px] font-black leading-snug text-slate-700" title="Started, per the source's starter flag">S</span> : null}
          <span className="text-[9px] font-semibold uppercase text-slate-500 max-sm:hidden" title="Estimated primary position, approximate and not a verified lineup spot">{player.position ?? "n/a"}</span>
          {isMatched ? <span className="text-[9px] font-bold text-sky-700" title={`The ${ctx.position} starter the position detail reads`}>matched</span> : null}
          {isCandidate ? <span className="text-[9px] font-bold text-slate-700" title={`One of several starters estimated at ${ctx.position}: not chosen`}>not chosen</span> : null}
        </span>
      </th>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(player.minutes)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selectedClass(ctx, "pts"))}>{fmtStat(player.pts)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selectedClass(ctx, "reb"))}>{fmtStat(player.reb)}</td>
      <td className={cn(BODY_CELL, NUMERIC, selectedClass(ctx, "ast"))}>{fmtStat(player.ast)}</td>
    </tr>
  );
}

/** The players left out of the rotation view of a game, in one line, so the box score still accounts for everyone. */
function OthersLine({ others, game, ctx }: { others: readonly OpponentBoxPlayer[]; game: OpponentBoxGame; ctx: TableContext }) {
  const sum = (field: "minutes" | "pts" | "reb" | "ast"): number => others.reduce((total, p) => total + p[field], 0);
  return (
    <tr data-testid="opp-box-others" data-game={game.gameId} className="border-t border-slate-100 bg-white text-slate-500">
      <td className={BODY_CELL} />
      <th scope="row" colSpan={ctx.showPosition ? 2 : 1} className={cn(BODY_CELL, IDENTITY, "text-[10px] font-medium")} title={`${others.map((p) => `${p.name} ${fmtStat(p.minutes)} min`).join(", ")}`}>
        {others.length} {others.length === 1 ? "other" : "others"} under {ROTATION_GAME_MINUTES} min
      </th>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(sum("minutes"))}</td>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(sum("pts"))}</td>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(sum("reb"))}</td>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(sum("ast"))}</td>
    </tr>
  );
}

/** What every listed player adds up to for the game, so the team figure above it can be checked against the people behind it. */
function ListedTotalLine({ game, ctx }: { game: OpponentBoxGame; ctx: TableContext }) {
  const total = (field: "minutes" | "pts" | "reb" | "ast"): number => game.players.reduce((sum, p) => sum + p[field], 0);
  return (
    <tr data-testid="opp-box-total" data-game={game.gameId} className="border-t border-slate-200 bg-slate-50 font-bold text-slate-700">
      <td className={BODY_CELL} />
      <th scope="row" colSpan={ctx.showPosition ? 2 : 1} className={cn(BODY_CELL, IDENTITY, "text-[10px] uppercase tracking-wide")}>
        {game.versus} listed players
        {game.boxComplete ? null : game.teamPtsSource === "official" ? (
          <span className="ml-1 font-semibold normal-case text-slate-700" title={`The official final score is ${game.teamPtsAllowed}, but the listed players' points add up to ${game.playerPtsSum}: a player row is missing from this box score`}>
            rows sum to {game.playerPtsSum} of {game.teamPtsAllowed}
          </span>
        ) : (
          <span className="ml-1 font-semibold normal-case text-slate-700" title="The listed minutes do not add up to a full game, so a player row may be missing and this is not the team's score">incomplete box score</span>
        )}
      </th>
      <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(total("minutes"))}</td>
      <td className={cn(BODY_CELL, NUMERIC, selectedClass(ctx, "pts"))}>{fmtStat(total("pts"))}</td>
      <td className={cn(BODY_CELL, NUMERIC, selectedClass(ctx, "reb"))}>{fmtStat(total("reb"))}</td>
      <td className={cn(BODY_CELL, NUMERIC, selectedClass(ctx, "ast"))}>{fmtStat(total("ast"))}</td>
    </tr>
  );
}

function teamTitle(game: OpponentBoxGame, stat: BoardMarket, ctx: TableContext): string {
  const total = game.teamAllowed[stat];
  if (total === null) return `${ctx.opponent}'s ${STAT_WORD[stat]} allowed are unknown: the ${game.versus} box score is not a complete game`;
  const how = stat === "pts" ? (game.teamPtsSource === "official" ? "official final score" : "final score, summed from its players") : stat === "reb" ? "the sum of the listed players' rebounds over a complete box score (the player rows carry no team rebounds, so it can run a few low)" : "the sum of the listed players' assists over a complete box score";
  return `${ctx.opponent} allowed ${total} ${STAT_WORD[stat]}: ${game.versus}'s team total (${how})`;
}

function GameGroup({ game, ctx, open, onToggle }: { game: OpponentBoxGame; ctx: TableContext; open: boolean; onToggle: () => void }) {
  const label = `${shortDate(game.date)} ${game.defenseIsHome ? "vs" : "@"} ${game.versus}`;
  const rotation = game.players.filter((p) => p.inRotation);
  const others = game.players.filter((p) => !p.inRotation);
  const shown = ctx.showAllPlayers ? game.players : rotation;
  return (
    <>
      <tr
        data-testid="opp-box-game"
        data-game={game.gameId}
        data-match={game.starterMatch?.kind ?? "none"}
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
        {ctx.showPosition ? <td className={cn(BODY_CELL, IDENTITY, "max-sm:leading-tight")}><StarterCell game={game} ctx={ctx} /></td> : null}
        <td className={cn(BODY_CELL, NUMERIC)}>{dash}</td>
        {BOARD_STATS.map((stat) => (
          <td key={stat} className={cn(BODY_CELL, NUMERIC, "font-bold text-slate-900", selectedClass(ctx, stat))} data-testid={`opp-box-team-${stat}`} title={teamTitle(game, stat, ctx)}>
            {game.teamAllowed[stat] === null ? dash : game.teamAllowed[stat]}
          </td>
        ))}
      </tr>
      {open ? (
        <>
          {shown.map((player, i) => <PlayerLine key={`${game.gameId}-${i}`} player={player} game={game} ctx={ctx} />)}
          {!ctx.showAllPlayers && others.length > 0 ? <OthersLine others={others} game={game} ctx={ctx} /> : null}
          <ListedTotalLine game={game} ctx={ctx} />
        </>
      ) : null}
    </>
  );
}

const buttonClass = "rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500";

/**
 * The opponent's last ten games, newest first. A game row is what the defense allowed as a team: points (the official score),
 * rebounds and assists (team totals over a complete box). Open a game for the opposing players who played, most minutes first,
 * with approximate positions. The opposing starter at the player's estimated position is optional detail behind a toggle: it
 * shows one player's own line per game, never a position total, and says why when no single starter is identified.
 */
export default function OpponentLastTenTable({ row, market }: { row: BoardRow; market: BoardMarket }) {
  const box = row.opponentBox;
  const [openGames, setOpenGames] = useState<ReadonlySet<string>>(() => new Set());
  const [showPosition, setShowPosition] = useState(false);
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const opponent = row.entry.opponent ?? "Opponent";
  const title = `${opponent} last 10 · points allowed and box score`;
  if (box.status !== "ok") return <BoxCard title={title} testId="opp-box-card"><BoxNote testId="opp-box-note">{NOTE[box.status]}</BoxNote></BoxCard>;
  const position = box.position ?? "position n/a";
  const ctx: TableContext = { market, opponent, position, showPosition: showPosition && box.position !== null, showAllPlayers };
  const toggle = (id: string) =>
    setOpenGames((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allOpen = box.games.every((g) => openGames.has(g.gameId));
  const defense = row.opponentDefense;
  const gaps = describeStarterGaps(box.gaps, position);
  const { average } = box;
  return (
    <BoxCard
      title={title}
      testId="opp-box-card"
      subtitle={`${opponent}'s ten most recent completed games, newest first. PTS, REB and AST on a game row are the team totals ${opponent} allowed. Open a game for the opposing players who played, most minutes first.`}
      actions={
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600" data-testid="opp-box-defense">
            DEF RTG
            <DefenseRating entry={defense.entry} strength={defense.strength} team={opponent} emptyWhy={defense.status === "ok" ? "" : DEFENSE_EMPTY[defense.status]} state={defense.status} testId="opp-box-defense-rating" />
          </span>
          <button type="button" data-testid="opp-box-all-players" aria-pressed={showAllPlayers} onClick={() => setShowAllPlayers((v) => !v)} className={buttonClass} title={`Opened games list players with ${ROTATION_GAME_MINUTES}+ minutes; this lists everyone who played`}>
            {showAllPlayers ? "Rotation only" : "All players"}
          </button>
          <button
            type="button"
            data-testid="opp-box-position-toggle"
            aria-pressed={ctx.showPosition}
            aria-disabled={box.position === null}
            onClick={() => {
              if (box.position !== null) setShowPosition((v) => !v);
            }}
            className={cn(buttonClass, box.position === null && "cursor-not-allowed opacity-40")}
            title={box.position === null ? "No estimated position for this player, so there is no position detail" : `Show the opposing ${position} starter, game by game (optional detail)`}
          >
            Position detail
          </button>
          <button type="button" data-testid="opp-box-expand-all" onClick={() => setOpenGames(allOpen ? new Set() : new Set(box.games.map((g) => g.gameId)))} className={buttonClass}>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </span>
      }
    >
      {ctx.showPosition && box.starterData === "none" ? (
        <BoxNote testId="opp-box-starter-note">
          This board's box scores carry no starter status (it was built before that was added), so the {position} starter cannot be named. Team totals and the full opposing box scores are shown. Rebuild the private preview board to add starters.
        </BoxNote>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] max-sm:text-[10px]" data-testid="opp-box-table">
          <caption className="sr-only">{`${opponent}'s last ${games(box.games.length)}, newest to oldest: the team points, rebounds and assists it allowed${ctx.showPosition ? `, and the opposing ${position} starter` : ""}`}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)}>Date</th>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)} title="The team that faced this defense; its players are listed"><span className="max-sm:sr-only">Opp </span>team</th>
              {ctx.showPosition ? (
                <th scope="col" className={cn(HEAD_CELL, IDENTITY)} title="The opposing starter estimated at the player's position, per the source's starter flags. One player's own line, never a sum.">{position} starter</th>
              ) : null}
              <th scope="col" className={cn(HEAD_CELL, NUMERIC)}>MIN</th>
              {BOARD_STATS.map((key) => (
                <th key={key} scope="col" aria-label={`${STAT_LABEL[key]}: team ${STAT_WORD[key]} allowed on a game row, the player's own on a player row`} className={cn(HEAD_CELL, NUMERIC, selectedClass(ctx, key))} title={`${titleCase(STAT_WORD[key])} ${opponent} allowed as a team on a game row; the player's own on a player row`}>
                  {STAT_LABEL[key]}
                </th>
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
              <th scope="row" colSpan={ctx.showPosition ? 3 : 2} className={cn(BODY_CELL, IDENTITY, "border-t border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600")}>
                L10 team avg allowed
                <span className="ml-1 font-semibold normal-case text-slate-500" data-testid="opp-box-average-note">
                  {games(box.games.length)}
                  {box.isSmallSample ? ", small sample" : ""}
                </span>
              </th>
              <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200")}>{dash}</td>
              {BOARD_STATS.map((stat) => (
                <td
                  key={stat}
                  className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selectedClass(ctx, stat))}
                  data-testid={`opp-box-average-team-${stat}`}
                  title={box.teamKnown[stat] < box.games.length ? `Average of the ${box.teamKnown[stat]} of ${games(box.games.length)} with a complete opposing box score` : undefined}
                >
                  {box.teamAverage[stat] === null ? "–" : fmtAverage(box.teamAverage[stat] as number)}
                  {box.teamKnown[stat] < box.games.length ? <LowSample why={`Only ${box.teamKnown[stat]} of ${games(box.games.length)} have a complete opposing box score`} games={box.teamKnown[stat]} /> : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="space-y-0.5 border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-slate-600" data-testid="opp-box-limits">
        {ctx.showPosition ? (
          <li data-testid="opp-box-coverage-summary">
            {position} starter identified in {box.gamesWithFigure} of {games(box.games.length)}
            {gaps ? `; not counted: ${gaps}` : ""}
            {average ? `. Those starters averaged ${fmtAverage(average.pts)} PTS, ${fmtAverage(average.reb)} REB and ${fmtAverage(average.ast)} AST` : ""}. A game without exactly one identified starter is left out, never filled by a guess.
          </li>
        ) : null}
        <li>
          Team points are the official final score; rebounds and assists are the sum of the listed players over a complete box score (player rows carry no team rebounds, so rebounds can run a few low), left blank when the box score is not a complete game. Positions are each player's estimated primary position (the one Defense vs. Position uses), approximate and not a verified lineup spot; S marks the source's starter flag. Regular-season games only. Context, not a projection input.
        </li>
      </ul>
    </BoxCard>
  );
}
