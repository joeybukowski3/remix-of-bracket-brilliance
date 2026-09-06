import { formatCount, formatMetric, formatPercent, noGradedResultsLabel } from "@/lib/nfl/performance/format";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import NflPerformanceKpiStrip, { type NflKpiItem } from "./NflPerformanceKpiStrip";
import NflPerformanceEmptyState from "./NflPerformanceEmptyState";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type { NflPerformanceOverviewArtifact } from "@/types/nfl/performance";

/**
 * Sides is live via jkb-power-number-v1.0.0, but WU4 only exposes a thin
 * canonical summary (overview.json's `sides` block) -- there is no
 * dedicated sides.json with row-level detail yet. This tab therefore shows
 * only the summary KPIs that truly exist, plus a restrained note that a
 * detailed drilldown will populate from a future dedicated artifact. It
 * never reads the raw spread archive directly to fabricate rows.
 */
export default function NflPerformanceSidesTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflPerformanceOverviewArtifact>;
}) {
  if (state.loading) return <p className="text-sm text-slate-500">Loading sides performance…</p>;
  if (state.error || !state.data) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        Could not load sides performance. Please try again later.
      </p>
    );
  }

  const { sides } = state.data;
  const empty = noGradedResultsLabel(sides.graded_games);

  const kpis: NflKpiItem[] = [
    { key: "graded", label: "Graded Games", value: formatCount(sides.graded_games) },
    { key: "spread-mae", label: "Spread MAE", value: formatMetric(sides.spread_mae) },
    { key: "winner-acc", label: "Winner Accuracy", value: formatPercent(sides.winner_accuracy) },
    { key: "jkb-mae", label: "JKB MAE", value: formatMetric(sides.market_direction_metric.jkb_mae) },
    { key: "market-mae", label: "Market MAE", value: formatMetric(sides.market_direction_metric.market_mae) },
    { key: "jkb-vs-market", label: "JKB − Market MAE", value: formatMetric(sides.market_direction_metric.jkb_minus_market_mae) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Model: <span className="font-semibold text-slate-700">jkb-power-number-v1.0.0</span>
        </span>
        {sides.latest_grade_timestamp && <span>Latest grade: {formatNflMetadataTimestamp(sides.latest_grade_timestamp)}</span>}
      </div>

      {empty ? (
        <NflPerformanceEmptyState title={empty} description="Sides results will populate as 2026 games are completed and graded." />
      ) : (
        <NflPerformanceKpiStrip items={kpis} />
      )}

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-5 text-slate-600" data-testid="nfl-sides-drilldown-note">
        Detailed sides performance log will populate from the dedicated sides performance artifact.
      </p>
    </div>
  );
}
