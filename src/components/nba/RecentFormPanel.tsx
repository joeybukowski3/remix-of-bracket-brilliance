import type { ReactNode } from "react";
import { LowSample } from "@/components/nba/boardCells";
import RecentBars from "@/components/nba/RecentBars";
import { L10_GAMES, type OpponentLastTen, type PlayerLastTen } from "@/lib/nba/props/recentForm";
import type { BoardMarket, BoardRow } from "@/lib/nba/props/propsBoard";

const STAT: Record<BoardMarket, string> = { pts: "PTS", reb: "REB", ast: "AST" };
const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

function Panel({ title, subtitle, children, testId }: { title: string; subtitle?: string; children: ReactNode; testId: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <h5 className="text-[11px] font-bold text-slate-900">{title}</h5>
      {subtitle ? <p className="mb-1.5 text-[10px] text-slate-600">{subtitle}</p> : null}
      {children}
    </div>
  );
}

const Note = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700" data-testid={testId}>
    {children}
  </p>
);

function Summary({ average, n, small, label, testId, withFigure = n }: { average: number | null; n: number; small: boolean; label: string; testId: string; withFigure?: number }) {
  return (
    <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[11px] text-slate-700" data-testid={testId}>
      <span className="text-[18px] font-bold leading-none tabular-nums text-slate-950">{average === null ? "—" : average.toFixed(1)}</span>
      <span>{label}</span>
      <span className="font-semibold text-slate-900">
        {withFigure < n ? `average of ${withFigure} of ${n} games` : games(n)}
        {small ? <LowSample why={`Small sample: ${games(n)}, fewer than the ${L10_GAMES} a full window holds`} /> : null}
      </span>
      {small ? <span className="font-semibold text-amber-800">small sample ({n} of {L10_GAMES})</span> : null}
    </p>
  );
}

function PlayerSide({ view, market, name }: { view: PlayerLastTen; market: BoardMarket; name: string }) {
  const stat = STAT[market];
  const body = () => {
    if (view.status === "stale") return <Note testId="player-l10-note">This board was built before game-by-game results existed. Rebuild the private preview board to add them.</Note>;
    if (view.status === "none") return <Note testId="player-l10-note">No completed games this season yet, so there is no last-ten window. Last season is never used to fill it.</Note>;
    return (
      <>
        <Summary average={view.average} n={view.games} small={view.isSmallSample} label={`${stat} per game`} testId="player-l10-summary" />
        <RecentBars points={view.points} stat={stat} average={view.average} label={`${name} last ${view.games} ${stat} results`} tone="player" testId="player-l10-chart" />
      </>
    );
  };
  return (
    <Panel title={`Player last 10 · ${stat}`} subtitle="The player's own completed games this season, before this game, oldest to newest. Did-not-play and zero-minute games are left out." testId="player-l10-panel">
      {body()}
    </Panel>
  );
}

const OPPONENT_NOTE: Record<Exclude<OpponentLastTen["status"], "ok">, string> = {
  stale: "This board was built before opponent last-ten sequences existed. Rebuild the private preview board to add them.",
  "no-position": "No estimated position for this player, so there is no opponent-vs-position window to show.",
  "no-opponent": "The opponent is unknown, so there is no window to show.",
  none: "The opponent has no completed game this season with opposing minutes attributed to a position yet. Last season is never used to fill the window.",
};

function OpponentSide({ view, market, opponent, position }: { view: OpponentLastTen; market: BoardMarket; opponent: string; position: string }) {
  const stat = STAT[market];
  const gaps = view.games - view.gamesWithFigure;
  const body = () => {
    if (view.status !== "ok") return <Note testId="opp-l10-note">{OPPONENT_NOTE[view.status]}</Note>;
    return (
      <>
        <Summary average={view.average} n={view.games} small={view.isSmallSample} withFigure={view.gamesWithFigure} label={`${stat} allowed per game`} testId="opp-l10-summary" />
        <RecentBars points={view.points} stat={stat} average={view.average} label={`${opponent} last ${view.games} games, ${stat} allowed to ${position}`} tone="opponent" testId="opp-l10-chart" />
        <ul className="mt-1 space-y-0.5 text-[10px] text-slate-600" data-testid="opp-l10-limits">
          <li>
            Sample: {games(view.games)} of {opponent}'s {view.seasonGames} completed this season{view.isSmallSample ? " (a small sample, not padded to ten)" : ""}. Each bar is one {opponent} game.
          </li>
          <li>{view.coverage === null ? "No opposing minutes in this window." : `Attributed minutes: ${Math.round(view.coverage * 100)}% of opposing players' minutes had an estimated position; the rest are not counted, so each figure is a floor, not a full total.`}</li>
          {gaps > 0 ? <li>{games(gaps)} with no attributed minutes shown as gaps and left out of the average.</li> : null}
          <li>Estimated primary position, regular-season games only; context, not a projection input.</li>
        </ul>
      </>
    );
  };
  return (
    <Panel title={`${opponent} last 10 · ${stat} allowed to ${position}`} subtitle="The opponent's ten most recent completed games, one bar per game, summed over the opposing players at this estimated position." testId="opp-l10-panel">
      {body()}
    </Panel>
  );
}

/** The two last-ten charts for a row: the player's own results, and what the opponent allowed to the player's estimated position. */
export default function RecentFormPanel({ row, market }: { row: BoardRow; market: BoardMarket }) {
  const { entry, dvp } = row;
  const position = dvp.kind === "ok" ? dvp.position : "position n/a";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PlayerSide view={row.playerL10} market={market} name={entry.playerName} />
      <OpponentSide view={row.opponentL10} market={market} opponent={entry.opponent ?? "Opponent"} position={position} />
    </div>
  );
}
