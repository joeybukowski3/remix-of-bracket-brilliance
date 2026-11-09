import { cn } from "@/lib/utils";
import { LowSample } from "@/components/nba/boardCells";
import { MIN_GAMES_FOR_STRENGTH, type DefenseStrength, type TeamDefenseEntry } from "@/lib/nba/props/recentForm";

const STRENGTH: Record<DefenseStrength, { label: string; word: string; tone: string }> = {
  strong: { label: "STR", word: "Strong", tone: "bg-slate-800 text-white ring-slate-800" },
  average: { label: "AVG", word: "Average", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  weak: { label: "WK", word: "Weak", tone: "bg-sky-50 text-sky-800 ring-sky-300" },
};

/** Why a rating is missing, by the state of the row's `opponentDefense` (the board column and the opponent card read this one table). */
export const DEFENSE_EMPTY = {
  stale: "This board was built before DEF RTG existed; rebuild the private preview board to add it",
  "no-opponent": "Opponent unknown",
  none: "The opponent has no earlier usable game this season, so it has no rating yet",
} as const;

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

interface DefenseRatingProps {
  /** The rating before the game, or null when there is none (then `emptyWhy` says why). */
  entry: TeamDefenseEntry | null;
  strength: DefenseStrength | null;
  team: string;
  emptyWhy: string;
  testId: string;
  /** Written to `data-state` on an empty cell, so a test or a reader can tell the reasons apart. */
  state?: string;
  className?: string;
}

/**
 * A team's pregame defensive rating: points allowed per 100 estimated possessions in its games BEFORE the date (lower is
 * stronger), its league rank, and a strong / average / weak chip once the sample reaches MIN_GAMES_FOR_STRENGTH; under it, the
 * existing amber small-sample marker with the game count. One component for the player's Last 10 table, the opponent card and
 * the board column, so they can never read differently.
 */
export function DefenseRating({ entry, strength, team, emptyWhy, testId, state = "none", className }: DefenseRatingProps) {
  if (entry === null) {
    return (
      <span className={cn("text-slate-400", className)} title={emptyWhy} data-testid={testId} data-state={state}>
        –
      </span>
    );
  }
  const chip = strength ? STRENGTH[strength] : null;
  const small = entry.games < MIN_GAMES_FOR_STRENGTH;
  return (
    <span
      className={cn("inline-flex flex-wrap items-center justify-center gap-x-1", className)}
      data-testid={testId}
      data-state="rated"
      data-strength={strength ?? "none"}
      title={`${team} allowed ${entry.rating.toFixed(1)} points per 100 estimated possessions in its ${games(entry.games)} before this game (league ${entry.leagueRating.toFixed(1)}); rank ${entry.rank} of ${entry.rankedOf}, 1 = stingiest.${small ? ` Under ${MIN_GAMES_FOR_STRENGTH} games: noisy, so no strong / average / weak label.` : ""}`}
    >
      <span className="font-semibold text-slate-900">{entry.rating.toFixed(1)}</span>
      <span className="text-[9px] text-slate-500">#{entry.rank}</span>
      {chip ? (
        <span className={cn("rounded px-1 text-[8px] font-black leading-snug ring-1 ring-inset", chip.tone)}>
          <span aria-hidden>{chip.label}</span>
          <span className="sr-only">{`${chip.word} defense`}</span>
        </span>
      ) : null}
      {small ? <LowSample why={`Only ${games(entry.games)} before this one: the rating is noisy, so it has no strong / average / weak label`} games={entry.games} className="ml-0" /> : null}
    </span>
  );
}
