import { cn } from "@/lib/utils";
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";

const MARKETS: readonly NflProjectionMarket[] = ["passing", "rushing", "receiving"];
const MARKET_LABEL: Record<NflProjectionMarket, string> = { passing: "Passing", rushing: "Rushing", receiving: "Receiving" };

/** Restrained per-market accent -- identity color only, no positive/negative betting meaning. */
const MARKET_TONE: Record<NflProjectionMarket, { selected: string; unselected: string }> = {
  passing: {
    selected: "border-sky-700 bg-sky-700 text-white shadow-sm",
    unselected: "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-400 hover:bg-sky-100",
  },
  rushing: {
    selected: "border-teal-700 bg-teal-700 text-white shadow-sm",
    unselected: "border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-400 hover:bg-teal-100",
  },
  receiving: {
    selected: "border-violet-700 bg-violet-700 text-white shadow-sm",
    unselected: "border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-400 hover:bg-violet-100",
  },
};

/**
 * Mobile-only dedicated prop-type selector -- three equal-width color-coded
 * pills in their own row, separate from the Week control. Desktop keeps the
 * existing `NflFilterChips` Market group unchanged (this component renders
 * nothing at the `md` breakpoint and up).
 */
export default function NflYardageMobilePropTypeRow({
  value,
  onChange,
}: {
  value: NflProjectionMarket;
  onChange: (next: NflProjectionMarket) => void;
}) {
  return (
    <div role="group" aria-label="Prop type" className="grid grid-cols-3 gap-1.5 md:hidden">
      {MARKETS.map((m) => {
        const selected = m === value;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={selected}
            className={cn(
              "rounded-md border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
              selected ? MARKET_TONE[m].selected : MARKET_TONE[m].unselected,
            )}
          >
            {MARKET_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}
