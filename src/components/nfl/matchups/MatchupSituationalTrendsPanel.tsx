import { Link } from "react-router-dom";
import { ArrowRight, Clock3 } from "lucide-react";
import { QualifierEvidenceCard } from "@/components/nfl/trends/TrendEvidenceCard";
import {
  NflTrendMatchupIdentity,
  NflTrendTeamIdentity,
  TrendTierBadge,
} from "@/components/nfl/trends/TrendPresentation";
import { TREND_TIER_PRESENTATION } from "@/components/nfl/trends/trendPresentationConfig";
import { cn } from "@/lib/utils";
import {
  TREND_STATUS_LABELS,
  TREND_TIER_LABELS,
  gameById,
  resolveGameQualifiers,
  type NflSituationalTrendsArtifact,
  type TrendTier,
} from "@/lib/nfl/situationalTrends";

const TIERS: TrendTier[] = ["NOTEWORTHY", "CONTEXTUAL", "CLASSIC_ANGLE"];

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
  const teamPair = game
    ? { away: { abbr: game.away, name: game.awayName }, home: { abbr: game.home, name: game.homeName } }
    : matchup.away && matchup.home
      ? { away: { abbr: matchup.away.abbr, name: matchup.away.teamName }, home: { abbr: matchup.home.abbr, name: matchup.home.teamName } }
      : null;

  return (
    <section aria-labelledby="situational-trends-heading" className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div>
            <h2 id="situational-trends-heading" className="text-lg font-black tracking-tight">Situational Trends</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
              Deterministic matchup qualifiers joined to the locked 2011–2025 research. Evidence tiers describe historical support, not a betting recommendation.
            </p>
          </div>
          <Link to="/nfl/trends" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-bold text-slate-950 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            View all NFL trends <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {(teamPair || game) && (
          <div className="grid gap-3 border-t border-slate-700 bg-slate-100 p-3 text-slate-950 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
            {teamPair && <NflTrendMatchupIdentity away={teamPair.away} home={teamPair.home} compact />}
            {game && (
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-slate-300 bg-white px-2 py-1.5"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Confirmed</dt><dd className="text-base font-black tabular-nums">{qualifiers.length}</dd></div>
                <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5"><dt className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Noteworthy</dt><dd className="text-base font-black tabular-nums">{noteworthyCount}</dd></div>
                <div className="rounded-md border border-slate-300 bg-white px-2 py-1.5"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Pending</dt><dd className="text-base font-black tabular-nums">{game.pending.length}</dd></div>
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

      {TIERS.map((tier) => {
        const rows = qualifiers.filter((qualifier) => qualifier.trend.tier === tier);
        if (rows.length === 0) return null;
        const treatment = TREND_TIER_PRESENTATION[tier];
        return (
          <section key={tier} aria-labelledby={`trend-tier-${tier}`} className={cn("rounded-xl border p-3 sm:p-4", treatment.card)}>
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <TrendTierBadge tier={tier} />
                <h3 id={`trend-tier-${tier}`} className="sr-only">{TREND_TIER_LABELS[tier]}</h3>
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-slate-600">{rows.length} {rows.length === 1 ? "qualifier" : "qualifiers"}</span>
            </div>
            <div className="grid gap-3 2xl:grid-cols-2">
              {rows.map((qualifier) => <QualifierEvidenceCard key={`${qualifier.team}-${qualifier.trendId}`} qualifier={qualifier} />)}
            </div>
          </section>
        );
      })}

      {game && game.pending.length > 0 && (
        <details className="rounded-xl border border-slate-300 bg-slate-100/70">
          <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-slate-900 hover:bg-slate-200/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            Awaiting inputs ({game.pending.length})
          </summary>
          <div className="grid gap-2 border-t border-slate-300 p-3 sm:grid-cols-2">
            {game.pending.map((row) => (
              <div key={`${row.team}-${row.trendId}`} className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white p-3 text-[11px] leading-4 text-slate-700">
                <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                <div>
                  <div className="mb-2"><NflTrendTeamIdentity abbr={row.team} compact /></div>
                  <p className="font-bold text-slate-900">{artifact?.researchLibrary.find((trend) => trend.id === row.trendId)?.name ?? row.trendId}</p>
                  <p>{TREND_STATUS_LABELS[row.status]} — {row.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-[11px] leading-5 text-slate-500">Historical situational results are descriptive and do not guarantee future outcomes.</p>
    </section>
  );
}
