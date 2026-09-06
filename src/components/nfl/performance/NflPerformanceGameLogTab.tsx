/**
 * WU5 ships only a placeholder shell for the unified Game Log. A combined,
 * expandable per-game view that merges sides, totals and starter props into
 * one row is deferred to the next performance work unit -- this tab exists
 * now so the navigation is complete and the intent is visible.
 */
export default function NflPerformanceGameLogTab() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center shadow-sm">
      <p className="text-sm font-semibold text-slate-700">Unified game log coming in the next performance work unit.</p>
      <p className="mt-1 text-[13px] text-slate-500">
        It will merge graded sides, totals and starter props into one per-game view. For now, use the Totals and Props tabs
        for graded detail.
      </p>
    </div>
  );
}
