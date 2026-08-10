import { Link } from "react-router-dom";
import type { CfbGame, CfbJkbRatings, CfbSeasonRecord, CfbTeam } from "@/data/cfb/types";
import { formatRecord, formatNullableNumber } from "@/lib/cfb/format";
import { getCfbMatchupPath } from "@/lib/cfb/routes";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";
import CollegeFootballOddsDisplay from "./CollegeFootballOddsDisplay";

type Props = {
  game: CfbGame;
  away: CfbScheduleParticipant;
  home: CfbScheduleParticipant;
  matchupAvailable: boolean;
};

export type CfbScheduleParticipant = Pick<
  CfbTeam,
  "id" | "name" | "shortName" | "abbreviation" | "primaryColor" | "logo"
> & { ratings: CfbJkbRatings; record: CfbSeasonRecord };

function formatGameDate(date: string, time: string | null): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return time ? `${day} · ${time} ET` : day;
}

export default function CollegeFootballGameCard({ game, away, home, matchupAvailable }: Props) {
  const siteLabel = game.neutralSite ? "Neutral" : "at";
  const content = (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{formatGameDate(game.date, game.time)}</span>
        <span className="flex items-center gap-2">
          {game.tvNetwork && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
              {game.tvNetwork}
            </span>
          )}
          <span className="font-semibold uppercase tracking-wide text-slate-400">
            {game.gameStatus === "final" ? "Final" : "Scheduled"}
          </span>
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamSide team={away} align="left" />
        <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {siteLabel}
        </div>
        <TeamSide team={home} align="right" />
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2">
        <CollegeFootballOddsDisplay odds={game.odds} />
      </div>
    </>
  );
  const className = "block rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
  return matchupAvailable ? (
    <Link to={getCfbMatchupPath(game.id)} className={className}>{content}</Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function TeamSide({ team, align }: { team: CfbScheduleParticipant; align: "left" | "right" }) {
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);
  const power = formatNullableNumber(team.ratings.jkbPowerRating);
  const reverse = align === "right";

  return (
    <div className={`flex items-center gap-2 ${reverse ? "flex-row-reverse text-right sm:flex-row-reverse" : ""}`}>
      <CollegeFootballTeamLogo
        name={team.name}
        logo={team.logo}
        abbreviation={team.abbreviation}
        primaryColor={team.primaryColor}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{team.shortName}</div>
        <div className="text-[11px] text-slate-500">
          {record} · JKB {power}
        </div>
      </div>
    </div>
  );
}
