import { Link } from "react-router-dom";
import type { CfbTeam } from "@/data/cfb/types";
import { getConferenceMeta } from "@/data/cfb/conferences";
import {
  formatNullableNumber,
  formatRank,
  formatRankChange,
  formatRecord,
} from "@/lib/cfb/format";
import { getCfbTeamPath } from "@/lib/cfb/routes";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";
import CollegeFootballRatingCell from "./CollegeFootballRatingCell";

type Props = {
  team: CfbTeam;
  rank?: number | null;
  showConference?: boolean;
  compact?: boolean;
};

export default function CollegeFootballTeamRow({
  team,
  rank,
  showConference = true,
  compact = false,
}: Props) {
  const conf = getConferenceMeta(team.conference);
  const displayRank = rank ?? team.ratings.jkbRank;
  const movement = formatRankChange(team.ratings.previousJkbRank, team.ratings.jkbRank);
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);

  return (
    <tr className="border-t border-slate-100 transition-colors hover:bg-slate-50">
      <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-slate-800">
        <span className="inline-flex items-center gap-1">
          {displayRank != null ? displayRank : "—"}
          {movement.direction === "up" && (
            <span className="text-[10px] font-semibold text-emerald-700">{movement.text}</span>
          )}
          {movement.direction === "down" && (
            <span className="text-[10px] font-semibold text-red-700">{movement.text}</span>
          )}
        </span>
      </td>
      <td className="p-0">
        <Link
          to={getCfbTeamPath(team.slug)}
          className="flex items-center gap-2 px-2 py-1.5 font-semibold text-slate-800 hover:text-sky-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
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
          <span className="min-w-0">
            <span className="block whitespace-nowrap">{compact ? team.shortName : team.name}</span>
            {showConference && (
              <span className="block text-[10px] font-medium text-slate-500">{conf.shortName}</span>
            )}
          </span>
        </Link>
      </td>
      <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-slate-800">{record}</td>
      <td className="px-1 py-1.5 text-center">
        <CollegeFootballRatingCell
          value={team.ratings.jkbPowerRating}
          rank={team.ratings.jkbRank}
        />
      </td>
      <td className="hidden px-1 py-1.5 text-center sm:table-cell">
        <CollegeFootballRatingCell value={team.ratings.offensiveRating} heat={false} />
      </td>
      <td className="hidden px-1 py-1.5 text-center sm:table-cell">
        <CollegeFootballRatingCell value={team.ratings.defensiveRating} heat={false} />
      </td>
      <td className="px-1 py-1.5 text-center text-slate-600">
        {team.ratings.sosPlayedRank != null
          ? formatRank(team.ratings.sosPlayedRank)
          : "—"}
      </td>
      <td className="px-1 py-1.5 text-center text-slate-600">
        {team.ratings.sosRemainingRank != null
          ? formatRank(team.ratings.sosRemainingRank)
          : formatNullableNumber(team.ratings.sosRemainingRating)}
      </td>
    </tr>
  );
}
