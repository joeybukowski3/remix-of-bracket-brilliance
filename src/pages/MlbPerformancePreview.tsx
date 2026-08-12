import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import HrModelSection from "@/components/mlb/performance-preview/HrModelSection";
import NumerologySection from "@/components/mlb/performance-preview/NumerologySection";
import SinCitySection from "@/components/mlb/performance-preview/SinCitySection";
import { useMlbHrModelPerformance } from "@/hooks/useMlbHrModelPerformance";
import { useMlbNumerologyPerformance } from "@/hooks/useMlbNumerologyPerformance";
import { useSinCityPerformance } from "@/hooks/useSinCityPerformance";
import { usePageSeo } from "@/hooks/usePageSeo";

const CONTEXTUAL_LINK_CLASSES = "rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-50";

export default function MlbPerformancePreview() {
  usePageSeo({
    title: "MLB Results Tracker",
    description: "Tracked historical results for the MLB HR model, numerology, and Sin City picks.",
    path: "/mlb/performance-preview",
    noindex: true,
  });

  const hr = useMlbHrModelPerformance();
  const numerology = useMlbNumerologyPerformance();
  const sinCity = useSinCityPerformance();

  return (
    <SiteShell>
      <div className="site-container site-stack py-6">
        <nav aria-label="MLB Results Tracker navigation" className="flex flex-wrap items-center gap-2">
          <Link to="/mlb" className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" /> MLB Hub
          </Link>
          <Link to="/mlb/hr-props" className={CONTEXTUAL_LINK_CLASSES}>HR Props</Link>
          <Link to="/mlb/numerology" className={CONTEXTUAL_LINK_CLASSES}>Numerology</Link>
        </nav>

        <h1 className="mt-4 text-2xl font-black text-slate-900">MLB Results Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">HR model, numerology, and Sin City grading history from the automated tracking workflows.</p>
        <p className="mt-2 text-xs text-slate-400">Read-only -- all figures below come directly from the generated model/grading data files.</p>

        <div className="mt-6 space-y-10">
          {hr.loading && <p className="text-sm text-slate-500">Loading HR model performance…</p>}
          {hr.error && <p className="text-sm text-rose-600">Failed to load HR model performance: {hr.error}</p>}
          {hr.summary && hr.history && <HrModelSection summary={hr.summary} records={hr.history.records} />}

          {numerology.loading && <p className="text-sm text-slate-500">Loading numerology performance…</p>}
          {numerology.error && <p className="text-sm text-rose-600">Failed to load numerology performance: {numerology.error}</p>}
          {numerology.summary && numerology.history && <NumerologySection summary={numerology.summary} records={numerology.history.records} />}

          {sinCity.loading && <p className="text-sm text-slate-500">Loading Sin City performance…</p>}
          {sinCity.error && <p className="text-sm text-rose-600">Failed to load Sin City performance: {sinCity.error}</p>}
          {sinCity.summary && sinCity.history && <SinCitySection summary={sinCity.summary} records={sinCity.history.records} />}
        </div>
      </div>
    </SiteShell>
  );
}
