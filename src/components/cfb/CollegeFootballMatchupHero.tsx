import { MapPin } from "lucide-react";
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

/**
 * Compact mobile hero team panel: strong team-color background, large logo,
 * shortName, record, and a single honest CFP > AP > JKB rank pill (same
 * hierarchy as CollegeFootballGameCard's getCfbRankDisplay — never two
 * independent JKB/AP pills side by side, unlike the desktop wedge panel).
 */
function MobileHeroTeamPanel({ team, score, side }: { team: CfbTeam; score: number | null; side: "away" | "home" }) {
  const record = formatRecord(team.record.wins, team.record.losses, team.record.ties);
  const rank = getCfbRankDisplay(team.ratings);
  const isAway = side === "away";

  return (
    <Link
      to={getCfbTeamPath(team.slug)}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 px-2.5 py-4",
        isAway ? "items-start text-left" : "items-end text-right",
      )}
      style={{ background: team.primaryColor }}
    >
      <CollegeFootballTeamLogo
        name={team.name}
        logo={team.logo}
        abbreviation={team.abbreviation}
        primaryColor="transparent"
        className="h-14 w-14"
      />
      <span className="truncate text-sm font-black leading-tight text-white">{team.shortName}</span>
      <div className={cn("flex min-w-0 items-center gap-1.5", isAway ? "flex-row" : "flex-row-reverse")}>
        {rank.text && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none",
              rank.isOfficial ? "bg-white text-slate-900" : "bg-white/20 text-white",
            )}
            title={rank.label}
          >
            <span aria-hidden="true">{rank.text}</span>
            <span className="sr-only">{rank.label}</span>
          </span>
        )}
        <span className="truncate text-[11px] font-bold text-white/85">{record}</span>
      </div>
      {score != null && <span className="text-2xl font-black tabular-nums text-white">{score}</span>}
    </Link>
  );
}

/**
 * Mobile hero's compact center matchup-context column: same underlying
 * kickoff/venue/neutral-site/status data and formatting as the desktop
 * MatchupInfoPanel, styled light-on-dark-navy to match the Phase 1/2 mobile
 * center-surface language instead of the desktop's light background.
 */
function MobileHeroMatchupInfoPanel({ game }: { game: CfbGame }) {
  const kickoffLabel = formatCfbKickoffLabel(game.date, game.time);
  const venueLocation = formatCfbVenueLocation(game.venueCity, game.venueState);
  const isFinal = game.gameStatus === "final" && game.awayScore != null && game.homeScore != null;
  const isLive = game.gameStatus === "in_progress";
  const statusLabel = formatCfbGameStatusLabel(game.gameStatus);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-slate-900 px-2 py-3 text-center">
      <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.14em] text-white/50">
        {game.neutralSite && <MapPin className="h-2.5 w-2.5" aria-hidden="true" />}
        {game.neutralSite ? "Neutral Site" : "Matchup"}
      </p>
      <p className={cn("text-xs font-black uppercase tracking-wide", isLive ? "text-rose-400" : "text-white")}>
        {isFinal || isLive ? statusLabel : kickoffLabel}
      </p>
      {!isFinal && <p className="text-[9px] font-semibold text-white/70">{kickoffLabel}</p>}
      {game.venue && (
        <p className="max-w-[6.5rem] text-[8px] leading-tight text-white/60">
          {game.venue}
          {venueLocation && <span className="text-white/40"> · {venueLocation}</span>}
        </p>
      )}
      {game.neutralSite && (
        <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-bold text-violet-200">
          Neutral
        </span>
      )}
    </div>
  );
}

export default function CollegeFootballMatchupHero({ game, away, home }: Props) {
  const isFinal = game.gameStatus === "final" && game.awayScore != null && game.homeScore != null;
  const isLive = game.gameStatus === "in_progress";

  return (
    <header className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm sm:rounded-md sm:border-slate-200">
      {/* Desktop: full-bleed wedge panels. */}
      <div data-testid="cfb-hero-desktop" className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <TeamPanel team={away} score={isFinal || isLive ? game.awayScore : null} side="away" />
        <div className="border-x border-slate-100 bg-white">
          <MatchupInfoPanel game={game} />
        </div>
        <TeamPanel team={home} score={isFinal || isLive ? game.homeScore : null} side="home" />
      </div>

      {/* Mobile: compact single-row team panels + dark center matchup context (away left, home right). */}
      <div data-testid="cfb-hero-mobile" className="sm:hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] divide-x divide-white/10">
          <MobileHeroTeamPanel team={away} score={isFinal || isLive ? game.awayScore : null} side="away" />
          <MobileHeroMatchupInfoPanel game={game} />
          <MobileHeroTeamPanel team={home} score={isFinal || isLive ? game.homeScore : null} side="home" />
        </div>
      </div>
    </header>
  );
}
