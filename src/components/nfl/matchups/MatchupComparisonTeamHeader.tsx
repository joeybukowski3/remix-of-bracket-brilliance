import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { cn } from "@/lib/utils";
import type { NflMatchup } from "@/lib/nfl/matchups";

type Unit = "Offense" | "Defense";

/** Compact team identity shared by every Overview and Team Comparison card. */
export default function MatchupComparisonTeamHeader({
  matchup,
  sticky = false,
  context,
  unit,
  possession,
  className,
}: {
  matchup: NflMatchup;
  sticky?: boolean;
  context?: { away: string; home: string };
  unit?: { away: Unit; home: Unit };
  /** Screen-reader-only possession announcement, e.g. "… has the ball". */
  possession?: string;
  className?: string;
}) {
  const { away, home } = matchup;
  const unitShort = (value: Unit) => (value === "Offense" ? "Off" : "Def");
  const unitRole = (value: Unit) => (value === "Offense" ? "Attacking" : "Defending");
  const awayLabel = `${away.abbr.toUpperCase()}${unit ? ` ${unitShort(unit.away)}` : ""}`;
  const homeLabel = `${home.abbr.toUpperCase()}${unit ? ` ${unitShort(unit.home)}` : ""}`;
  const awayRole = unit ? unitRole(unit.away) : context?.away;
  const homeRole = unit ? unitRole(unit.home) : context?.home;

  return (
    <div
      className={cn(
        "matchup-comparison-team-header matchup-comparison-card__team-header grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 border-b border-slate-200",
        sticky && "matchup-comparison-team-header--sticky",
        className
      )}
    >
      {possession && <span className="sr-only">{possession}</span>}
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <div className="min-w-0 text-right">
          <div className="text-[11px] font-black uppercase leading-none tracking-tight text-slate-900">
            {awayLabel}
          </div>
          {awayRole && <div className="matchup-comparison-card__team-role">{awayRole}</div>}
          <div className="sr-only">{away.teamName}</div>
        </div>
        <NflTeamCrest team={away} side="away" size={20} label={`${away.teamName} (away)`} />
      </div>
      <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">vs</span>
      <div className="flex min-w-0 items-center justify-start gap-1.5">
        <NflTeamCrest team={home} side="home" size={20} label={`${home.teamName} (home)`} />
        <div className="min-w-0 text-left">
          <div className="text-[11px] font-black uppercase leading-none tracking-tight text-slate-900">
            {homeLabel}
          </div>
          {homeRole && <div className="matchup-comparison-card__team-role">{homeRole}</div>}
          <div className="sr-only">{home.teamName}</div>
        </div>
      </div>
    </div>
  );
}
