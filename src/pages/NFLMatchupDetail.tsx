import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { getMatchupBySlug, type NflMatchupTeam } from "@/lib/nfl/matchups";
import {
  buildComparisonRows,
  deriveAdvantages,
  deriveAngles,
} from "@/lib/nfl/matchupComparison";
import { kickoffLabel } from "@/pages/NFLSchedule";
import SpreadPlaceholder from "@/components/nfl/matchups/SpreadPlaceholder";
import MatchupComparisonTable from "@/components/nfl/matchups/MatchupComparisonTable";
import MatchupAdvantages from "@/components/nfl/matchups/MatchupAdvantages";
import MatchupAngles from "@/components/nfl/matchups/MatchupAngles";

const CURRENT_SEASON = 2026;
const GUIDE = getNflSeasonGuide(CURRENT_SEASON)!;

function TeamIdentity({ team, label }: { team: NflMatchupTeam; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img src={nflLogoUrl(team.abbr)} alt={`${team.teamName} logo`} className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14" />
      <div className="min-w-0">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
        <Link
          to={`/nfl/guide/team/${team.slug}`}
          className="block truncate text-lg font-black leading-6 text-slate-900 hover:text-emerald-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:text-xl"
        >
          {team.teamName}
        </Link>
        <div className="text-[11px] font-bold text-slate-500">{team.division}</div>
      </div>
    </div>
  );
}

export default function NFLMatchupDetail() {
  const { gameSlug = "" } = useParams();
  const seo = getSeoMeta("nfl");
  const { loading, error, data } = useNflSeasonData(CURRENT_SEASON);

  const matchup = useMemo(
    () => (data ? getMatchupBySlug(data.games, GUIDE, gameSlug) : null),
    [data, gameSlug]
  );

  usePageSeo({
    title: matchup
      ? `${matchup.away.teamName} at ${matchup.home.teamName} — Week ${matchup.week} Matchup | Joe Knows Ball`
      : `NFL Weekly Matchup | Joe Knows Ball`,
    description: matchup
      ? `${matchup.away.teamName} vs ${matchup.home.teamName} Week ${matchup.week} preview: power ratings, side-by-side comparison, model advantages and matchup angles.`
      : "NFL weekly matchup preview.",
    path: `/nfl/matchups/${gameSlug}`,
    noindex: seo.noindex ?? !matchup,
  });

  const rows = useMemo(() => (matchup ? buildComparisonRows(matchup) : []), [matchup]);
  const advantages = useMemo(() => (matchup ? deriveAdvantages(matchup, rows) : []), [matchup, rows]);
  const angles = useMemo(() => (matchup ? deriveAngles(matchup) : []), [matchup]);

  if (loading) {
    return (
      <main className="site-page pb-16 pt-8">
        <div className="site-container"><p className="text-sm text-slate-500">Loading matchup…</p></div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="site-page pb-16 pt-8">
        <div className="site-container">
          <p className="text-sm font-semibold text-red-700">Could not load matchup data. Please try again later.</p>
          <Link to="/nfl/matchups" className="mt-3 inline-block text-sm font-black text-emerald-700 hover:underline">← All matchups</Link>
        </div>
      </main>
    );
  }
  // Loaded but no matching game → safe redirect (invalid/unknown slug).
  if (!matchup) return <Navigate to="/nfl/matchups" replace />;

  const { away, home } = matchup;

  return (
    <main className="site-page pb-16 pt-8">
      <div className="site-container site-stack">
        <Link to="/nfl/matchups" className="text-xs font-black text-emerald-700 hover:underline">← All weekly matchups</Link>

        {/* Header */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="matchup-heading">
          <h1 id="matchup-heading" className="sr-only">
            {away.teamName} at {home.teamName} — Week {matchup.week} matchup
          </h1>
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Week {matchup.week} Matchup</div>
          <div className="mt-3 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <TeamIdentity team={away} label="Away" />
            <div className="text-center text-xs font-black uppercase tracking-wider text-slate-400">at</div>
            <div className="sm:text-right sm:[&>div]:flex-row-reverse">
              <TeamIdentity team={home} label="Home" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="font-semibold">{kickoffLabel(matchup.kickoffUtc)}</span>
            <span>{matchup.stadium ?? "Venue TBD"}</span>
            <SpreadPlaceholder spread={matchup.spread} />
          </div>
        </section>

        {/* Comparison + advantages/angles */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-700">Team comparison</h2>
            <MatchupComparisonTable matchup={matchup} rows={rows} />
            <p className="mt-3 text-[11px] leading-4 text-slate-400">
              Ratings from the Joe Knows Ball 2026 power model. "Edge" marks the model-favored team; context-only rows do not award an edge.
            </p>
          </section>

          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-700">Advantages</h2>
              <MatchupAdvantages notes={advantages} />
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-700">Angles to watch</h2>
              <MatchupAngles angles={angles} />
            </section>
          </div>
        </div>

        <p className="text-[11px] leading-5 text-slate-400">
          Informational model preview only — not betting advice. Spreads are not yet available and are never derived from the power ratings.
        </p>
      </div>
    </main>
  );
}
