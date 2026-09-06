/**
 * Intentional zero-grade state for the 2026 preseason window (spec section
 * 5). Used whenever a family has n=0 graded rows -- never rendered as a
 * blank chart or a misleading "0.0%".
 */
export default function NflPerformanceEmptyState({
  title = "Forward tracking is active.",
  description = "Results will populate as 2026 games are completed.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-[13px] text-slate-500">{description}</p>
    </div>
  );
}
