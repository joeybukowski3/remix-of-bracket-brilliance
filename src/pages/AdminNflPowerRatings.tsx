import { useMemo, useState } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflRatingsReview } from "@/hooks/useNflRatingsReview";
import {
  computePlayoffTeams,
  computeRecordRanks,
  computeReviewFlags,
  formatRecord,
  type PowerRatingRow,
  type RatingComponent,
  type TeamStatsRow,
} from "@/lib/nfl/powerRatingsReview";

const SEASONS = [2025, 2024, 2023, 2022, 2026];
const DEFAULT_SEASON = 2025;

/**
 * Internal model-review surface (PR-9). Hidden route, noindexed, not linked
 * from any public navigation. There is no auth system in this app yet, so
 * this page is hidden/internal only — real access control is a documented
 * follow-up. It renders the generated internal model data for human review
 * and must never show betting language or market data.
 */
export default function AdminNflPowerRatings() {
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const { loading, error, data } = useNflRatingsReview(season);

  usePageSeo({
    title: "Internal NFL Model Review",
    description: "Internal power ratings model review page.",
    path: "/admin/nfl/power-ratings",
    noindex: true,
  });

  const statsByAbbr = useMemo(
    () => new Map((data?.teamStats ?? []).map((row) => [row.abbr, row])),
    [data]
  );
  const recordRanks = useMemo(() => computeRecordRanks(data?.teamStats ?? []), [data]);
  const playoffTeams = useMemo(() => computePlayoffTeams(data?.results ?? []), [data]);

  const ratedCount = data?.ratings.length ?? 0;
  const statsCount = data?.teamStats.filter((t) => t.gamesPlayed > 0).length ?? 0;

  return (
    <main className="min-h-screen bg-slate-100 pb-16">
      <section className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Internal · Model Review · Not public</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">NFL Power Ratings Review</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Human review surface for the internal team-rating model. Experimental output — not validated and not betting guidance.
            This route is hidden and noindexed; it is not linked from public navigation. Access control is a follow-up.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SEASONS.map((y) => (
              <button
                key={y}
                onClick={() => setSeason(y)}
                className={`rounded-full border px-3 py-1 text-xs font-black transition ${y === season ? "border-amber-400 bg-amber-400 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-400"}`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6">
        {loading && <p className="text-sm text-slate-500">Loading internal model data…</p>}
        {error && <p className="text-sm font-semibold text-red-700">Could not load internal model data for {season}.</p>}

        {!loading && !error && data && (
          <>
            <section className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Model metadata</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <MetaRow label="Model version" value={data.model?.modelVersion ?? "—"} />
                  <MetaRow label="Formula tier" value={data.model?.formula ?? "—"} />
                  <MetaRow
                    label="Weights"
                    value={
                      data.model
                        ? Object.entries(data.model.weights)
                            .map(([key, weight]) => `${Math.round(weight * 100)}% ${key}`)
                            .join(" · ")
                        : "—"
                    }
                  />
                  <MetaRow label="Generated" value={data.meta?.generatedAt ?? "—"} />
                  <MetaRow label="Sources" value={data.model?.sources.join(" · ") ?? "—"} />
                  <MetaRow label="Schedule method" value={data.model?.scheduleAdjustmentMethod ?? "—"} />
                </dl>
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900" data-testid="experimental-note">
                  Experimental model output for internal review only — not validated and not betting guidance.
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Season status</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <MetaRow label="Rated teams" value={String(ratedCount)} />
                  <MetaRow label="Teams with completed games" value={String(statsCount)} />
                  <MetaRow label="Advanced metrics" value={data.model?.advancedMetricsAvailable ? "available (EPA, yards/play, turnovers)" : "unavailable — fields null"} />
                  <MetaRow label="Schedule adjustment" value={ratedCount > 0 && data.ratings[0]?.scheduleAdjustment != null ? "available" : "unavailable"} />
                  <MetaRow label="Playoff data" value={playoffTeams.size > 0 ? `${playoffTeams.size} postseason teams` : "not available"} />
                </dl>
                {ratedCount === 0 && (
                  <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900" data-testid="unrated-note">
                    {season} is unrated: no completed games exist yet, so the model produces placeholder stats only. Nothing is seeded or invented.
                  </p>
                )}
              </article>
            </section>

            {ratedCount > 0 && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">
                  {season} ratings · {data.model?.modelVersion} · {data.model?.formula}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500">
                        <th className="px-2 py-2">Rank</th>
                        <th className="px-2 py-2 text-left">Team</th>
                        <th className="px-2 py-2">Record</th>
                        <th className="px-2 py-2">Rating</th>
                        <th className="px-2 py-2">Off</th>
                        <th className="px-2 py-2">Def</th>
                        <th className="px-2 py-2">Sched adj</th>
                        <th className="px-2 py-2">Components (raw → normalized × weight)</th>
                        <th className="px-2 py-2 text-left">Review flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ratings.map((row) => (
                        <RatingRow
                          key={row.abbr}
                          row={row}
                          stats={statsByAbbr.get(row.abbr)}
                          recordRanks={recordRanks}
                          playoffTeams={playoffTeams}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] leading-4 text-slate-500">
                  Flags are neutral model-review signals (record disagreement, efficiency signal, schedule context) — they are not
                  recommendations. Data: repo-generated power-ratings.json / team-stats.json / results.json only.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-40 shrink-0 font-black text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">{value}</dd>
    </div>
  );
}

function ComponentCell({ name, component }: { name: string; component: RatingComponent }) {
  const normalized = component.normalized ?? component.normalizedInverted;
  return (
    <span className="mr-2 inline-block whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5" data-testid={`component-${name}`}>
      <span className="font-bold text-slate-500">{name}:</span> {component.raw}
      {normalized != null ? ` → ${normalized}` : ""} <span className="text-slate-400">×{component.weight}</span>
    </span>
  );
}

function RatingRow({
  row,
  stats,
  recordRanks,
  playoffTeams,
}: {
  row: PowerRatingRow;
  stats: TeamStatsRow | undefined;
  recordRanks: Map<string, number>;
  playoffTeams: Set<string>;
}) {
  const flags = computeReviewFlags(row, stats, recordRanks, playoffTeams);
  return (
    <tr className="border-t border-slate-100 align-top hover:bg-amber-50/40">
      <td className="px-2 py-2 text-center font-black">{row.rank}</td>
      <td className="px-2 py-2 font-black text-slate-900">
        {row.name} <span className="font-semibold text-slate-400">({row.abbr})</span>
      </td>
      <td className="px-2 py-2 text-center font-bold">{formatRecord(stats)}</td>
      <td className="px-2 py-2 text-center font-black text-slate-900">{row.rating}</td>
      <td className="px-2 py-2 text-center">{row.offenseRating}</td>
      <td className="px-2 py-2 text-center">{row.defenseRating}</td>
      <td className="px-2 py-2 text-center">{row.scheduleAdjustment ?? "—"}</td>
      <td className="px-2 py-2">
        <div className="max-w-[420px]">
          {Object.entries(row.components)
            .filter(([, component]) => component.weight > 0)
            .map(([name, component]) => (
              <ComponentCell key={name} name={name} component={component} />
            ))}
        </div>
      </td>
      <td className="px-2 py-2">
        {flags.length === 0 ? (
          <span className="text-slate-300">—</span>
        ) : (
          flags.map((flag) => (
            <span
              key={flag.label}
              className="mb-1 mr-1 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900"
            >
              {flag.label}
            </span>
          ))
        )}
      </td>
    </tr>
  );
}
