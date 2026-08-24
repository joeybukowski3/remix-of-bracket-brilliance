import { ChevronDown } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { cn } from "@/lib/utils";

/** Shared light-shell treatment for the Weekly and ROS fantasy boards. */
export const FANTASY_TABLE_SHELL =
  "overflow-hidden rounded-lg border border-slate-200 bg-white";

/** Header cells use a slightly stronger rule than the data grid below them. */
export const FANTASY_TABLE_HEADER_CELL =
  "border-b border-r border-slate-200 last:border-r-0";

/** Quiet cell grid shared by fantasy ranking tables at every breakpoint. */
export const FANTASY_TABLE_BODY_CELL =
  "border-b border-r border-slate-100 last:border-r-0";

export function FantasyPlayerIdentity({
  player,
  team,
  compact = false,
}: {
  player: string;
  team?: string;
  compact?: boolean;
}) {
  const normalizedTeam = team?.toUpperCase();
  const hasTeam = Boolean(normalizedTeam && normalizedTeam !== "FA");

  return (
    <div
      data-team-logo={normalizedTeam ?? "FA"}
      className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}
    >
      <TeamLogo
        name={normalizedTeam ?? "FA"}
        logo={hasTeam ? nflLogoUrl(normalizedTeam!) : undefined}
        className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")}
      />
      <div className="flex min-w-0 items-center gap-1.5">
        {player && (
          <div
            className={cn(
              "truncate font-bold text-slate-950",
              "text-[12px] leading-4",
            )}
          >
            {player}
          </div>
        )}
        <div
          className={cn(
            "shrink-0 font-bold uppercase text-slate-500",
            "text-[10px] leading-4",
          )}
        >
          {normalizedTeam ?? "FA"}
        </div>
      </div>
    </div>
  );
}

export function FantasyExpandControl({
  label,
  expanded,
  onClick,
  className,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex min-h-8 min-w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 group-hover:text-slate-700",
        className,
      )}
    >
      <ChevronDown
        aria-hidden
        className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
      />
    </button>
  );
}
