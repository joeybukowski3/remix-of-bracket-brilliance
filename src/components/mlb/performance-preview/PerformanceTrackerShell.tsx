import { useEffect, useMemo, useState } from "react";
import { useMlbHrModelPerformance } from "@/hooks/useMlbHrModelPerformance";
import { useMlbNumerologyPerformance } from "@/hooks/useMlbNumerologyPerformance";
import { useSinCityPerformance } from "@/hooks/useSinCityPerformance";
import { useTopKPerformance } from "@/hooks/useTopKPerformance";
import { getEtDateString, isDateInWindow, TIME_WINDOWS, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { HR_SCORE_BANDS, isHrRecordGraded, type HrScoreBandId } from "@/lib/mlb/performancePreviewTrackers/hrModelTracker";
import { isNumerologyRecordFinalized, NUMEROLOGY_CATEGORIES, type NumerologyCategoryId } from "@/lib/mlb/performancePreviewTrackers/numerologyTracker";
import { SIN_CITY_CATEGORIES, type SinCityCategoryId } from "@/lib/mlb/performancePreviewTrackers/sinCityTracker";
import { TOP_K_CATEGORIES } from "@/lib/mlb/performancePreviewTrackers/topKTracker";
import CategoryTabBar from "./CategoryTabBar";
import FreshnessStatus from "./FreshnessStatus";
import HrModelPanel from "./HrModelPanel";
import MainTabBar from "./MainTabBar";
import NumerologyPanel from "./NumerologyPanel";
import SinCityPanel from "./SinCityPanel";
import TimeWindowToggle from "./TimeWindowToggle";
import TopKPanel from "./TopKPanel";

type MainTabId = "hr" | "numerology" | "sinCity" | "topK";

const MAIN_TABS: { id: MainTabId; label: string }[] = [
  { id: "hr", label: "HR Model" },
  { id: "numerology", label: "Numerology" },
  { id: "sinCity", label: "Sin City" },
  { id: "topK", label: "Top K Prop" },
];

export default function PerformanceTrackerShell({ referenceDate = getEtDateString() }: { referenceDate?: string } = {}) {
  const [mainTab, setMainTab] = useState<MainTabId>("hr");
  const [window, setWindow] = useState<TimeWindowId>("last30");
  const [hrBand, setHrBand] = useState<HrScoreBandId>("80plus");
  const [numerologyCategory, setNumerologyCategory] = useState<NumerologyCategoryId>("topPlay");
  const [sinCityCategory, setSinCityCategory] = useState<SinCityCategoryId>("fiveOfFive");

  // hr-prediction-history.json is ~41MB -- only fetch it once the HR tab has
  // actually been activated at least once, and keep it enabled afterward so
  // switching away and back never re-fetches. See useMlbHrModelPerformance.
  const [hrActivated, setHrActivated] = useState(mainTab === "hr");
  useEffect(() => {
    if (mainTab === "hr") setHrActivated(true);
  }, [mainTab]);

  const hr = useMlbHrModelPerformance(hrActivated);
  const numerology = useMlbNumerologyPerformance();
  const sinCity = useSinCityPerformance();
  const topK = useTopKPerformance();

  const active = MAIN_TABS.find((t) => t.id === mainTab)!;

  const freshness = useMemo(() => {
    switch (mainTab) {
      case "hr": {
        const pendingCount = (hr.history?.records ?? []).filter(
          (r) => !isHrRecordGraded(r) && isDateInWindow(r.date, window, referenceDate),
        ).length;
        return {
          generatedAt: hr.summary?.generatedAt ?? hr.history?.lastUpdatedAt ?? null,
          gradedThrough: null,
          hasError: !hr.loading && !hr.history,
          errorMessage: hr.error,
          pendingCount,
        };
      }
      case "numerology": {
        const pendingCount = (numerology.history?.records ?? []).filter(
          (r) => !isNumerologyRecordFinalized(r) && isDateInWindow(r.date, window, referenceDate),
        ).length;
        return {
          generatedAt: numerology.summary?.generatedAt ?? numerology.history?.generatedAt ?? null,
          gradedThrough: null,
          hasError: !numerology.loading && !numerology.history,
          errorMessage: numerology.error,
          pendingCount,
        };
      }
      case "sinCity": {
        const pendingCount = (sinCity.history?.records ?? []).filter(
          (r) => r.resultStatus === "pending" && isDateInWindow(r.date, window, referenceDate),
        ).length;
        return {
          generatedAt: sinCity.summary?.generatedAt ?? sinCity.history?.generatedAt ?? null,
          gradedThrough: sinCity.summary?.mostRecentGradedDate ?? null,
          hasError: !sinCity.loading && !sinCity.history,
          errorMessage: sinCity.error,
          pendingCount,
        };
      }
      case "topK": {
        const pendingCount = (topK.history?.records ?? []).filter(
          (r) => r.resultStatus === "pending" && isDateInWindow(r.date, window, referenceDate),
        ).length;
        return {
          generatedAt: topK.summary?.generatedAt ?? topK.history?.generatedAt ?? null,
          gradedThrough: topK.summary?.mostRecentGradedDate ?? null,
          hasError: !topK.loading && !topK.history,
          errorMessage: topK.error,
          pendingCount,
        };
      }
      default:
        return { generatedAt: null, gradedThrough: null, hasError: false, errorMessage: null, pendingCount: 0 };
    }
  }, [mainTab, window, referenceDate, hr, numerology, sinCity, topK]);

  const activeLoading =
    (mainTab === "hr" && hr.loading) ||
    (mainTab === "numerology" && numerology.loading) ||
    (mainTab === "sinCity" && sinCity.loading) ||
    (mainTab === "topK" && topK.loading);

  return (
    <section className="space-y-3 rounded-2xl border-2 border-slate-300 bg-white p-3 shadow-sm sm:p-4">
      <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">MLB Performance Tracker</h2>

      <MainTabBar tabs={MAIN_TABS} value={mainTab} onChange={setMainTab} />

      <FreshnessStatus
        generatedAt={freshness.generatedAt}
        gradedThrough={freshness.gradedThrough}
        hasError={freshness.hasError}
        errorMessage={freshness.errorMessage}
        pendingCount={freshness.pendingCount}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
        {mainTab === "hr" && <CategoryTabBar tabs={HR_SCORE_BANDS.map((b) => ({ id: b.id, label: b.label }))} value={hrBand} onChange={setHrBand} />}
        {mainTab === "numerology" && (
          <CategoryTabBar tabs={NUMEROLOGY_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={numerologyCategory} onChange={setNumerologyCategory} />
        )}
        {mainTab === "sinCity" && (
          <CategoryTabBar tabs={SIN_CITY_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={sinCityCategory} onChange={setSinCityCategory} />
        )}
        {mainTab === "topK" && (
          <CategoryTabBar
            tabs={TOP_K_CATEGORIES.map((c) => ({
              id: c.id,
              label: c.label,
              disabled: !c.available,
              title: c.available ? undefined : "Ranked Best-Value tiers require a new tracking methodology (Phase 2) and are not available yet.",
            }))}
            value="all"
            onChange={() => {}}
          />
        )}

        <TimeWindowToggle value={window} onChange={setWindow} accentClassName="bg-slate-900" />
      </div>

      {activeLoading && <p className="text-sm text-slate-500">Loading {active.label} performance…</p>}

      {!activeLoading && mainTab === "hr" && hr.history && (
        <HrModelPanel history={hr.history} window={window} band={hrBand} referenceDate={referenceDate} />
      )}
      {!activeLoading && mainTab === "numerology" && numerology.history && (
        <NumerologyPanel history={numerology.history} window={window} category={numerologyCategory} referenceDate={referenceDate} />
      )}
      {!activeLoading && mainTab === "sinCity" && sinCity.history && (
        <SinCityPanel history={sinCity.history} window={window} category={sinCityCategory} referenceDate={referenceDate} />
      )}
      {!activeLoading && mainTab === "topK" && topK.history && <TopKPanel history={topK.history} window={window} referenceDate={referenceDate} />}
    </section>
  );
}
