import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/nfl/performance/format";
import type { WlpRecord } from "@/lib/nfl/performance/records";

export type NflRecordMetric = {
  key: string;
  /** "ATS", "SU", "O/U" */
  label: string;
  season: WlpRecord;
  /** null when no single week is selected. */
  week: WlpRecord | null;
  /** SU shows ties only when they exist; ATS and O/U always show the pushes slot. */
  hidePushesWhenZero?: boolean;
  /** Noun for the third slot in the accessible label ("pushes" / "ties"). */
  pushNoun?: "pushes" | "ties";
  /** What the neutral count means, e.g. "pick" (SU) / "neutral" (Totals). */
  neutralNoun?: string;
};

/**
 * W-L-P figure. Each number carries its own semantic color (green = wins,
 * red = losses, amber = pushes); the surrounding card is never tinted by
 * whether the record is above .500.
 */
export function NflRecordFigure({
  record,
  hidePushesWhenZero = false,
  pushNoun = "pushes",
  testId,
}: {
  record: WlpRecord;
  hidePushesWhenZero?: boolean;
  pushNoun?: "pushes" | "ties";
  testId?: string;
}) {
  const showPushes = !hidePushesWhenZero || record.pushes > 0;
  const label = `${record.wins} wins, ${record.losses} losses${showPushes ? `, ${record.pushes} ${pushNoun}` : ""}`;
  return (
    <span className="tabular-nums" role="img" aria-label={label} data-testid={testId}>
      <span className="text-green-700">{record.wins}</span>
      <span className="text-slate-400">-</span>
      <span className="text-red-700">{record.losses}</span>
      {showPushes && (
        <>
          <span className="text-slate-400">-</span>
          <span className="text-amber-600">{record.pushes}</span>
        </>
      )}
    </span>
  );
}

function RecordCell({ metric, record, scope }: { metric: NflRecordMetric; record: WlpRecord; scope: "season" | "week" }) {
  return (
    <div
      className="flex min-w-[9.5rem] flex-1 items-baseline gap-2 border-l-2 border-emerald-600 bg-white px-2.5 py-1.5"
      data-testid={`nfl-record-${metric.key}-${scope}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{metric.label}</span>
      <span className="text-lg font-bold leading-none">
        <NflRecordFigure record={record} hidePushesWhenZero={metric.hidePushesWhenZero} pushNoun={metric.pushNoun} />
      </span>
      <span className="text-[11px] text-slate-500">
        {record.hitRate == null ? "no decided games" : `${formatPercent(record.hitRate)} hit`}
        {record.neutral > 0 && (
          <span className="ml-1.5 font-semibold text-amber-700">
            · {record.neutral} {metric.neutralNoun ?? "neutral"}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Primary record summary: Season row always, Selected Week row when a single
 * week is chosen. Compact segments, deliberately not oversized dashboard tiles.
 */
export default function NflPerformanceRecordSummary({
  seasonLabel,
  weekLabel,
  metrics,
  className,
}: {
  seasonLabel: string;
  weekLabel: string | null;
  metrics: readonly NflRecordMetric[];
  className?: string;
}) {
  return (
    <section aria-label="Record summary" className={cn("space-y-1.5", className)} data-testid="nfl-record-summary">
      <RecordRow title={seasonLabel} scope="season" metrics={metrics} />
      {weekLabel != null && <RecordRow title={weekLabel} scope="week" metrics={metrics} />}
    </section>
  );
}

function RecordRow({ title, scope, metrics }: { title: string; scope: "season" | "week"; metrics: readonly NflRecordMetric[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 shadow-sm">
      <p className="bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-100">{title}</p>
      <div className="flex flex-wrap divide-slate-200 sm:divide-x">
        {metrics.map((metric) => {
          const record = scope === "season" ? metric.season : metric.week;
          return record ? <RecordCell key={metric.key} metric={metric} record={record} scope={scope} /> : null;
        })}
      </div>
    </div>
  );
}
