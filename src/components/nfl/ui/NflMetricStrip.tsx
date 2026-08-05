import { cn } from "@/lib/utils";

export type NflMetricTone = "good" | "bad" | "neutral" | "model";

export type NflMetric = {
  label: string;
  value: string;
  detail?: string;
  tone?: NflMetricTone;
  /** Marks the primary figure of the group; exactly one per strip. */
  primary?: boolean;
};

const TONE_TEXT: Record<NflMetricTone, string> = {
  good: "text-emerald-700",
  bad: "text-red-700",
  model: "text-sky-800",
  neutral: "text-slate-900",
};

/**
 * A compact row of labelled figures.
 *
 * Replaces the grids of individually bordered, shadowed metric cards. Those
 * gave eight unrelated numbers identical visual weight and, at 390px, shrank
 * their labels to 7px to fit four across. Here the numbers share one surface,
 * separated by hairlines, and the labels stay legible because the strip wraps
 * to two columns instead of compressing.
 */
export default function NflMetricStrip({
  metrics,
  columns = 4,
  className = "",
  ariaLabel,
}: {
  metrics: NflMetric[];
  /** Column count from `sm` up; mobile is always two so labels stay readable. */
  columns?: 3 | 4 | 5 | 6 | 8;
  className?: string;
  ariaLabel?: string;
}) {
  const columnClass = {
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
    8: "sm:grid-cols-4 lg:grid-cols-8",
  }[columns];

  return (
    <dl
      aria-label={ariaLabel}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200",
        columnClass,
        className,
      )}
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={cn("bg-white px-3 py-2.5", metric.primary && "bg-sky-50/70")}
        >
          <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {metric.label}
          </dt>
          <dd
            className={cn(
              "mt-0.5 text-lg font-bold tabular-nums leading-tight",
              TONE_TEXT[metric.tone ?? "neutral"],
            )}
          >
            {metric.value}
          </dd>
          {metric.detail && (
            <p className="mt-0.5 truncate text-[10px] leading-4 text-slate-500">{metric.detail}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
