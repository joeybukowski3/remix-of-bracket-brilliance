import { cn } from "@/lib/utils";
import type { DirectionalResult, NflHealthStatus } from "@/types/nfl/performance";

/**
 * Shared WIN/LOSS/PUSH/NEUTRAL result chip for Totals and Props rows.
 * Deliberately a small pill, not a full-row tint -- the spec calls out that
 * an entire bright green/red row reads as more confident than the sample
 * size (frequently n=0-1 during the 2026 preseason) actually supports.
 */
const RESULT_CLASS: Record<DirectionalResult, string> = {
  WIN: "border-emerald-300 bg-emerald-50 text-emerald-800",
  LOSS: "border-rose-300 bg-rose-50 text-rose-800",
  PUSH: "border-slate-300 bg-slate-100 text-slate-700",
  NEUTRAL: "border-slate-300 bg-slate-100 text-slate-600",
};

export function NflResultBadge({ result }: { result: DirectionalResult | null }) {
  if (result == null) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        RESULT_CLASS[result],
      )}
    >
      {result}
    </span>
  );
}

const HEALTH_CLASS: Record<NflHealthStatus, string> = {
  HEALTHY: "border-emerald-300 bg-emerald-50 text-emerald-800",
  DEGRADED: "border-amber-300 bg-amber-50 text-amber-800",
  STALE: "border-rose-300 bg-rose-50 text-rose-800",
  NOT_AVAILABLE: "border-slate-300 bg-slate-100 text-slate-600",
  NOT_IMPLEMENTED: "border-slate-300 bg-slate-100 text-slate-500",
};

const HEALTH_LABEL: Record<NflHealthStatus, string> = {
  HEALTHY: "Healthy",
  DEGRADED: "Degraded",
  STALE: "Stale",
  NOT_AVAILABLE: "Not available",
  NOT_IMPLEMENTED: "Not implemented",
};

export function NflHealthStatusBadge({ status }: { status: NflHealthStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        HEALTH_CLASS[status],
      )}
    >
      {HEALTH_LABEL[status]}
    </span>
  );
}
