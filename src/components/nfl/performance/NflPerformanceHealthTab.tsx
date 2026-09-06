import type { ReactNode } from "react";
import { formatCount } from "@/lib/nfl/performance/format";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { NflHealthStatusBadge } from "./NflPerformanceBadges";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type { NflPerformanceHealthArtifact } from "@/types/nfl/performance";

function HealthRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-1.5 first:border-t-0 first:pt-0">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="text-[12px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function timestampOrDash(value: string | null): string {
  return value ? formatNflMetadataTimestamp(value) : "—";
}

/**
 * Operational status only -- predictive performance (MAE / hit rate) is
 * deliberately never shown here (spec section 16: "Predictive performance
 * is NOT health").
 */
export default function NflPerformanceHealthTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflPerformanceHealthArtifact>;
}) {
  if (state.loading) return <p className="text-sm text-slate-500">Loading model health…</p>;
  if (state.error || !state.data) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        Could not load model health. Please try again later.
      </p>
    );
  }

  const { totals, props, sides, workflow } = state.data;
  const propsCoverageIsOnlyMissingSlots =
    props.status === "DEGRADED" &&
    props.missing_starter_slots > 0 &&
    props.unresolved_final_games === 0 &&
    props.starter_prop_evaluation_row_count === 0;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Totals</h3>
          <NflHealthStatusBadge status={totals.status} />
        </div>
        <div className="mt-2">
          <HealthRow label="Latest prediction" value={timestampOrDash(totals.latest_prediction_timestamp)} />
          <HealthRow label="Latest generation" value={timestampOrDash(totals.latest_generation_timestamp)} />
          <HealthRow label="Archived / expected games" value={`${formatCount(totals.archived_games)} / ${formatCount(totals.expected_games)}`} />
          <HealthRow label="Missing team-total rows" value={formatCount(totals.missing_team_total_rows)} />
          <HealthRow label="Unresolved completed games" value={formatCount(totals.unresolved_completed_games)} />
          <HealthRow label="Duplicate prediction IDs" value={formatCount(totals.duplicate_prediction_ids)} />
          <HealthRow label="Model versions" value={totals.model_versions_seen.join(", ") || "—"} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Starter Props</h3>
          <NflHealthStatusBadge status={props.status} />
        </div>
        {propsCoverageIsOnlyMissingSlots && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-900" data-testid="nfl-health-props-coverage-note">
            Starter coverage: {formatCount(props.starter_cohort_row_count)} / {formatCount(props.expected_starter_slot_count)} —{" "}
            {props.missing_starter_slots} starter slot{props.missing_starter_slots === 1 ? "" : "s"} unavailable from valid pregame projection evidence.
          </p>
        )}
        <div className="mt-2">
          <HealthRow label="Starter cohort / expected slots" value={`${formatCount(props.starter_cohort_row_count)} / ${formatCount(props.expected_starter_slot_count)}`} />
          <HealthRow label="Missing starter slots" value={formatCount(props.missing_starter_slots)} />
          <HealthRow label="Latest passing prediction" value={timestampOrDash(props.latest_passing_prediction_timestamp)} />
          <HealthRow label="Latest rushing prediction" value={timestampOrDash(props.latest_rushing_prediction_timestamp)} />
          <HealthRow label="Latest receiving prediction" value={timestampOrDash(props.latest_receiving_prediction_timestamp)} />
          <HealthRow label="Starter prop evaluation rows" value={formatCount(props.starter_prop_evaluation_row_count)} />
          <HealthRow label="Unresolved final games" value={formatCount(props.unresolved_final_games)} />
          <HealthRow label="Missing comparison lines" value={formatCount(props.missing_comparison_line_count)} />
          <HealthRow label="Player outcome backlog" value={formatCount(props.player_outcome_backlog)} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Sides</h3>
          <NflHealthStatusBadge status={sides.status} />
        </div>
        <div className="mt-2">
          <HealthRow label="Latest spread prediction" value={timestampOrDash(sides.latest_spread_prediction_timestamp)} />
          <HealthRow label="Latest spread evaluation" value={timestampOrDash(sides.latest_spread_evaluation_timestamp)} />
          <HealthRow label="Unresolved final games" value={formatCount(sides.unresolved_final_games)} />
          <HealthRow label="Public performance view" value={<NflHealthStatusBadge status={sides.public_performance_view_status} />} />
          <HealthRow label="Model versions" value={sides.model_versions_seen.join(", ") || "—"} />
        </div>
      </section>

      {Object.keys(workflow.generated_at_by_artifact).length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workflow / Artifact Generation</h3>
          <div className="mt-2 space-y-1">
            {Object.entries(workflow.generated_at_by_artifact).map(([artifact, ts]) => (
              <div key={artifact} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-slate-500" title={artifact}>{artifact}</span>
                <span className="shrink-0 font-medium text-slate-700">{formatNflMetadataTimestamp(ts)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
