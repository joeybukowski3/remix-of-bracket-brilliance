import type { CfbGame, CfbTeam } from "@/data/cfb/types";
import { formatCfbGameStatusLabel, formatCfbVenueLocation, formatRecord, getCfbRankDisplay } from "@/lib/cfb/format";
import { formatCfbKickoffLabel } from "@/lib/cfb/schedulePresentation";
import { getCfbTeamPath } from "@/lib/cfb/routes";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

type Props = {
  game: CfbGame;
  away: CfbTeam;
  home: CfbTeam;
};

function TeamIdentity({
  team,
  score,
  align,
}: {
  team: CfbTeam;
  score: number | null;
  align: "left" | "right";
}) {
  const rank = getCfbRankDisplay(team.ratings);
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);

  return (
    <Link
      to={getCfbTeamPath(team.slug)}
      className={cn(
        "flex flex-col items-center gap-1.5 px-2 py-3 text-center hover:opacity-90",
        align === "left" ? "sm:items-end sm:text-right" : "sm:items-start sm:text-left",
      )}
    >
      <div className={cn("flex items-center gap-2", align === "left" ? "sm:flex-row-reverse" : "sm:flex-row")}>
        <CollegeFootballTeamLogo
          name={team.name}
          logo={team.logo}
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          size="lg"
          className="h-12 w-12"
        />
        <div className={cn("flex flex-col", align === "left" ? "sm:items-end" : "sm:items-start")}>
          <div className="flex items-center gap-1.5">
            {rank.text && (
              <span
                className={cn(
                  "shrink-0 rounded-sm px-1 py-0.5 text-[10px] font-bold leading-none",
                  rank.isOfficial ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500",
                )}
                title={rank.label}
              >
                <span aria-hidden="true">{rank.text}</span>
                <span className="sr-only">{rank.label}</span>
              </span>
            )}
            <span className="text-sm font-black text-slate-900">{team.name}</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">{record}</span>
        </div>
      </div>
      {score != null && (
        <span className="text-2xl font-black tabular-nums text-slate-900">{score}</span>
      )}
    </Link>
  );
}

export default function CollegeFootballMatchupHero({ game, away, home }: Props) {
  const kickoffLabel = formatCfbKickoffLabel(game.date, game.time);
  const venueLocation = formatCfbVenueLocation(game.venueCity, game.venueState);
  const isFinal = game.gameStatus === "final" && game.awayScore != null && game.homeScore != null;
  const isLive = game.gameStatus === "in_progress";
  const statusLabel = formatCfbGameStatusLabel(game.gameStatus);

  return (
    <header className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="relative flex h-2" aria-hidden="true">
        <div className="flex-1" style={{ background: away.primaryColor }} />
        <div className="flex-1" style={{ background: home.primaryColor }} />
      </div>

      <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
        <TeamIdentity team={away} score={isFinal || isLive ? game.awayScore : null} align="left" />

        <div className="order-first flex flex-col items-center justify-center gap-1 border-y border-slate-100 bg-slate-50 px-4 py-3 text-center sm:order-none sm:border-y-0 sm:border-x">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {game.neutralSite ? "Neutral Site" : "Matchup"}
          </p>
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-wide",
              isLive ? "text-rose-600" : "text-slate-600",
            )}
          >
            {isFinal || isLive ? statusLabel : kickoffLabel}
          </p>
          {!isFinal && (
            <p className="text-[11px] text-slate-500">{kickoffLabel}</p>
          )}
          {game.venue && (
            <p className="max-w-[16rem] text-[11px] text-slate-500">
              {game.venue}
              {venueLocation && <span className="text-slate-400"> · {venueLocation}</span>}
            </p>
          )}
          {game.neutralSite && (
            <span className="rounded-sm bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
              Neutral
            </span>
          )}
          {game.tvNetwork && (
            <p className="text-[10px] font-semibold text-slate-500">{game.tvNetwork}</p>
          )}
        </div>

        <TeamIdentity team={home} score={isFinal || isLive ? game.homeScore : null} align="right" />
      </div>
    </header>
  );
}
