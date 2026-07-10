import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { formatSigned } from "@/lib/nfl/guideData";
import { kickoffLabel } from "@/pages/NFLSchedule";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import SpreadPlaceholder from "@/components/nfl/matchups/SpreadPlaceholder";

function ratingLine(team: NflMatchupTeam): string {
  const rankPart = Number.isFinite(team.powerRank) ? `#${team.powerRank}` : "NR";
  const pctPart = Number.isFinite(team.overallPct) ? ` · ${formatSigned(team.overallPct)}%` : "";
  return `${rankPart}${pctPart}`;
}

function TeamLine({ team, prefix }: { team: NflMatchupTeam; prefix?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={nflLogoUrl(team.abbr)} alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" loading="lazy" />
      <div className="min-w-0">
        <div className="truncate text-sm font-black leading-5 text-slate-900">
          {prefix && <span className="mr-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{prefix}</span>}
          {team.teamName}
        </div>
        <div className="text-[11px] font-bold tabular-nums text-slate-500">
          <span className="text-[9px] uppercase tracking-wider text-slate-400">Power </span>
          {ratingLine(team)}
        </div>
      </div>
    </div>
  );
}

/**
 * Landing-page game card. The whole card is a single keyboard-accessible link to
 * the matchup breakdown; ratings, kickoff, location and the spread area are shown
 * inline. No hover-only content.
 */
export default function MatchupCard({ matchup }: { matchup: NflMatchup }) {
  const { away, home } = matchup;
  return (
    <Link
      to={`/nfl/matchups/${matchup.slug}`}
      aria-label={`${away.teamName} at ${home.teamName} — view matchup breakdown`}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Week {matchup.week}</span>
        <span className="text-[11px] font-semibold text-slate-500">{kickoffLabel(matchup.kickoffUtc)}</span>
      </div>

      <div className="mt-3 space-y-2.5">
        <TeamLine team={away} prefix="Away" />
        <div className="flex items-center gap-2 pl-1 text-[10px] font-black uppercase tracking-wider text-slate-300">
          <span className="h-px flex-1 bg-slate-100" />
          at
          <span className="h-px flex-1 bg-slate-100" />
        </div>
        <TeamLine team={home} prefix="Home" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="min-w-0 truncate text-[11px] text-slate-500">{matchup.stadium ?? "Venue TBD"}</span>
        <SpreadPlaceholder spread={matchup.spread} favoriteName={undefined} />
      </div>

      <div className="mt-2 text-[11px] font-black text-emerald-700 group-hover:underline">
        View matchup breakdown →
      </div>
    </Link>
  );
}
