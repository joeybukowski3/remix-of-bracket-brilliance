import { cn } from "@/lib/utils";
import {
  resolvePercentileDisplay,
  type PercentileDirection,
} from "@/lib/mlb/percentileColorScale";

const DASH = "—";

/**
 * Comparative metric cell using the shared 8-tier percentile scale.
 * Display-only -- never affects scores, rankings, or filters.
 *
 * Shared across MLB Batter vs. Pitcher, HR Props, and Strikeout Props so the
 * same input score/percentile always resolves to the same tier and visual
 * classes everywhere it's used.
 */
export function PercentileCell({
  value,
  display,
  percentile,
  direction = "higherBetter",
  strong = false,
  sampleSize = null,
  sampleMinimum = null,
  bypassSampleGate = false,
}: {
  value: number | null | undefined;
  display: string;
  percentile: number | null | undefined;
  direction?: PercentileDirection;
  strong?: boolean;
  sampleSize?: number | null;
  sampleMinimum?: number | null;
  bypassSampleGate?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-[11px] text-slate-300">{DASH}</span>;
  }
  const resolved = resolvePercentileDisplay({
    value,
    percentile,
    direction,
    sampleSize,
    sampleMinimum,
    bypassSampleGate,
  });
  if (!resolved.style || !resolved.tier) {
    return (
      <span
        className={cn("inline-block rounded-md px-1.5 py-0.5 text-[11px] tabular-nums text-slate-700", strong ? "font-black" : "font-bold")}
        data-percentile-tier="neutral"
        data-sample-confidence="none"
      >
        {display}
      </span>
    );
  }
  return (
    <span
      className={cn("inline-block rounded-md px-1.5 py-0.5 text-[11px] tabular-nums", strong ? "font-black" : "font-bold")}
      style={{
        backgroundColor: resolved.style.backgroundColor,
        color: resolved.style.color,
        border: resolved.style.border,
      }}
      data-percentile-tier={resolved.tier.id}
      data-sample-confidence={resolved.confidence ?? "none"}
      title={`${resolved.tier.label} · slate percentile${resolved.confidence === "sample-unavailable" ? " · sample unavailable" : resolved.confidence === "small-sample" ? " · small sample" : ""}`}
    >
      {display}
    </span>
  );
}
