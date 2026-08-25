import { Link } from "react-router-dom";
import type { CfbGame, CfbJkbRatings, CfbSeasonRecord, CfbTeam } from "@/data/cfb/types";
import {
  formatCfbGameStatusLabel,
  formatNullableNumber,
  formatRecord,
  getCfbMarketFavorite,
  getCfbRankDisplay,
} from "@/lib/cfb/format";
import { formatCfbKickoffLabel } from "@/lib/cfb/schedulePresentation";
import { getCfbPowerBarWidthPercent } from "@/lib/cfb/ratingPresentation";
import { getCfbMatchupPath } from "@/lib/cfb/routes";
import { cn } from "@/lib/utils";
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

function FavoriteCaret() {
  return (
    <span className="inline-flex shrink-0 items-center" title="Market favorite">
      <svg aria-hidden="true" viewBox="0 0 10 10" className="h-2 w-2 fill-emerald-600">
        <path d="M0 0 L9 5 L0 10 Z" />
      </svg>
      <span className="sr-only">Market favorite</span>
    </span>
  );
}

function TeamRow({
  team,
  isFavorite,
}: {
  team: CfbScheduleParticipant;
  isFavorite: boolean;
}) {
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);
  const power = team.ratings.jkbPowerRating;
  const rank = getCfbRankDisplay(team.ratings);
  const barPercent = getCfbPowerBarWidthPercent(power);

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <CollegeFootballTeamLogo
        name={team.name}
        logo={team.logo}
        abbreviation={team.abbreviation}
        primaryColor={team.primaryColor}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {isFavorite && <FavoriteCaret />}
          <span className="truncate text-sm font-semibold text-slate-900">{team.shortName}</span>
          {rank.text && (
            <span
              className={cn(
                "shrink-0 rounded px-1 py-0.5 text-[9px] font-bold leading-none",
                rank.source === "ap" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500",
              )}
            >
              {rank.text}
            </span>
          )}
          <span className="shrink-0 text-[11px] font-normal text-slate-500">{record}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full"
            style={{ width: `${barPercent}%`, background: team.primaryColor }}
          />
        </div>
      </div>
      <div className="flex w-9 shrink-0 items-center justify-end self-stretch text-right text-sm font-bold tabular-nums text-slate-900">
        {formatNullableNumber(power)}
      </div>
    </div>
  );
}

export default function CollegeFootballGameCard({ game, away, home, matchupAvailable }: Props) {
  const kickoffLabel = formatCfbKickoffLabel(game.date, game.time);
  const favorite = getCfbMarketFavorite(game);
  const isFinal = game.gameStatus === "final" && game.awayScore != null && game.homeScore != null;
  const statusLabel = isFinal
    ? `Final · ${away.abbreviation} ${game.awayScore} – ${home.abbreviation} ${game.homeScore}`
    : formatCfbGameStatusLabel(game.gameStatus);

  const content = (
    <>
      <div className="relative flex h-6 items-stretch overflow-hidden">
        <div
          className="flex flex-1 items-center pl-2 text-[10px] font-black uppercase tracking-wide text-white"
          style={{ background: away.primaryColor }}
        >
          {away.abbreviation}
        </div>
        <div
          className="flex flex-1 items-center justify-end pr-2 text-[10px] font-black uppercase tracking-wide text-white"
          style={{ background: home.primaryColor }}
        >
          {home.abbreviation}
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
          {kickoffLabel}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 px-2.5 py-0.5 text-[10px] text-slate-500">
        <span className="flex min-w-0 items-center gap-1.5">
          {game.venue && <span className="truncate">{game.venue}</span>}
          {game.neutralSite && (
            <span className="shrink-0 rounded bg-violet-100 px-1 py-0.5 font-semibold text-violet-900">
              Neutral
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {game.tvNetwork && (
            <span className="rounded bg-slate-100 px-1 py-0.5 font-semibold text-slate-600">
              {game.tvNetwork}
            </span>
          )}
          <span className="font-semibold uppercase tracking-wide text-slate-400">{statusLabel}</span>
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        <TeamRow team={away} isFavorite={favorite === "away"} />
        <TeamRow team={home} isFavorite={favorite === "home"} />
      </div>

      {/* TODO(cfb-v2): once V2 win-probability is activated, add a compact
          probability/edge row here (between team rows and odds strip)
          rather than redesigning the card. Do not derive a proxy from spread. */}

      <div className="border-t border-slate-100 px-2.5 py-1.5">
        <CollegeFootballOddsDisplay
          odds={game.odds}
          game={game}
          awayAbbreviation={away.abbreviation}
          homeAbbreviation={home.abbreviation}
        />
      </div>
    </>
  );

  const className =
    "block overflow-hidden rounded-sm border border-slate-200 bg-white transition-colors hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

  return matchupAvailable ? (
    <Link to={getCfbMatchupPath(game.id)} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
