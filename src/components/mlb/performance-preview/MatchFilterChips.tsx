import { cn } from "@/lib/utils";
import { humanizeFieldLabel } from "./numerologyMatchFilters";

interface MatchFilterChipsProps {
  options: string[];
  selected: string[];
  onToggle: (field: string) => void;
  onClear: () => void;
  matchingCount: number;
}

/** Multi-select match/combo filter for Numerology: toggling more than one chip narrows to records containing ALL selected matches (intersection), not just any. */
export default function MatchFilterChips({ options, selected, onToggle, onClear, matchingCount }: MatchFilterChipsProps) {
  if (options.length === 0) return null;

  return (
    <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-700">Filter by Match Type (select multiple for combos)</div>
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className="text-[10px] font-bold text-fuchsia-600 underline-offset-2 hover:underline">
            Clear
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((field) => {
          const isSelected = selected.includes(field);
          return (
            <button
              key={field}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(field)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-bold transition",
                isSelected ? "border-fuchsia-500 bg-fuchsia-500 text-white shadow-sm" : "border-fuchsia-200 bg-white text-fuchsia-700 hover:bg-fuchsia-50",
              )}
            >
              {humanizeFieldLabel(field)}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-fuchsia-800">
          <span className="font-bold">Active combo:</span>
          {selected.map((field) => (
            <span key={field} className="rounded-full bg-white px-2 py-0.5 font-semibold ring-1 ring-fuchsia-200">{humanizeFieldLabel(field)}</span>
          ))}
          <span className="text-fuchsia-500">-- {matchingCount} matching record{matchingCount === 1 ? "" : "s"}</span>
        </div>
      )}
    </div>
  );
}
