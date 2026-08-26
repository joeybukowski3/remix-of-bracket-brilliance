import { cn } from "@/lib/utils";
import type { NflYardageWeekMatchup } from "@/lib/nfl/props/review/yardageWeekMatchups";
import { TeamLogo } from "./NflYardageReviewTeamCell";

/**
 * Replaces the old 32-team filter row with one pill per scheduled Week 1
 * game (16 pills instead of 32), built from `buildYardageWeekMatchups` --
 * never a hardcoded game list. Selecting a pill filters to both teams in
 * that game (matched by `gameId`, not by either team abbr individually).
 */
export function NflYardageMatchupFilterChips({
  matchups,
  value,
  onChange,
}: {
  matchups: readonly NflYardageWeekMatchup[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Matchup"
      className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0"
    >
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={value === "all"}
        className={cn(
          "shrink-0 rounded border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
          value === "all"
            ? "border-sky-700 bg-sky-700 text-white shadow-sm"
            : "border-sky-200 bg-sky-50/60 text-sky-800 hover:border-sky-400 hover:bg-sky-100",
        )}
      >
        All Matchups
      </button>
      {matchups.map((matchup) => {
        const selected = value === matchup.gameId;
        return (
          <button
            key={matchup.gameId}
            type="button"
            onClick={() => onChange(matchup.gameId)}
            aria-pressed={selected}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
              selected
                ? "border-sky-700 bg-sky-700 text-white shadow-sm"
                : "border-sky-200 bg-sky-50/60 text-sky-800 hover:border-sky-400 hover:bg-sky-100",
            )}
          >
            <TeamLogo abbr={matchup.awayAbbr} />
            <span className="uppercase">{matchup.awayAbbr}</span>
            <span aria-hidden className={cn("text-[9px]", selected ? "text-sky-100" : "text-sky-400")}>@</span>
            <span className="uppercase">{matchup.homeAbbr}</span>
            <TeamLogo abbr={matchup.homeAbbr} />
          </button>
        );
      })}
    </div>
  );
}
