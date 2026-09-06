import { Navigate, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflPerformanceData } from "@/hooks/useNflPerformanceData";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflPerformanceTabs, { isNflPerformanceTabId } from "@/components/nfl/performance/NflPerformanceTabs";
import NflPerformanceOverviewTab from "@/components/nfl/performance/NflPerformanceOverviewTab";
import NflPerformanceSidesTab from "@/components/nfl/performance/NflPerformanceSidesTab";
import NflPerformanceTotalsTab from "@/components/nfl/performance/NflPerformanceTotalsTab";
import NflPerformancePropsTab from "@/components/nfl/performance/NflPerformancePropsTab";
import NflPerformanceGameLogTab from "@/components/nfl/performance/NflPerformanceGameLogTab";
import NflPerformanceHealthTab from "@/components/nfl/performance/NflPerformanceHealthTab";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";

const SEASON = 2026;

/**
 * /nfl/performance/:tab -- the unified NFL Results / Performance Center.
 * Tab state lives in the URL (real links, not client-only state), matching
 * the platform's existing subroute convention. Each of the four canonical
 * artifacts loads independently via useNflPerformanceData -- a failure in
 * one (most likely health.json) never blanks the other tabs.
 */
export default function NFLPerformance() {
  const { tab } = useParams<{ tab?: string }>();
  const data = useNflPerformanceData();

  usePageSeo({
    title: "NFL Performance | Joe Knows Ball",
    description: "Forward-tracked JKB model performance from archived pregame predictions -- sides, totals and starter props.",
    path: "/nfl/performance",
  });

  if (!isNflPerformanceTabId(tab)) {
    return <Navigate to="/nfl/performance/overview" replace />;
  }

  const lastUpdated = [
    data.overview.data?.performanceMeta.generatedAt,
    data.totals.data?.performanceMeta.generatedAt,
    data.props.data?.performanceMeta.generatedAt,
    data.health.data?.performanceMeta.generatedAt,
  ]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Performance"
        title="NFL Performance"
        description="Forward-tracked JKB model performance from archived pregame predictions, not retrospective re-runs."
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700">
            Season {SEASON}
          </span>
          {lastUpdated && <span>Last updated {formatNflMetadataTimestamp(lastUpdated)}</span>}
        </div>
      </NflPageHeader>

      <NflPerformanceTabs active={tab} />

      <div className="pt-4" role="tabpanel" aria-label={tab}>
        {tab === "overview" && <NflPerformanceOverviewTab state={data.overview} />}
        {tab === "sides" && <NflPerformanceSidesTab state={data.overview} />}
        {tab === "totals" && <NflPerformanceTotalsTab state={data.totals} />}
        {tab === "props" && <NflPerformancePropsTab state={data.props} />}
        {tab === "game-log" && <NflPerformanceGameLogTab />}
        {tab === "health" && <NflPerformanceHealthTab state={data.health} />}
      </div>
    </>
  );
}
