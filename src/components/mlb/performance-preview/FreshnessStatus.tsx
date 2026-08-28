import { cn } from "@/lib/utils";
import { computeFreshnessStatus, type FreshnessLevel } from "@/lib/mlb/performancePreviewTrackers/freshnessStatus";

const LEVEL_CLASSES: Record<FreshnessLevel, string> = {
  fresh: "text-emerald-600",
  stale: "text-amber-600",
  error: "text-rose-600",
};

export default function FreshnessStatus({ generatedAt, gradedThrough, hasError, errorMessage, pendingCount }: {
  generatedAt: string | null;
  gradedThrough: string | null;
  hasError: boolean;
  errorMessage?: string | null;
  pendingCount?: number;
}) {
  const status = computeFreshnessStatus({ generatedAt, gradedThrough, hasError, errorMessage, pendingCount });

  return (
    <p className={cn("text-[11px] font-semibold", LEVEL_CLASSES[status.level])}>
      {status.level === "stale" && <span className="mr-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">Stale</span>}
      {status.detail}
    </p>
  );
}
