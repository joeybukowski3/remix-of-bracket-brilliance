import { Link } from "react-router-dom";
import type { CfbConferenceMeta, CfbTeam } from "@/data/cfb/types";
import { sortConferenceStandings } from "@/lib/cfb/standings";
import { formatRank, formatRecord } from "@/lib/cfb/format";
import { getCfbConferencePath, getCfbTeamPath } from "@/lib/cfb/routes";
import { getSosHeatClass } from "@/lib/cfb/sosPresentation";
import { cn } from "@/lib/utils";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";
import CollegeFootballRatingCell from "./CollegeFootballRatingCell";

type Props = {
  conference: CfbConferenceMeta;
  teams: CfbTeam[];
};

export default function ConferenceStandingsCard({ conference, teams }: Props) {
  const sorted = sortConferenceStandings(teams);

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
          {conference.name}
        </h2>
        <Link
          to={getCfbConferencePath(conference.slug)}
          className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 hover:underline"
        >
          View
        </Link>
      </div>

      {/* Desktop table */}
      <div
        role="region"
        aria-label={`${conference.name} standings`}
        tabIndex={0}
        className="relative hidden overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:block"
      >
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              <th scope="col" className="px-2 py-2 text-left">Team</th>
              <th scope="col" className="px-1 py-2 text-center">Conf</th>
              <th scope="col" className="px-1 py-2 text-center">Overall</th>
              <th scope="col" className="px-1 py-2 text-center">JKB</th>
              <th scope="col" className="px-1 py-2 text-center">SOS</th>
              <th scope="col" className="px-1 py-2 text-center">Rem</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team) => {
              const confRec = formatRecord(
                team.record.conferenceWins,
                team.record.conferenceLosses,
                team.record.conferenceTies,
              );
              const overall = formatRecord(
                team.record.wins,
                team.record.losses,
                team.record.ties,
              );
              return (
                <tr key={team.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-0">
                    <Link
                      to={getCfbTeamPath(team.slug)}
                      className="flex items-center gap-2 px-2 py-1.5 font-semibold text-slate-800 hover:text-sky-800 hover:underline"
                    >
                      <span
                        className="h-6 w-[3px] rounded-full"
                        style={{ background: team.primaryColor }}
                        aria-hidden
                      />
                      <CollegeFootballTeamLogo
                        name={team.name}
                        logo={team.logo}
                        abbreviation={team.abbreviation}
                        primaryColor={team.primaryColor}
                        size="sm"
                      />
                      <span className="whitespace-nowrap">{team.shortName}</span>
                    </Link>
                  </td>
                  <td className="px-1 text-center tabular-nums text-slate-700">{confRec}</td>
                  <td className="px-1 text-center font-semibold tabular-nums text-slate-800">{overall}</td>
                  <td className="px-1 text-center">
                    <CollegeFootballRatingCell
                      value={team.ratings.jkbPowerRating}
                      rank={team.ratings.jkbRank}
                    />
                  </td>
                  <td className={cn("px-1 text-center font-semibold tabular-nums", getSosHeatClass(team.ratings.sosPlayedRank))}>
                    {formatRank(team.ratings.sosPlayedRank)}
                  </td>
                  <td className={cn("px-1 text-center font-semibold tabular-nums", getSosHeatClass(team.ratings.sosRemainingRank))}>
                    {formatRank(team.ratings.sosRemainingRank)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile compact list */}
      <ul className="divide-y divide-slate-100 sm:hidden">
        {sorted.map((team) => {
          const confRec = formatRecord(
            team.record.conferenceWins,
            team.record.conferenceLosses,
            team.record.conferenceTies,
          );
          const overall = formatRecord(
            team.record.wins,
            team.record.losses,
            team.record.ties,
          );
          return (
            <li key={team.id}>
              <Link
                to={getCfbTeamPath(team.slug)}
                className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50"
              >
                <CollegeFootballTeamLogo
                  name={team.name}
                  logo={team.logo}
                  abbreviation={team.abbreviation}
                  primaryColor={team.primaryColor}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900">{team.shortName}</span>
                    <CollegeFootballRatingCell
                      value={team.ratings.jkbPowerRating}
                      rank={team.ratings.jkbRank}
                      className="shrink-0"
                    />
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">{confRec} conf</span>
                    <span>{overall}</span>
                    <span className={cn("rounded px-1 font-semibold", getSosHeatClass(team.ratings.sosPlayedRank))}>
                      SOS {formatRank(team.ratings.sosPlayedRank)}
                    </span>
                    <span className={cn("rounded px-1 font-semibold", getSosHeatClass(team.ratings.sosRemainingRank))}>
                      Rem {formatRank(team.ratings.sosRemainingRank)}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
