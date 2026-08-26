import type { CfbGame, CfbTeam } from "@/data/cfb/types";
import { formatRecord } from "@/lib/cfb/format";
import { formatCfbKickoffParts } from "@/lib/cfb/schedulePresentation";
import { cn } from "@/lib/utils";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

type Props = {
  away: Pick<CfbTeam, "name" | "shortName" | "logo" | "abbreviation" | "primaryColor" | "record">;
  home: Pick<CfbTeam, "name" | "shortName" | "logo" | "abbreviation" | "primaryColor" | "record">;
  game: Pick<CfbGame, "date" | "time">;
  visible: boolean;
};

/**
 * Compact mobile-only 3-column team/game strip: away-color panel, dark
 * center date/kickoff panel, home-color panel — frozen in place while
 * scrolling through Power Comparison / Season Stats / Model panel so it
 * stays clear which side is away vs. home without re-scrolling to the hero.
 * Desktop keeps the existing non-sticky hero-only behavior (never renders there).
 */
export default function CollegeFootballMobileStickyHeader({ away, home, game, visible }: Props) {
  const awayRecord = formatRecord(away.record.wins, away.record.losses, away.record.ties);
  const homeRecord = formatRecord(home.record.wins, home.record.losses, home.record.ties);
  const kickoff = formatCfbKickoffParts(game.date, game.time);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 top-[72px] z-40 grid h-14 grid-cols-3 shadow-md transition-transform duration-200 ease-out sm:hidden",
        visible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div
        className="flex min-w-0 items-center gap-1.5 px-2.5"
        style={{ background: away.primaryColor }}
      >
        <CollegeFootballTeamLogo
          name={away.name}
          logo={away.logo}
          abbreviation={away.abbreviation}
          primaryColor="transparent"
          size="sm"
        />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-xs font-black text-white">{away.abbreviation}</span>
          <span className="text-[9px] font-semibold text-white/70">{awayRecord}</span>
        </span>
      </div>

      <div className="flex flex-col items-center justify-center gap-0.5 bg-slate-900 px-1">
        <span className="text-[9px] font-bold uppercase tracking-wide text-white/60">{kickoff.date}</span>
        {kickoff.time && (
          <span className="text-[10px] font-black leading-tight text-white">{kickoff.time}</span>
        )}
      </div>

      <div
        className="flex min-w-0 items-center justify-end gap-1.5 px-2.5 text-right"
        style={{ background: home.primaryColor }}
      >
        <span className="flex min-w-0 flex-col items-end leading-tight">
          <span className="truncate text-xs font-black text-white">{home.abbreviation}</span>
          <span className="text-[9px] font-semibold text-white/70">{homeRecord}</span>
        </span>
        <CollegeFootballTeamLogo
          name={home.name}
          logo={home.logo}
          abbreviation={home.abbreviation}
          primaryColor="transparent"
          size="sm"
        />
      </div>
    </div>
  );
}
