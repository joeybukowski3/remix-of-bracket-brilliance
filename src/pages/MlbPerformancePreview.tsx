import SiteShell from "@/components/layout/SiteShell";
import HrModelSection from "@/components/mlb/performance-preview/HrModelSection";
import NumerologySection from "@/components/mlb/performance-preview/NumerologySection";
import SinCitySection from "@/components/mlb/performance-preview/SinCitySection";
import { useMlbHrModelPerformance } from "@/hooks/useMlbHrModelPerformance";
import { useMlbNumerologyPerformance } from "@/hooks/useMlbNumerologyPerformance";
import { useSinCityPerformance } from "@/hooks/useSinCityPerformance";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function MlbPerformancePreview() {
  usePageSeo({
    title: "MLB Performance Preview",
    description: "Internal review page for MLB HR model, numerology, and Sin City grading history.",
    path: "/mlb/performance-preview",
    noindex: true,
  });

  const hr = useMlbHrModelPerformance();
  const numerology = useMlbNumerologyPerformance();
  const sinCity = useSinCityPerformance();

  return (
    <SiteShell>
      <div className="site-container site-stack py-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
          Internal review page -- not linked from site navigation. Data is read-only from generated model/grading files.
        </div>

        <h1 className="mt-4 text-2xl font-black text-slate-900">MLB Performance Preview</h1>
        <p className="mt-1 text-sm text-slate-500">HR model, numerology, and Sin City grading history from the automated tracking workflows.</p>

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
