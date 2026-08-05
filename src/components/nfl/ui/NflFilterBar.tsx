import { cn } from "@/lib/utils";

/**
 * The shared filter-chip control for NFL pages.
 *
 * Season pickers, week pickers and signal filters were three separately styled
 * button rows (rounded-full slate-950, rounded blue-600, rounded-full
 * slate-900). They are one control now: a square-ish chip whose selected state
 * is a filled slate surface, with `aria-pressed` so the state is announced
 * rather than only shown.
 */
export function NflFilterChips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  formatOption,
  size = "md",
  className = "",
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  formatOption?: (option: T) => string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={selected}
            className={cn(
              "rounded border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
              size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
              selected
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
            )}
          >
            {formatOption ? formatOption(option) : String(option)}
          </button>
        );
      })}
    </div>
  );
}

export function NflSeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: readonly number[];
  value: number;
  onChange: (next: number) => void;
}) {
  return <NflFilterChips label="Select season" options={seasons} value={value} onChange={onChange} />;
}
