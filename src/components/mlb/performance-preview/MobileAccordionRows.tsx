import { useState } from "react";
import { ChevronDown } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { cn } from "@/lib/utils";
import type { PerformanceRow } from "./PerformanceRow";
import ResultBadge from "./ResultBadge";

/**
 * Mobile-first accordion row list: one compact row per player (date, logo,
 * name, optional compact metric, result badge), tap to expand the rest of
 * the stat line inline below the row. No table, no horizontal scroll.
 *
 * Only the currently-expanded row's detail grid is mounted, so this stays
 * cheap even for a 20-row page (nothing is expanded by default).
 */
export default function MobileAccordionRows({ rows }: { rows: PerformanceRow[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-400">No graded plays match this filter.</div>;
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {rows.map((row) => {
        const isExpanded = expandedKey === row.key;
        return (
          <li key={row.key}>
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setExpandedKey(isExpanded ? null : row.key)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-slate-50"
            >
              <span className="w-12 shrink-0 text-[10px] font-semibold text-slate-400">{row.date.slice(5)}</span>
              <MlbTeamLogo team={row.team} size={20} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{row.player}</span>
              {row.compactValue && (
                <span className="shrink-0 text-xs font-black tabular-nums text-slate-600">{row.compactValue}</span>
              )}
              <span className="shrink-0"><ResultBadge kind={row.resultKind} /></span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
            </button>
            {isExpanded && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 px-3 py-3 sm:grid-cols-3">
                {row.details.map((detail) => (
                  <div key={detail.label} className="rounded-lg bg-white px-2.5 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{detail.label}</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-800">{detail.value}</div>
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
