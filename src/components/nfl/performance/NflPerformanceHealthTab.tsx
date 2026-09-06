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

/** "12h ago" style freshness, paired with (never replaced by) the status badge. */
function freshnessLabel(ageMs: number | null, staleAfterHours: number): string {
  if (ageMs == null || !Number.isFinite(ageMs)) return "—";
  const hours = ageMs / (60 * 60 * 1000);
  const rendered = hours < 1 ? `${Math.max(0, Math.round(ageMs / 60000))}m` : `${hours.toFixed(1)}h`;
  return `${rendered} old (stale after ${staleAfterHours}h)`;
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

  const { totals, props, sides, coaching, workflow } = state.data;
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

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" data-testid="nfl-health-coaching">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Coaching Rating</h3>
          <NflHealthStatusBadge status={coaching?.status ?? "NOT_AVAILABLE"} />
        </div>
        {coaching == null ? (
          <p className="mt-2 text-[12px] text-slate-600" data-testid="nfl-health-coaching-missing">
            Coaching rating artifact not available.
          </p>
        ) : (
          <>
            {coaching.status === "STALE" && (
              <p
                className="mt-2 rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] leading-4 text-rose-900"
                data-testid="nfl-health-coaching-stale-note"
              >
                Stale — the current coaching-ratings artifact is older than the {coaching.stale_after_hours}h refresh allowance.
              </p>
            )}
            <div className="mt-2">
              <HealthRow label="Rating version" value={coaching.rating_version ?? "—"} />
              <HealthRow label="Current coaches rated" value={formatCount(coaching.current_coach_count)} />
              <HealthRow label="Unrated coaches" value={formatCount(coaching.unrated_coach_count)} />
              <HealthRow label="Small-sample coaches" value={formatCount(coaching.small_sample_coach_count)} />
              <HealthRow label="First-year coaches" value={formatCount(coaching.first_year_count)} />
              <HealthRow label="Historical snapshot coverage" value={formatCount(coaching.historical_snapshot_coverage)} />
              <HealthRow
                label="Latest snapshot"
                value={
                  coaching.latest_snapshot_season != null
                    ? `${coaching.latest_snapshot_season} week ${coaching.latest_snapshot_week ?? "—"}`
                    : "—"
                }
              />
              <HealthRow label="Artifact generated" value={timestampOrDash(coaching.artifact_generated_at)} />
              <HealthRow label="Freshness" value={freshnessLabel(coaching.public_artifact_age_ms, coaching.stale_after_hours)} />
              <HealthRow label="Source cutoff" value={coaching.source_cutoff ?? "—"} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              Small-sample and first-year head coaches are an expected state, not a failure — Coaching Rating v1 is deliberately
              low dynamic range and first-year coaches carry the league-average prior.
            </p>
          </>
        )}
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
