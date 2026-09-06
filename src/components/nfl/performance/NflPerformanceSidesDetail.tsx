import type { ReactNode } from "react";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import type { SidesPerformanceRow } from "@/types/nfl/performance";

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function advantageLabel(team: "home" | "away" | "even" | null): string {
  if (team == null) return "—";
  if (team === "even") return "Even";
  return team === "home" ? "Home" : "Away";
}

function sideLabel(row: SidesPerformanceRow): string {
  if (row.jkb_ats_side == null) return "—";
  if (row.jkb_ats_side === "pick") return "Pick (no lean)";
  return `${(row.jkb_supports_team ?? row.jkb_ats_side).toUpperCase()} (${row.jkb_ats_side})`;
}

/**
 * Full diagnostic breakdown for one sides row -- JKB projection / market /
 * actual / matchup context / provenance. Coaching is always rendered as
 * "Not implemented" rather than omitted (spec section 9): no fake coaching
 * values, but the row exists so the schema reads as complete.
 */
export default function NflPerformanceSidesDetail({ row }: { row: SidesPerformanceRow }) {
  const { context } = row;
  const final = row.game_completion_status === "final";
  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4">
      <DetailSection title="JKB projection">
        <Field label="Projected home margin" value={formatSigned(row.projected_home_margin)} />
        <Field label="Projected spread" value={`${(row.projected_spread_team ?? row.home_team).toUpperCase()} ${formatMetric(row.projected_spread_line)}`} />
        <Field label="Home power number" value={formatMetric(row.home_power_number, 2)} />
        <Field label="Away power number" value={formatMetric(row.away_power_number, 2)} />
        <Field label="Home-field adjustment" value={formatMetric(row.home_field_adjustment, 1)} />
        <Field label="Model version" value={row.model_version} />
        <Field label="Prediction time" value={formatNflMetadataTimestamp(row.prediction_timestamp)} />
      </DetailSection>

      <DetailSection title="Market">
        <Field label="Market spread (home line)" value={row.market_spread != null ? formatMetric(row.market_spread) : "Unavailable"} />
        <Field label="Market-implied home margin" value={row.market_implied_home_margin != null ? formatSigned(row.market_implied_home_margin) : "—"} />
        <Field label="Provider" value={row.market_provider ?? "—"} />
        <Field label="Market time" value={row.market_snapshot_timestamp ? formatNflMetadataTimestamp(row.market_snapshot_timestamp) : "—"} />
        <Field label="JKB − market" value={formatSigned(row.jkb_minus_market)} />
        <Field label="JKB ATS side" value={sideLabel(row)} />
        <Field label="Favorite / underdog" value={row.favorite_underdog ?? "—"} />
      </DetailSection>

      <DetailSection title="Actual">
        <Field label="Actual home points" value={final ? formatMetric(row.actual_home_points, 0) : "—"} />
        <Field label="Actual away points" value={final ? formatMetric(row.actual_away_points, 0) : "—"} />
        <Field label="Actual home margin" value={final ? formatSigned(row.actual_margin, 0) : "—"} />
        <Field label="Signed margin error" value={final ? formatSigned(row.signed_margin_error) : "—"} />
        <Field label="Absolute margin error" value={final ? formatMetric(row.absolute_margin_error) : "—"} />
        <Field label="Winner call" value={final ? (row.projected_winner_correct ? "Correct" : "Incorrect") : "—"} />
      </DetailSection>

      <DetailSection title="Matchup context">
        <Field
          label="Trenches advantage"
          value={context.trenches.provenance_status === "available" ? advantageLabel(context.trenches.trenches_advantage_team) : "Unavailable"}
        />
        <Field
          label="Trenches differential"
          value={context.trenches.provenance_status === "available" ? formatSigned(context.trenches.trenches_differential, 3) : "—"}
        />
        <Field
          label="YPP advantage"
          value={context.ypp.provenance_status === "available" ? advantageLabel(context.ypp.ypp_advantage_team) : "Unavailable"}
        />
        <Field
          label="Home / away YPP"
          value={
            context.ypp.provenance_status === "available"
              ? `${formatMetric(context.ypp.home_ypp, 2)} / ${formatMetric(context.ypp.away_ypp, 2)}`
              : "Unavailable"
          }
        />
        <Field
          label="EPA advantage"
          value={context.epa.provenance_status === "available" ? advantageLabel(context.epa.epa_advantage_team) : "Unavailable"}
        />
        <Field
          label="Home / away EPA"
          value={
            context.epa.provenance_status === "available"
              ? `${formatMetric(context.epa.home_epa_value, 3)} / ${formatMetric(context.epa.away_epa_value, 3)}`
              : "Unavailable"
          }
        />
        <Field label="Coaching rating" value="Not implemented" />
      </DetailSection>

      <DetailSection title="Provenance">
        <Field label="Prediction ref" value={row.provenance.prediction_id_ref} />
        <Field label="Market snapshot ref" value={row.provenance.market_snapshot_ref ? `${row.provenance.market_snapshot_ref.slice(0, 12)}…` : "—"} />
        <Field label="Market observation id" value={row.provenance.market_observation_id ?? "—"} />
        <Field label="Outcome source hash" value={row.provenance.outcome_source_state_hash ? `${row.provenance.outcome_source_state_hash.slice(0, 12)}…` : "—"} />
      </DetailSection>
    </div>
  );
}
