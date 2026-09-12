import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MatchupPendingRows, MatchupQualifierRows } from "@/components/nfl/trends/MatchupTrendRows";
import { NflTrendMatchupIdentity } from "@/components/nfl/trends/TrendPresentation";
import {
  gameById,
  resolveGameQualifiers,
  type NflSituationalTrendsArtifact,
} from "@/lib/nfl/situationalTrends";

export default function MatchupSituationalTrendsPanel({
  matchup,
  artifact,
  loading,
  error,
}: {
  matchup: {
    gameId: string;
    away?: { abbr: string; teamName: string };
    home?: { abbr: string; teamName: string };
  };
  artifact: NflSituationalTrendsArtifact | null;
  loading: boolean;
  error: string | null;
}) {
  const game = gameById(artifact, matchup.gameId);
  const qualifiers = resolveGameQualifiers(artifact, matchup.gameId);
  const noteworthyCount = qualifiers.filter((qualifier) => qualifier.trend.tier === "NOTEWORTHY").length;
  const trendById = new Map((artifact?.researchLibrary ?? []).map((trend) => [trend.id, trend]));
  const teamPair = game
    ? { away: { abbr: game.away, name: game.awayName }, home: { abbr: game.home, name: game.homeName } }
    : matchup.away && matchup.home
      ? { away: { abbr: matchup.away.abbr, name: matchup.away.teamName }, home: { abbr: matchup.home.abbr, name: matchup.home.teamName } }
      : null;

  return (
    <section aria-labelledby="situational-trends-heading" className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-950 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h2 id="situational-trends-heading" className="text-sm font-black tracking-tight">Situational Trends</h2>
            <p className="mt-0.5 max-w-2xl truncate text-[10px] leading-4 text-slate-400">Deterministic matchup qualifiers joined to the locked research. Descriptive, not a recommendation.</p>
          </div>
          <Link to="/nfl/trends" className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md bg-white px-2.5 text-[11px] font-bold text-slate-950 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            View all NFL trends <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
        {(teamPair || game) && (
          <div className="grid gap-2 border-t border-slate-700 bg-slate-100 px-2.5 py-2 text-slate-950 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">
            {teamPair && <NflTrendMatchupIdentity away={teamPair.away} home={teamPair.home} compact />}
            {game && (
              <dl className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold sm:justify-end">
                <div className="rounded-md border border-slate-300 bg-white px-2 py-1"><dt className="inline text-slate-500">Confirmed</dt> <dd className="inline tabular-nums text-slate-950">{qualifiers.length}</dd></div>
                <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1"><dt className="inline text-amber-900">Noteworthy</dt> <dd className="inline tabular-nums text-slate-950">{noteworthyCount}</dd></div>
                <div className="rounded-md border border-slate-300 bg-white px-2 py-1"><dt className="inline text-slate-500">Pending</dt> <dd className="inline tabular-nums text-slate-950">{game.pending.length}</dd></div>
              </dl>
            )}
          </div>
        )}
      </div>

      {loading && <p role="status" className="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">Loading situational trends…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-800 ring-1 ring-inset ring-red-200">Could not load situational trends. {error}</p>}
      {!loading && !error && !game && <p className="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">No generated trend record is available for this matchup.</p>}

      {!loading && game && qualifiers.length === 0 && (
        <p className="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          No researched trend is currently confirmed for this matchup. Pending inputs remain listed below when applicable.
        </p>
      )}

      <MatchupQualifierRows qualifiers={qualifiers} />

      {game && game.pending.length > 0 && (
        <details className="rounded-xl border border-slate-300 bg-slate-100/70">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-900 hover:bg-slate-200/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            Awaiting inputs ({game.pending.length})
          </summary>
          <div className="border-t border-slate-300 p-2 sm:p-3">
            <MatchupPendingRows pending={game.pending} trendById={trendById} />
          </div>
        </details>
      )}

      <p className="text-[11px] leading-5 text-slate-500">Historical situational results are descriptive and do not guarantee future outcomes.</p>
    </section>
  );
}
