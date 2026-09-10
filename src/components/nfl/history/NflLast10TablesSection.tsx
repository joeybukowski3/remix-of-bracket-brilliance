/**
 * Shared layout for the Player Last 10 + Opponent Last 10 pair.
 *
 * Rendered identically by the NFL Yardage Props Review detail panel and the
 * NFL Fantasy weekly player detail -- both pass the same shaped props and get
 * the same two shared tables (`NflPlayerLast10Table` / `NflOpponentLast10Table`).
 *
 * Visual model: a pale-yellow "shell" card sits *behind* each table; the data
 * table itself keeps the app's neutral white row styling. The pronounced
 * outer border lives on the shell, not on every cell.
 *
 * Responsive:
 *   - >= lg: the two shells sit side by side, ~50/50. Each table keeps its own
 *     horizontal scroller, so a wide table scrolls inside its shell rather
 *     than crushing columns or overflowing the page.
 *   - < lg: the shells stack vertically -- Player Last 10 first, Opponent second.
 */
import type { ReactNode } from "react";
import NflPlayerLast10Table, { type NflYardagePlayerCurrentMatchup } from "./NflPlayerLast10Table";
import NflOpponentLast10Table, { type NflYardageOpponentCurrentMatchup } from "./NflOpponentLast10Table";
import type { lookupPlayerHistory, lookupOpponentHistory } from "@/lib/nfl/props/review/yardageHistoryView";

/** Pale-yellow shell card. The table inside keeps its own white/neutral styling. */
export function NflLast10Card({ title, tone, children }: { title: string; tone: "sky" | "violet"; children: ReactNode }) {
  const titleTone = tone === "sky" ? "text-sky-800" : "text-violet-800";
  return (
    <section className="min-w-0 rounded-lg border-2 border-amber-300 bg-amber-50/70 p-2 shadow-sm md:p-2.5">
      <h3 className={`mb-1.5 text-[11px] font-bold uppercase tracking-wide ${titleTone}`}>{title}</h3>
      {children}
    </section>
  );
}

export type NflLast10TablesSectionProps = {
  playerName: string;
  opponentAbbr: string;
  /** Position slice for the Opponent table heading ("QB" for the passing market). */
  position: string;
  playerHistory: ReturnType<typeof lookupPlayerHistory>;
  opponentHistory: ReturnType<typeof lookupOpponentHistory>;
  currentLine: number | null;
  historyError: boolean;
  playerCurrentMatchup: NflYardagePlayerCurrentMatchup | null;
  opponentCurrentMatchup: NflYardageOpponentCurrentMatchup | null;
  teamByGame: ReadonlyMap<string, string>;
  /** Render just one of the two tables (e.g. one per mobile accordion). Default: both, side by side at `xl`. */
  only?: "player" | "opponent";
  /** Drop the pale-yellow shell card -- for hosts that supply their own container (e.g. a mobile accordion body). */
  unwrapped?: boolean;
};

export default function NflLast10TablesSection({
  playerName,
  opponentAbbr,
  position,
  playerHistory,
  opponentHistory,
  currentLine,
  historyError,
  playerCurrentMatchup,
  opponentCurrentMatchup,
  teamByGame,
  only,
  unwrapped = false,
}: NflLast10TablesSectionProps) {
  const unavailable = <p className="text-[11px] text-slate-400">Last-10 history unavailable this run.</p>;
  const playerTable = historyError ? unavailable : (
    <NflPlayerLast10Table playerName={playerName} history={playerHistory} currentLine={currentLine} currentMatchup={playerCurrentMatchup} compact />
  );
  const opponentTable = historyError ? unavailable : (
    <NflOpponentLast10Table
      opponentAbbr={opponentAbbr}
      position={position}
      history={opponentHistory}
      currentLine={currentLine}
      currentMatchup={opponentCurrentMatchup}
      teamByGame={teamByGame}
      compact
    />
  );

  const playerBlock = unwrapped ? playerTable : <NflLast10Card title="Player Last 10" tone="sky">{playerTable}</NflLast10Card>;
  const opponentBlock = unwrapped ? opponentTable : <NflLast10Card title="Opponent Last 10" tone="violet">{opponentTable}</NflLast10Card>;

  if (only === "player") return playerBlock;
  if (only === "opponent") return opponentBlock;

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
      {playerBlock}
      {opponentBlock}
    </div>
  );
}
