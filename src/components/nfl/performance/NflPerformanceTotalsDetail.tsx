import type { ReactNode } from "react";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import NflCoachingComparison from "@/components/nfl/coaching/NflCoachingComparison";
import { COACHING_EVEN_THRESHOLD } from "@/lib/nfl/performance/coachingPresentation";
import type { TotalsPerformanceRow } from "@/types/nfl/performance";

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

/**
 * Rating gap magnitude only -- "Rating gap 8" / "Rating gap 2 (Even)". No
 * direction, no team, and deliberately never an Over/Under lean: the rating
 * differential says nothing about scoring, and rendering it as a total
 * direction would invent a signal the model does not have.
 */
function ratingGapLabel(coaching: TotalsPerformanceRow["context"]["coaching"]): string {
  if (coaching.coaching_context_status === "SOURCE_UNAVAILABLE") return "—";
  const diff = coaching.coaching_differential;
  if (diff == null) return "—";
  const gap = Math.abs(Math.round(diff));
  return gap <= COACHING_EVEN_THRESHOLD ? `Rating gap ${gap} (Even)` : `Rating gap ${gap}`;
}

function advantageLabel(team: "home" | "away" | "even" | null): string {
  if (team == null) return "—";
  if (team === "even") return "Even";
  return team === "home" ? "Home" : "Away";
}

/**
 * Full diagnostic breakdown for one totals row -- projection / market /
 * result / matchup context / coaching / provenance.
 *
 * The coaching block here is deliberately context-only: it shows both coaches,
 * their ratings and the rating gap, and NEVER an over/under lean, arrow or any
 * other implication about total direction. Coaching Rating v1 is not an input
 * to the totals model.
 */
export default function NflPerformanceTotalsDetail({ row }: { row: TotalsPerformanceRow }) {
  const { context } = row;
  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4">
      <DetailSection title="Projection">
        <Field label="Away expected points" value={formatMetric(row.away_expected_points)} />
        <Field label="Home expected points" value={formatMetric(row.home_expected_points)} />
        <Field label="Projected total" value={formatMetric(row.projected_game_total)} />
        <Field label="Model version" value={row.model_version} />
        <Field label="Prediction time" value={formatNflMetadataTimestamp(row.prediction_timestamp)} />
      </DetailSection>

      <DetailSection title="Market">
        <Field label="Market total" value={row.market_total != null ? formatMetric(row.market_total) : "Unavailable"} />
        <Field label="Provider" value={row.market_provider ?? "—"} />
        <Field label="Market time" value={row.market_timestamp ? formatNflMetadataTimestamp(row.market_timestamp) : "—"} />
        <Field label="JKB − market" value={formatSigned(row.jkb_minus_market)} />
      </DetailSection>

      <DetailSection title="Result">
        <Field label="Actual away points" value={formatMetric(row.actual_away_points, 0)} />
        <Field label="Actual home points" value={formatMetric(row.actual_home_points, 0)} />
        <Field label="Actual total" value={formatMetric(row.actual_game_total, 0)} />
        <Field label="Signed error" value={formatSigned(row.signed_total_error)} />
        <Field label="Absolute error" value={formatMetric(row.absolute_total_error)} />
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
      </DetailSection>

      <section data-testid="nfl-totals-coaching-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Coaching context</h4>
          <span className="text-[12px] font-bold tabular-nums tracking-wide text-slate-900" data-testid="nfl-totals-coaching-gap">
            {ratingGapLabel(context.coaching)}
          </span>
        </div>
        <NflCoachingComparison
          className="mt-1.5"
          coaching={context.coaching}
          homeTeam={row.home_team}
          awayTeam={row.away_team}
          showHeading={false}
        />
      </section>

      <DetailSection title="Provenance">
        <Field label="Fitted hash" value={row.fitted_model_hash ? `${row.fitted_model_hash.slice(0, 10)}…` : "—"} />
        <Field label="Home prediction ref" value={row.provenance.home_prediction_id_ref} />
        <Field label="Away prediction ref" value={row.provenance.away_prediction_id_ref} />
      </DetailSection>
    </div>
  );
}
