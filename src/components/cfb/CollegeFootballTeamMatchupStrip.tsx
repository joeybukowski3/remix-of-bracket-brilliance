import type { CfbTeam } from "@/data/cfb/types";
import { formatRecord } from "@/lib/cfb/format";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

type Props = {
  away: Pick<CfbTeam, "name" | "shortName" | "logo" | "abbreviation" | "primaryColor" | "record">;
  home: Pick<CfbTeam, "name" | "shortName" | "logo" | "abbreviation" | "primaryColor" | "record">;
};

/**
 * Compact away-logo / short-name / VS chip / short-name / home-logo strip with
 * a split team-color top border. Shared markup for the mobile hero's top
 * strip and the fixed sticky header it freezes into on scroll.
 */
export default function CollegeFootballTeamMatchupStrip({ away, home }: Props) {
  const awayRecord = formatRecord(away.record.wins, away.record.losses, away.record.ties);
  const homeRecord = formatRecord(home.record.wins, home.record.losses, home.record.ties);

  return (
    <div className="bg-white">
      <div className="relative flex h-1" aria-hidden="true">
        <div className="flex-1" style={{ background: away.primaryColor }} />
        <div className="flex-1" style={{ background: home.primaryColor }} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2">
        <div className="flex items-center justify-end gap-2 overflow-hidden">
          <CollegeFootballTeamLogo
            name={away.name}
            logo={away.logo}
            abbreviation={away.abbreviation}
            primaryColor={away.primaryColor}
            size="md"
          />
          <span className="flex min-w-0 flex-col items-end leading-tight">
            <span className="truncate text-xs font-black text-slate-900">{away.abbreviation}</span>
            <span className="text-[9px] font-semibold text-slate-400">{awayRecord}</span>
          </span>
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black uppercase tracking-wide text-white">
          vs
        </span>
        <div className="flex items-center justify-start gap-2 overflow-hidden">
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="truncate text-xs font-black text-slate-900">{home.abbreviation}</span>
            <span className="text-[9px] font-semibold text-slate-400">{homeRecord}</span>
          </span>
          <CollegeFootballTeamLogo
            name={home.name}
            logo={home.logo}
            abbreviation={home.abbreviation}
            primaryColor={home.primaryColor}
            size="md"
          />
        </div>
      </div>
    </div>
  );
}
