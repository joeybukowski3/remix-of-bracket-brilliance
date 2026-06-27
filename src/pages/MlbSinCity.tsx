import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSinCityResults, SIN_CITY_THRESHOLDS, type SinCityEvaluation } from "@/lib/mlb/mlbHrFilter";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

function formatMetric(value: number | null | undefined, suffix = "%") {
  if (value == null || !Number.isFinite(Number(value))) return "Unavailable";
  return `${Number(value).toFixed(1)}${suffix}`;
}

function CriterionPill({ name, value, threshold, pass }: { name: string; value: number | null; threshold: number; pass: boolean }) {
  const unavailable = value == null;
  return (
    <div className={`rounded-lg border px-3 py-2 ${unavailable ? "border-slate-200 bg-slate-50" : pass ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span className="text-slate-700">{name}</span>
        <span className={unavailable ? "text-slate-400" : pass ? "text-emerald-700" : "text-rose-700"}>{unavailable ? "—" : pass ? "✓" : "✗"}</span>
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">{name === "Exit Velo" ? formatMetric(value, " mph") : formatMetric(value)}</div>
      <div className="text-[10px] text-slate-500">Threshold: {threshold}{name === "Exit Velo" ? " mph" : "%"}</div>
    </div>
  );
}

function SinCityCard({ batter, evaluation, isFallback }: { batter: HrDashboardBatter; evaluation: SinCityEvaluation; isFallback: boolean }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black text-[#031635]">{batter.player}</h2>
          <p className="text-sm font-semibold text-slate-500">{batter.team} vs {batter.opponent}</p>
          <p className="mt-1 truncate text-xs text-slate-500">vs {batter.opposingPitcher || "Pitcher unavailable"}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${isFallback ? "bg-amber-100 text-amber-800" : evaluation.matchCount === 4 ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}>
          {isFallback ? "Closest Match" : `${evaluation.matchCount} of 4`}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">{evaluation.criteria.map((criterion) => <CriterionPill key={criterion.name} {...criterion} />)}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Model Rating</div><div className="font-black text-[#031635]">{Number.isFinite(batter.hrScore) ? batter.hrScore.toFixed(1) : "—"}</div></div>
        <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">HR Odds</div><div className="font-black text-[#031635]">{batter.hrOddsYes ?? "Unavailable"}</div></div>
      </div>
    </article>
  );
}

export default function MlbSinCity() {
  usePageSeo({ title: "Sin City MLB Home Run Model | Joe Knows Ball", description: "A separate MLB home-run candidate model using four batter-power thresholds.", path: "/mlb/sin-city" });
  const { batters, loading, propDate } = useMlbPropsData();
  const result = getSinCityResults(batters);
  const fourOfFour = result.rows.filter((row) => !row.isFallback && row.evaluation.matchCount === 4).length;
  const threeOfFour = result.rows.filter((row) => !row.isFallback && row.evaluation.matchCount === 3).length;

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-50 py-6">
        <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
          <MlbNavHero />
          <section className="rounded-2xl bg-[#101d38] p-5 text-white shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Separate HR Model</div>
                <h1 className="mt-2 text-3xl font-black sm:text-4xl">Sin City</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">Home-run candidates matching at least three of four batter-power thresholds. Model Rating is supporting context only.</p>
                <p className="mt-2 text-xs text-slate-400">Slate date: {propDate ?? "Unavailable"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/mlb" className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10">MLB Hub</Link>
                <Link to="/mlb/hr-props" className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold hover:bg-sky-600">Standard HR Props</Link>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["4 of 4", fourOfFour], ["3 of 4", threeOfFour], ["Players Evaluated", batters.length], ["Mode", result.isFallback ? "Closest 5" : "Qualifiers"]].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-xl font-black text-[#031635]">{value}</div></div>
            ))}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><strong className="text-slate-900">Criteria:</strong> Barrel% ≥ {SIN_CITY_THRESHOLDS.barrelRate}, Pull Air% ≥ {SIN_CITY_THRESHOLDS.pullAirRate}, Hard Hit% ≥ {SIN_CITY_THRESHOLDS.hardHitRate}, Exit Velocity ≥ {SIN_CITY_THRESHOLDS.exitVelo} mph.</section>

          {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">Loading current MLB HR data…</div> : batters.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">No current MLB HR data is available.</div> : <>
            {result.isFallback && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">No full qualifiers today — showing the five closest matches.</div>}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{result.rows.map((row) => <SinCityCard key={`${row.batter.player}-${row.batter.team}`} {...row} />)}</div>
          </>}
        </div>
      </main>
    </SiteShell>
  );
}
