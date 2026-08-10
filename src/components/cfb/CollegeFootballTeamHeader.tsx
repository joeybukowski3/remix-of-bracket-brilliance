import type { CfbTeam } from "@/data/cfb/types";
import { getConferenceMeta } from "@/data/cfb/conferences";
import { formatNullableNumber, formatRank, formatRecord } from "@/lib/cfb/format";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

type Props = {
  team: CfbTeam;
};

export default function CollegeFootballTeamHeader({ team }: Props) {
  const conf = getConferenceMeta(team.conference);
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);

  return (
    <header className="flex flex-wrap items-start gap-4 border-b border-slate-200 pb-4">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-white p-2"
        style={{ boxShadow: `inset 3px 0 0 ${team.primaryColor}` }}
      >
        <CollegeFootballTeamLogo
          name={team.name}
          logo={team.logo}
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          size="lg"
          className="h-12 w-12"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {conf.name}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
          {team.name} {team.mascot}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="font-semibold tabular-nums text-slate-900">{record}</span>
          <span>
            {formatRank(team.ratings.jkbRank)} JKB
          </span>
          <span>
            {formatNullableNumber(team.ratings.jkbPowerRating)} Power Rating
          </span>
        </div>
      </div>
    </header>
  );
}
