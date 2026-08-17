import { Gem } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * MLB Hub's dedicated +EV discovery block -- same restrained premium/amber
 * accent language as the sidebar's PLUS EV section (see
 * MlbSectionSidebar.tsx). Deep-links straight into each page's +EV view via
 * ?view=ev (see MlbStrikeoutProps.tsx / MlbHrProps.tsx), so this never
 * duplicates a page -- it's just a more discoverable entry point into
 * views that already exist.
 */
export default function MlbPlusEvHubBlock() {
  return (
    <section
      aria-labelledby="mlb-plus-ev-hub-title"
      className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-white shadow-sm"
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Gem className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="mlb-plus-ev-hub-title" className="text-base font-black text-slate-900">+EV Props</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700">Value finder</span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">Compare JKB fair prices with sportsbook odds to find potential betting value.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to="/mlb/hr-props?view=ev"
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 shadow-sm transition",
              "hover:border-amber-400 hover:bg-amber-50",
            )}
          >
            HR +EV
          </Link>
          <Link
            to="/mlb/strikeout-props?view=ev"
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 shadow-sm transition",
              "hover:border-amber-400 hover:bg-amber-50",
            )}
          >
            Pitcher K +EV
          </Link>
        </div>
      </div>
    </section>
  );
}
