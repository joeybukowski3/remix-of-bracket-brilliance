import { MapPin } from "lucide-react";
import type { CfbGame, CfbTeam } from "@/data/cfb/types";
import { formatCfbGameStatusLabel, formatCfbVenueLocation, formatRecord } from "@/lib/cfb/format";
import { formatCfbKickoffLabel } from "@/lib/cfb/schedulePresentation";
import { getCfbTeamPath } from "@/lib/cfb/routes";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";
import CollegeFootballTeamMatchupStrip from "./CollegeFootballTeamMatchupStrip";

type Props = {
  game: CfbGame;
  away: CfbTeam;
  home: CfbTeam;
};

/** "#N" for a real rank, "#—" when unavailable — never fabricated. */
function rankPillText(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "#—" : `#${Math.trunc(value)}`;
}

function RankPills({ team, tone }: { team: CfbTeam; tone: "light" | "dark" }) {
  const toneClass =
    tone === "light"
      ? "bg-white/15 text-white ring-1 ring-inset ring-white/25"
      : "bg-slate-100 text-slate-600";
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-none", toneClass)}>
        JKB {rankPillText(team.ratings.jkbRank)}
      </span>
      <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-none", toneClass)}>
        AP {rankPillText(team.ratings.apRank)}
      </span>
    </div>
  );
}

function TeamPanel({
  team,
  score,
  side,
}: {
  team: CfbTeam;
  score: number | null;
  side: "away" | "home";
}) {
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);
  const isAway = side === "away";

  const clipPath = isAway
    ? "polygon(0 0, 100% 0, 84% 100%, 0 100%)"
    : "polygon(16% 0, 100% 0, 100% 100%, 0 100%)";

  return (
    <Link
      to={getCfbTeamPath(team.slug)}
      className={cn(
        "group relative isolate flex min-h-[240px] items-center overflow-hidden bg-white px-9 py-5",
        isAway ? "justify-start" : "justify-end",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: team.primaryColor, clipPath }}
        aria-hidden="true"
      />

      {/* Oversized watermark logo bleeding toward the outer edge, blended into the panel color. */}
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-70 mix-blend-soft-light transition-opacity group-hover:opacity-90",
          isAway ? "-left-6" : "-right-6",
        )}
        aria-hidden="true"
      >
        <CollegeFootballTeamLogo
          name={team.name}
          logo={team.logo}
          abbreviation={team.abbreviation}
          primaryColor="transparent"
          className="h-52 w-52"
        />
      </div>

      <div className={cn("relative z-10 flex min-w-0 flex-col gap-1.5", isAway ? "items-start text-left" : "items-end text-right")}>
        <RankPills team={team} tone="light" />
        <span className="truncate text-3xl font-black leading-tight text-white">{team.name}</span>
        <span className="text-sm font-bold text-white/85">{record}</span>
        {score != null && <span className="mt-1 text-4xl font-black tabular-nums text-white">{score}</span>}
      </div>
    </Link>
  );
}

function MatchupInfoPanel({ game }: { game: CfbGame }) {
  const kickoffLabel = formatCfbKickoffLabel(game.date, game.time);
  const venueLocation = formatCfbVenueLocation(game.venueCity, game.venueState);
  const isFinal = game.gameStatus === "final" && game.awayScore != null && game.homeScore != null;
  const isLive = game.gameStatus === "in_progress";
  const statusLabel = formatCfbGameStatusLabel(game.gameStatus);

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-5 py-4 text-center sm:min-w-[15rem] sm:px-8">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {game.neutralSite && <MapPin className="h-3 w-3" aria-hidden="true" />}
        {game.neutralSite ? "Neutral Site" : "Matchup"}
      </p>
      <p className={cn("text-sm font-black uppercase tracking-wide", isLive ? "text-rose-600" : "text-slate-900")}>
        {isFinal || isLive ? statusLabel : kickoffLabel}
      </p>
      {!isFinal && <p className="text-[11px] font-semibold text-slate-500">{kickoffLabel}</p>}
      {game.venue && (
        <p className="max-w-[16rem] text-[11px] text-slate-500">
          {game.venue}
          {venueLocation && <span className="text-slate-400"> · {venueLocation}</span>}
        </p>
      )}
      {game.neutralSite && (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-900">
          Neutral
        </span>
      )}
      {game.tvNetwork && <p className="text-[10px] font-semibold text-slate-500">{game.tvNetwork}</p>}
    </div>
  );
}

function CompactTeamRow({ team, align }: { team: CfbTeam; align: "left" | "right" }) {
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);
  return (
    <Link
      to={getCfbTeamPath(team.slug)}
      className={cn("flex items-center gap-2.5 px-3 py-2", align === "right" && "flex-row-reverse text-right")}
    >
      <CollegeFootballTeamLogo
        name={team.name}
        logo={team.logo}
        abbreviation={team.abbreviation}
        primaryColor={team.primaryColor}
        size="md"
      />
      <div className={cn("flex min-w-0 flex-col gap-0.5", align === "right" && "items-end")}>
        <RankPills team={team} tone="dark" />
        <span className="truncate text-sm font-black text-slate-900">{team.name}</span>
      </div>
      <span className="ml-auto shrink-0 text-xs font-bold text-slate-400">{record}</span>
    </Link>
  );
}

export default function CollegeFootballMatchupHero({ game, away, home }: Props) {
  const isFinal = game.gameStatus === "final" && game.awayScore != null && game.homeScore != null;
  const isLive = game.gameStatus === "in_progress";

  return (
    <header className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {/* Desktop: full-bleed wedge panels. */}
      <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <TeamPanel team={away} score={isFinal || isLive ? game.awayScore : null} side="away" />
        <div className="border-x border-slate-100 bg-white">
          <MatchupInfoPanel game={game} />
        </div>
        <TeamPanel team={home} score={isFinal || isLive ? game.homeScore : null} side="home" />
      </div>

      {/* Mobile: compact strip + matchup info + team detail rows. */}
      <div className="sm:hidden">
        <CollegeFootballTeamMatchupStrip away={away} home={home} />
        <div className="border-y border-slate-100 bg-slate-50/60">
          <MatchupInfoPanel game={game} />
        </div>
        <div className="divide-y divide-slate-100">
          <CompactTeamRow team={away} align="left" />
          <CompactTeamRow team={home} align="right" />
        </div>
      </div>
    </header>
  );
}
