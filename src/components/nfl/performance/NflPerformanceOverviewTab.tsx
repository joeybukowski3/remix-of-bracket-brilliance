import type { ReactNode } from "react";
import { formatCount, formatMetric, formatPercent, noGradedResultsLabel } from "@/lib/nfl/performance/format";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import NflPerformanceKpiStrip, { type NflKpiItem } from "./NflPerformanceKpiStrip";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type { NflPerformanceOverviewArtifact } from "@/types/nfl/performance";

function FamilyCard({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  const empty = noGradedResultsLabel(n);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {empty ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="mt-2">{children}</div>
      )}
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-1.5 first:border-t-0 first:pt-0">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

/**
 * Command-center rollup: three separate family cards (Sides / Totals /
 * Props) that never blend into one combined score -- the spec is explicit
 * that unlike model families must not be averaged into a meaningless
 * cross-family number.
 */
export default function NflPerformanceOverviewTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflPerformanceOverviewArtifact>;
}) {
  if (state.loading) return <p className="text-sm text-slate-500">Loading performance overview…</p>;
  if (state.error || !state.data) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        Could not load the performance overview. Please try again later.
      </p>
    );
  }

  const { totals, props, sides } = state.data;

  const topKpis: NflKpiItem[] = [
    { key: "totals-n", label: "Totals Graded", value: formatCount(totals.graded_games) },
    { key: "props-n", label: "Props Graded", value: formatCount(props.graded_props) },
    { key: "sides-n", label: "Sides Graded", value: formatCount(sides.graded_games) },
  ];

  return (
    <div className="space-y-4">
      <NflPerformanceKpiStrip items={topKpis} className="sm:grid-cols-3 lg:grid-cols-3" />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <FamilyCard title="Sides" n={sides.graded_games}>
          <StatRow label="Graded games" value={formatCount(sides.graded_games)} />
          <StatRow label="Spread MAE" value={formatMetric(sides.spread_mae)} />
          <StatRow label="Winner accuracy" value={formatPercent(sides.winner_accuracy)} />
          <StatRow label="JKB − market MAE" value={formatMetric(sides.market_direction_metric.jkb_minus_market_mae)} />
          {sides.latest_grade_timestamp && (
            <p className="mt-2 text-[10px] text-slate-400">Latest grade: {formatNflMetadataTimestamp(sides.latest_grade_timestamp)}</p>
          )}
        </FamilyCard>

        <FamilyCard title="Totals" n={totals.graded_games}>
          <StatRow label="Graded games" value={formatCount(totals.graded_games)} />
          <StatRow label="MAE" value={formatMetric(totals.mae)} />
          <StatRow label="Bias" value={formatMetric(totals.bias)} />
          <StatRow label="Directional hit rate" value={formatPercent(totals.directional_hit_rate)} />
          {totals.latest_grade_timestamp && (
            <p className="mt-2 text-[10px] text-slate-400">Latest grade: {formatNflMetadataTimestamp(totals.latest_grade_timestamp)}</p>
          )}
        </FamilyCard>

        <FamilyCard title="Starter Props" n={props.graded_props}>
          <StatRow label="Graded starter props" value={formatCount(props.graded_props)} />
          <StatRow label="Directional hit rate" value={formatPercent(props.directional_hit_rate)} />
          <StatRow label="MAE" value={formatMetric(props.mae)} />
          <StatRow label="Passing / Rushing / Receiving" value={`${formatCount(props.passing_n)} / ${formatCount(props.rushing_n)} / ${formatCount(props.receiving_n)}`} />
          {props.latest_grade_timestamp && (
            <p className="mt-2 text-[10px] text-slate-400">Latest grade: {formatNflMetadataTimestamp(props.latest_grade_timestamp)}</p>
          )}
        </FamilyCard>
      </div>
    </div>
  );
}
