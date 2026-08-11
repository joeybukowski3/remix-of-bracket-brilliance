import type { CfbTeam } from "@/data/cfb/types";
import { getConferenceMeta } from "@/data/cfb/conferences";
import type { RankingsSortKey } from "@/lib/cfb/rankings";
import { formatRecord, formatRank } from "@/lib/cfb/format";
import { getCfbTeamPath } from "@/lib/cfb/routes";
import { getSosHeatClass } from "@/lib/cfb/sosPresentation";
import { Link } from "react-router-dom";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";
import CollegeFootballRatingCell from "./CollegeFootballRatingCell";
import { cn } from "@/lib/utils";

const HEAD =
  "bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600";

type Props = {
  teams: CfbTeam[];
  sortKey?: RankingsSortKey;
  onSort?: (key: RankingsSortKey) => void;
  showConferenceColumn?: boolean;
  emptyMessage?: string;
};

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  if (!onClick) return <span>{label}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-0.5 font-semibold uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
        active ? "text-slate-900 underline" : "hover:text-slate-900",
      )}
    >
      {label}
    </button>
  );
}

export default function CollegeFootballRankingsTable({
  teams,
  sortKey = "jkbRank",
  onSort,
  showConferenceColumn = true,
  emptyMessage = "No teams available.",
}: Props) {
  if (teams.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      role="region"
      aria-label="College Football rankings"
      tabIndex={0}
      className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
    >
      {/* Desktop / tablet table */}
      <table className="hidden w-full min-w-[640px] text-xs md:table">
        <thead>
          <tr className={HEAD}>
            <th scope="col" className="px-2 py-2 text-center">
              <SortButton label="Rank" active={sortKey === "jkbRank"} onClick={onSort ? () => onSort("jkbRank") : undefined} />
            </th>
            <th scope="col" className="px-2 py-2 text-left">Team</th>
            {showConferenceColumn && (
              <th scope="col" className="px-2 py-2 text-left">Conf</th>
            )}
            <th scope="col" className="px-2 py-2 text-center">Record</th>
            <th scope="col" className="px-1 py-2 text-center">AP</th>
            <th scope="col" className="px-1 py-2 text-center">
              <SortButton label="JKB Power" active={sortKey === "jkbPowerRating"} onClick={onSort ? () => onSort("jkbPowerRating") : undefined} />
            </th>
            <th scope="col" className="px-1 py-2 text-center">
              <SortButton label="Offense" active={sortKey === "offensiveRating"} onClick={onSort ? () => onSort("offensiveRating") : undefined} />
            </th>
            <th scope="col" className="px-1 py-2 text-center">
              <SortButton label="Defense" active={sortKey === "defensiveRating"} onClick={onSort ? () => onSort("defensiveRating") : undefined} />
            </th>
            <th scope="col" className="px-1 py-2 text-center">
              <SortButton label="SOS Played" active={sortKey === "sosPlayedRank"} onClick={onSort ? () => onSort("sosPlayedRank") : undefined} />
            </th>
            <th scope="col" className="px-1 py-2 text-center">
              <SortButton label="SOS Rem" active={sortKey === "sosRemainingRank"} onClick={onSort ? () => onSort("sosRemainingRank") : undefined} />
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const conf = getConferenceMeta(team.conference);
            return (
              <tr key={team.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                  {team.ratings.jkbRank ?? "—"}
                </td>
                <td className="p-0">
                  <Link
                    to={getCfbTeamPath(team.slug)}
                    className="flex items-center gap-2 px-2 py-1.5 font-semibold text-slate-800 hover:text-sky-800 hover:underline"
                  >
                    <CollegeFootballTeamLogo
                      name={team.name}
                      logo={team.logo}
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      size="sm"
                    />
                    {team.name}
                  </Link>
                </td>
                {showConferenceColumn && (
                  <td className="px-2 py-1.5 text-slate-500">{conf.shortName}</td>
                )}
                <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                  {formatRecord(team.record.wins, team.record.losses, team.record.ties)}
                </td>
                <td className="px-1 py-1.5 text-center font-semibold tabular-nums text-slate-700">
                  {formatRank(team.ratings.apRank)}
                </td>
                <td className="px-1 py-1.5 text-center">
                  <CollegeFootballRatingCell
                    value={team.ratings.jkbPowerRating}
                    rank={team.ratings.jkbRank}
                  />
                </td>
                <td className="px-1 py-1.5 text-center">
                  <CollegeFootballRatingCell value={team.ratings.offensiveRating} />
                </td>
                <td className="px-1 py-1.5 text-center">
                  <CollegeFootballRatingCell value={team.ratings.defensiveRating} />
                </td>
                <td className={cn("px-1 py-1.5 text-center font-semibold tabular-nums", getSosHeatClass(team.ratings.sosPlayedRank))}>
                  {formatRank(team.ratings.sosPlayedRank)}
                </td>
                <td className={cn("px-1 py-1.5 text-center font-semibold tabular-nums", getSosHeatClass(team.ratings.sosRemainingRank))}>
                  {formatRank(team.ratings.sosRemainingRank)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile stacked cards — not desktop-only table markup */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {teams.map((team) => {
          const conf = getConferenceMeta(team.conference);
          return (
            <li key={team.id}>
              <Link
                to={getCfbTeamPath(team.slug)}
                className="flex gap-3 px-3 py-2.5 hover:bg-slate-50"
              >
                <span className="w-6 shrink-0 pt-1 text-center text-sm font-bold tabular-nums text-slate-700">
                  {team.ratings.jkbRank ?? "—"}
                </span>
                <CollegeFootballTeamLogo
                  name={team.name}
                  logo={team.logo}
                  abbreviation={team.abbreviation}
                  primaryColor={team.primaryColor}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900">{team.name}</span>
                    <CollegeFootballRatingCell
                      value={team.ratings.jkbPowerRating}
                      rank={team.ratings.jkbRank}
                      className="shrink-0"
                    />
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    <span>{conf.shortName}</span>
                    <span className="font-semibold text-slate-700">
                      {formatRecord(team.record.wins, team.record.losses, team.record.ties)}
                    </span>
                    <span>AP {formatRank(team.ratings.apRank)}</span>
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
    </div>
  );
}
