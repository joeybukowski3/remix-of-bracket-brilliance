import { cn } from "@/lib/utils";
import type { WeekSelection } from "@/lib/nfl/performance/records";

/**
 * The single Week control for a performance tab: `Season | W1 | W2 | …`.
 * Selecting a week drives both the weekly record and the game log; `Season`
 * restores the season-wide view. Scrolls horizontally instead of wrapping so
 * it stays one row at 320px.
 */
export default function NflPerformanceWeekSelector({
  weeks,
  value,
  onChange,
}: {
  weeks: readonly number[];
  value: WeekSelection;
  onChange: (next: WeekSelection) => void;
}) {
  const options: readonly WeekSelection[] = ["all", ...weeks];
  return (
    <div role="group" aria-label="Week" className="flex gap-1 overflow-x-auto pb-0.5" data-testid="nfl-week-selector">
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              "shrink-0 rounded border px-2.5 py-1 text-xs font-bold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1",
              selected
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-100",
            )}
          >
            {option === "all" ? "Season" : `W${option}`}
          </button>
        );
      })}
    </div>
  );
}
