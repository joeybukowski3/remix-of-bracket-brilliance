import type { ReactNode } from "react";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import type { PropsPerformanceRow } from "@/types/nfl/performance";

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
 * Model-aware rendering: `detail.context` is a free-form Record whose shape
 * varies by model/market, so it is only ever rendered as a flat list of
 * present keys -- never destructured into hardcoded field names (spec
 * section 14: "do not invent normalized field names").
 */
export default function NflPerformancePropsDetail({ row }: { row: PropsPerformanceRow }) {
  const { detail } = row;
  const contextEntries = Object.entries(detail.context ?? {}).filter(([, v]) => v != null);

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4">
      <DetailSection title="Starter eligibility">
        <Field label="Starter basis" value={row.starter_basis} />
        <Field label="Rank" value={detail.starter_rank} />
        <Field label="Workload metric" value={detail.starter_metric} />
        <Field label="Workload value" value={formatMetric(detail.starter_metric_value)} />
      </DetailSection>

      <DetailSection title="Projection">
        <Field label="JKB projection" value={formatMetric(row.jkb_projection)} />
        <Field label="Model version" value={row.model_version} />
        <Field label="Prediction time" value={formatNflMetadataTimestamp(detail.prediction_timestamp)} />
        <Field label="Projection status" value={detail.projection_status} />
      </DetailSection>

      {contextEntries.length > 0 && (
        <DetailSection title="Matchup / role context">
          {contextEntries.map(([key, value]) => (
            <Field key={key} label={key} value={typeof value === "object" ? JSON.stringify(value) : String(value)} />
          ))}
        </DetailSection>
      )}

      <DetailSection title="Market">
        <Field label="Line" value={formatMetric(row.line)} />
        <Field label="Provider" value={`${detail.market_provider} / ${detail.market_book}`} />
        <Field label="Snapshot time" value={formatNflMetadataTimestamp(detail.market_snapshot_timestamp)} />
        <Field label="Difference" value={formatSigned(row.difference)} />
      </DetailSection>

      <DetailSection title="Result">
        <Field label="Actual" value={formatMetric(row.actual)} />
        <Field label="Direction" value={row.direction} />
        <Field label="Signed error" value={formatSigned(detail.signed_projection_error)} />
        <Field label="Absolute error" value={formatMetric(row.absolute_error)} />
      </DetailSection>

      <DetailSection title="Provenance">
        <Field label="Prediction ID" value={detail.prediction_id} />
        <Field label="Fitted hash" value={detail.fitted_model_hash ? `${detail.fitted_model_hash.slice(0, 10)}…` : "—"} />
      </DetailSection>
    </div>
  );
}
