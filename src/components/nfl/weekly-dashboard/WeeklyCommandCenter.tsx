import { useState } from "react";
import { ArrowUpRight, BarChart3, CalendarDays, ChevronRight, Gauge, ListTree, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { NflDataMeta } from "@/lib/nfl/standings";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { formatTotal } from "@/lib/nfl/marketData";
import { modelMarketGapBadgeColor } from "@/lib/nfl/gapColor";
import {
  WEEKLY_RANKING_POSITIONS,
} from "@/lib/fantasy/weeklyRankings";
import type {
  WeeklyDashboard,
  WeeklyDashboardFantasyLeader,
  WeeklyDashboardGame,
  WeeklyDashboardPosition,
  WeeklyDashboardTeam,
} from "@/lib/nfl/weeklyDashboard";

const EXPLORE_LINKS = [
  { to: "/nfl/matchups", label: "Weekly Matchups", detail: "Full matchup analysis", icon: CalendarDays, iconClass: "border-sky-200 bg-sky-50 text-sky-800" },
  { to: "/nfl/power-ratings", label: "Power Ratings", detail: "All 32 current ratings", icon: Gauge, iconClass: "border-blue-200 bg-blue-50 text-blue-800" },
  { to: "/nfl/team-schedules", label: "Team Schedules", detail: "Team-by-team slates", icon: ListTree, iconClass: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { to: "/nfl/analytics", label: "Performance Analytics", detail: "Offense and defense", icon: BarChart3, iconClass: "border-teal-200 bg-teal-50 text-teal-800" },
  { to: "/fantasy-football/weekly-rankings", label: "Fantasy Rankings", detail: "Complete weekly boards", icon: Sparkles, iconClass: "border-violet-200 bg-violet-50 text-violet-800" },
  { to: "/nfl/guide", label: "2026 Team Guide", detail: "Previews and research", icon: Users, iconClass: "border-amber-200 bg-amber-50 text-amber-800" },
] as const;

function kickoffLabel(iso: string | null): string {
  if (!iso) return "TBD";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ratingLabel(team: WeeklyDashboardTeam): string {
  return team.rating ? `#${team.rating.ovrRank} · ${team.rating.ovr.toFixed(1)}` : "NR";
}

function TeamLogo({ team, className }: { team: WeeklyDashboardTeam; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden
        className={`${className} inline-flex shrink-0 items-center justify-center rounded-sm text-[7px] font-black uppercase text-white`}
        style={{ backgroundColor: team.primaryColor }}
      >
        {team.abbr}
      </span>
    );
  }
  return <img src={team.logoUrl} alt="" aria-hidden className={`${className} shrink-0 object-contain`} loading="lazy" onError={() => setFailed(true)} />;
}

function ModuleHeader({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 sm:px-4">
      <div className="min-w-0">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-900">{title}</h2>
        {detail && <p className="mt-0.5 truncate text-[10px] text-slate-500">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function CommandHeader({
  dashboard,
  weeks,
  scheduleMeta,
  invalidQuery,
  onWeekChange,
}: {
  dashboard: WeeklyDashboard;
  weeks: readonly number[];
  scheduleMeta: NflDataMeta | null | undefined;
  invalidQuery: boolean;
  onWeekChange: (week: number) => void;
}) {
  return (
    <header className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/logos/nfl.svg" alt="NFL" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-black tracking-tight sm:text-xl">NFL Week {dashboard.week}</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">Command Center</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-300">
              {dashboard.dateRange?.label ?? "Dates TBD"} · {dashboard.games.length} games · Times ET
            </p>
          </div>
        </div>
        <label className="flex min-h-9 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-bold text-slate-200">
          Week
          <select
            aria-label="Select NFL week"
            value={dashboard.week}
            onChange={(event) => onWeekChange(Number(event.target.value))}
            className="min-h-7 rounded border border-slate-600 bg-slate-950 px-2 text-xs font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {weeks.map((week) => <option key={week} value={week}>{week}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-800 bg-slate-900/80 px-3 py-1.5 text-[10px] text-slate-400 sm:px-4">
        <span>{scheduleMeta?.generatedAt ? `Schedule updated ${formatNflMetadataTimestamp(scheduleMeta.generatedAt)}` : "Canonical schedule loaded"}</span>
        {invalidQuery && <span className="font-semibold text-amber-300">Invalid week selection reset to the schedule default.</span>}
      </div>
    </header>
  );
}

function SignalLabel({ children }: { children: React.ReactNode }) {
  return <p className="truncate text-[8px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:text-[9px]">{children}</p>;
}

function SignalDetail({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 hidden truncate text-[10px] text-slate-500 sm:block">{children}</p>;
}

function GapSignalTile({ gap }: { gap: WeeklyDashboardGame | null }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5 sm:px-4">
      <SignalLabel>Largest Model vs Market Gap</SignalLabel>
      {gap ? (
        <>
          <div className="mt-1 flex items-center gap-1.5">
            {gap.modelLeanTeam && (
              <div className="flex shrink-0 flex-col items-center">
                <TeamLogo team={gap.modelLeanTeam} className="h-6 w-6" />
                <span className="mt-0.5 text-[7px] font-black uppercase text-slate-600">{gap.modelLeanTeam.abbr}</span>
              </div>
            )}
            <p className="truncate text-xs font-black tabular-nums text-slate-950 sm:text-sm">{gap.formattedComparison}</p>
          </div>
          <SignalDetail>{`${gap.away.abbr.toUpperCase()} @ ${gap.home.abbr.toUpperCase()}`}</SignalDetail>
        </>
      ) : (
        <>
          <p className="mt-0.5 truncate text-xs font-black tabular-nums text-slate-950 sm:text-sm">N/A</p>
          <SignalDetail>Awaiting comparable lines</SignalDetail>
        </>
      )}
    </div>
  );
}

function TotalSignalTile({ game }: { game: WeeklyDashboardGame | null }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5 sm:px-4">
      <SignalLabel>Highest Market Total</SignalLabel>
      {game ? (
        <>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="flex shrink-0 items-end gap-1">
              {[game.away, game.home].map((team) => (
                <div key={team.abbr} className="flex flex-col items-center">
                  <TeamLogo team={team} className="h-6 w-6" />
                  <span className="mt-0.5 text-[7px] font-black uppercase text-slate-600">{team.abbr}</span>
                </div>
              ))}
            </div>
            <p className="truncate text-xs font-black tabular-nums text-slate-950 sm:text-sm">{formatTotal(game.market?.total)}</p>
          </div>
          <SignalDetail>Market reference total</SignalDetail>
        </>
      ) : (
        <>
          <p className="mt-0.5 truncate text-xs font-black tabular-nums text-slate-950 sm:text-sm">Unavailable</p>
          <SignalDetail>No market total available</SignalDetail>
        </>
      )}
    </div>
  );
}

function SignalStrip({ dashboard }: { dashboard: WeeklyDashboard }) {
  const gap = dashboard.highlights.largestGap;
  const highestTotal = dashboard.highlights.highestMarketTotal;
  const fantasy = dashboard.highlights.topFantasyProjection;

  return (
    <section aria-label="Weekly headline signals" className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white">
      <GapSignalTile gap={gap} />
      <TotalSignalTile game={highestTotal} />
      <div className="min-w-0 px-2.5 py-2.5 sm:px-4">
        <SignalLabel>Top Fantasy Pick</SignalLabel>
        <p className="mt-0.5 truncate text-xs font-black tabular-nums text-slate-950 sm:text-sm">
          {fantasy ? `${fantasy.player} · ${fantasy.position}${fantasy.rank}` : "Unavailable"}
        </p>
        <SignalDetail>{fantasy ? `${fantasy.projectedPpg.toFixed(1)} 2026 projected PPG` : "Rankings unavailable"}</SignalDetail>
      </div>
    </section>
  );
}

function TeamIdentity({ team, align = "left" }: { team: WeeklyDashboardTeam; align?: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end text-right" : ""}`}>
      {align === "right" && (
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-950">{team.name}</p>
          <p className="text-[9px] font-semibold tabular-nums text-slate-500">OVR {ratingLabel(team)}</p>
        </div>
      )}
      <TeamLogo team={team} className="h-7 w-7" />
      {align === "left" && (
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-950">{team.name}</p>
          <p className="text-[9px] font-semibold tabular-nums text-slate-500">OVR {ratingLabel(team)}</p>
        </div>
      )}
    </div>
  );
}

function DesktopGameBoard({ games }: { games: readonly WeeklyDashboardGame[] }) {
  return (
    <div className="hidden md:block">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">NFL weekly games with market and model spread comparisons</caption>
        <colgroup>
          <col className="w-[92px]" /><col /><col className="w-8" /><col /><col className="w-[96px]" />
          <col className="w-[96px]" /><col className="w-[102px]" /><col className="w-[64px]" /><col className="w-9" />
        </colgroup>
        <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2">Kickoff</th><th className="px-2 py-2 text-right">Away</th><th className="py-2 text-center">At</th>
            <th className="px-2 py-2">Home</th><th className="px-2 py-2 text-center">Market</th><th className="px-2 py-2 text-center">JKB</th>
            <th className="px-2 py-2 text-center">Model vs Market</th><th className="px-2 py-2 text-center">Total</th><th><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {games.map((game) => (
            <tr key={game.gameId} className="group bg-white transition-colors hover:bg-sky-50/50">
              <td className="px-3 py-2.5 text-[10px] font-bold tabular-nums text-slate-600">{kickoffLabel(game.kickoffUtc)}</td>
              <td className="px-2 py-2"><TeamIdentity team={game.away} align="right" /></td>
              <td className="text-center text-[9px] font-bold uppercase text-slate-400">{game.neutralSite ? "vs" : "at"}</td>
              <td className="px-2 py-2"><TeamIdentity team={game.home} /></td>
              <td className="px-2 py-2 text-center text-[11px] font-bold tabular-nums text-slate-800">{game.market?.formattedSpread ?? "N/A"}</td>
              <td className="px-2 py-2 text-center text-[11px] font-bold tabular-nums text-emerald-800">{game.projection?.formattedSpread ?? "N/A"}</td>
              <td className="px-2 py-2 text-center">
                <span
                  className="inline-flex rounded px-1.5 py-1 text-[10px] font-extrabold tabular-nums"
                  style={modelMarketGapBadgeColor(game.absoluteModelMarketGap)}
                >
                  {game.formattedComparison}
                </span>
              </td>
              <td className="px-2 py-2 text-center text-[11px] font-bold tabular-nums text-slate-700">{formatTotal(game.market?.total)}</td>
              <td className="pr-2 text-right">
                <Link to={game.matchupHref} aria-label={`${game.away.name} ${game.neutralSite ? "versus" : "at"} ${game.home.name} matchup details`} className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileGameBoard({ games }: { games: readonly WeeklyDashboardGame[] }) {
  return (
    <div className="md:hidden" data-testid="mobile-game-board">
      <div
        data-testid="mobile-game-board-sticky-header"
        className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_58px_58px_66px] border-b border-slate-200 bg-slate-50/95 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur"
      >
        <span>Game</span><span className="text-center">Market</span><span className="text-center">JKB</span><span className="text-center">Gap</span>
      </div>
      <div className="divide-y divide-slate-200">
        {games.map((game) => (
          <Link key={game.gameId} to={game.matchupHref} className="group block px-2 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500" aria-label={`${game.away.name} ${game.neutralSite ? "versus" : "at"} ${game.home.name} matchup details`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-semibold text-slate-500">
              <span>{kickoffLabel(game.kickoffUtc)}{game.neutralSite ? " · Neutral" : ""}</span>
              <span className="tabular-nums">Total {formatTotal(game.market?.total)}</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_58px_58px_66px] items-center">
              <div className="min-w-0 space-y-0.5">
                {[game.away, game.home].map((team) => (
                  <div key={team.abbr} className="flex min-w-0 items-center gap-1.5">
                    <TeamLogo team={team} className="h-5 w-5" />
                    <span className="w-8 text-[11px] font-black uppercase text-slate-950">{team.abbr}</span>
                    <span className="truncate text-[9px] font-semibold tabular-nums text-slate-500">{team.rating ? `#${team.rating.ovrRank}` : "NR"}</span>
                  </div>
                ))}
              </div>
              <span className="truncate text-center text-[9px] font-bold tabular-nums text-slate-800">{game.market?.formattedSpread ?? "N/A"}</span>
              <span className="truncate text-center text-[9px] font-bold tabular-nums text-emerald-800">{game.projection?.formattedSpread ?? "N/A"}</span>
              <span className={`truncate text-center text-[9px] font-extrabold tabular-nums ${game.absoluteModelMarketGap === null ? "text-slate-500" : "text-sky-800"}`}>{game.formattedComparison}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function GameBoard({ games }: { games: readonly WeeklyDashboardGame[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="weekly-game-board-title">
      <ModuleHeader title="Weekly Game Board" detail="Market totals are reference only · spread comparison is descriptive" action={<Link to="/nfl/matchups" className="text-[10px] font-bold text-sky-700 hover:underline">All matchups</Link>} />
      <span id="weekly-game-board-title" className="sr-only">Weekly Game Board</span>
      {games.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No regular-season games are available for this week.</p> : <><DesktopGameBoard games={games} /><MobileGameBoard games={games} /></>}
    </section>
  );
}

function ModelGapList({ games }: { games: readonly WeeklyDashboardGame[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ModuleHeader title="Largest Model-vs-Market Gaps" detail="Descriptive comparison · not picks" />
      {games.length === 0 ? (
        <p className="px-4 py-6 text-xs leading-5 text-slate-500">Comparable market and projection data are not available yet.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {games.slice(0, 5).map((game, index) => (
            <li key={game.gameId}>
              <Link to={game.matchupHref} className="grid min-h-12 grid-cols-[18px_38px_minmax(0,1fr)_auto] items-center gap-1.5 px-3 py-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
                <span className="text-[10px] font-black tabular-nums text-slate-400">{index + 1}</span>
                <span className="flex items-center" aria-hidden data-testid="gap-team-logos">
                  <TeamLogo team={game.away} className="relative z-10 h-6 w-6 rounded-full bg-white p-0.5 ring-1 ring-slate-200" />
                  <TeamLogo team={game.home} className="-ml-2 h-6 w-6 rounded-full bg-white p-0.5 ring-1 ring-slate-200" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold uppercase text-slate-900">{game.away.abbr} {game.neutralSite ? "vs" : "@"} {game.home.abbr}</span>
                  <span className="block truncate text-[9px] text-slate-500">Market {game.market?.formattedSpread} · JKB {game.projection?.formattedSpread}</span>
                </span>
                <span
                  className="rounded px-1.5 py-1 text-[10px] font-extrabold tabular-nums"
                  style={modelMarketGapBadgeColor(game.absoluteModelMarketGap)}
                >
                  {game.formattedComparison}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FantasyRows({ rows }: { rows: readonly WeeklyDashboardFantasyLeader[] }) {
  return (
    <ol className="divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.key} className="grid min-h-9 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-1.5 px-2.5 py-1.5">
          <span className="text-[9px] font-black tabular-nums text-slate-400">{row.rank}</span>
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-bold text-slate-900">{row.player}</span>
            <span className="block text-[8px] font-semibold uppercase text-slate-500">{row.teamAbbr?.toUpperCase() ?? "FA"} · {row.opponentLabel}</span>
          </span>
          <span className="text-right text-[9px] font-semibold text-violet-800">
            <span className="block text-[11px] font-black tabular-nums">{row.projectedPpg.toFixed(1)}</span>
            <span className="block uppercase tracking-wide">Proj PPG</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function TopFantasyPicks({ leaders, week }: { leaders: WeeklyDashboard["fantasyLeaders"]; week: number }) {
  const [position, setPosition] = useState<WeeklyDashboardPosition>("QB");
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ModuleHeader title={`Top Fantasy Picks — Week ${week}`} detail="Top 5 per position from the canonical weekly rankings" action={<Link to="/fantasy-football/weekly-rankings" className="text-[10px] font-bold text-violet-700 hover:underline">View full rankings</Link>} />
      <div className="border-b border-slate-200 p-2 md:hidden">
        <div role="group" aria-label="Fantasy position" className="grid grid-cols-4 gap-1">
          {WEEKLY_RANKING_POSITIONS.map((option) => (
            <button key={option} type="button" onClick={() => setPosition(option)} aria-pressed={position === option} className={`min-h-9 rounded border text-[10px] font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${position === option ? "border-violet-800 bg-violet-800 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{option}</button>
          ))}
        </div>
      </div>
      <div className="md:hidden"><FantasyRows rows={leaders[position]} /></div>
      <div className="hidden grid-cols-4 divide-x divide-slate-200 md:grid" data-testid="desktop-fantasy-leaders">
        {WEEKLY_RANKING_POSITIONS.map((option) => (
          <div key={option} className="min-w-0">
            <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">Top {option} plays</div>
            <FantasyRows rows={leaders[option]} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PowerWatch({ teams }: { teams: readonly WeeklyDashboardTeam[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ModuleHeader title="Power Watch" detail="Top 5 current OVR" action={<Link to="/nfl/power-ratings" className="text-[10px] font-bold text-sky-700 hover:underline">All 32</Link>} />
      {teams.length === 0 ? <p className="px-4 py-6 text-xs text-slate-500">Current ratings are unavailable.</p> : (
        <ol className="divide-y divide-slate-100">
          {teams.map((team) => (
            <li key={team.abbr} className="grid min-h-10 grid-cols-[24px_26px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5">
              <span className="text-[10px] font-black tabular-nums text-slate-400">#{team.rating?.ovrRank}</span>
              <TeamLogo team={team} className="h-6 w-6" />
              <span className="truncate text-[10px] font-bold text-slate-900">{team.name}</span>
              <span className="text-[11px] font-black tabular-nums text-slate-800">{team.rating?.ovr.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ExploreNfl() {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ModuleHeader title="Explore NFL" detail="Go deeper across Joe Knows Ball" />
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 lg:grid-cols-3">
        {EXPLORE_LINKS.map(({ to, label, detail, icon: Icon, iconClass }) => (
          <Link key={to} to={to} className="group flex min-h-14 min-w-0 items-center gap-2.5 px-3 py-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border ${iconClass}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-slate-900">{label}</span><span className="hidden truncate text-[9px] text-slate-500 sm:block">{detail}</span></span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-sky-700" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function WeeklyCommandCenter({
  dashboard,
  weeks,
  scheduleMeta,
  invalidQuery,
  artifactErrors,
  onWeekChange,
}: {
  dashboard: WeeklyDashboard;
  weeks: readonly number[];
  scheduleMeta: NflDataMeta | null | undefined;
  invalidQuery: boolean;
  artifactErrors: readonly string[];
  onWeekChange: (week: number) => void;
}) {
  return (
    <div className="space-y-3">
      <CommandHeader dashboard={dashboard} weeks={weeks} scheduleMeta={scheduleMeta} invalidQuery={invalidQuery} onWeekChange={onWeekChange} />
      {artifactErrors.length > 0 && (
        <div role="status" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-4 text-amber-900">
          Some supporting data is unavailable. Available schedule, rankings, ratings, and market modules continue independently.
        </div>
      )}
      <SignalStrip dashboard={dashboard} />
      <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_300px] 2xl:items-start">
        <GameBoard games={dashboard.games} />
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-1">
          <ModelGapList games={dashboard.largestModelMarketGaps} />
          <PowerWatch teams={dashboard.powerWatch} />
        </div>
      </div>
      <TopFantasyPicks leaders={dashboard.fantasyLeaders} week={dashboard.week} />
      <ExploreNfl />
    </div>
  );
}
