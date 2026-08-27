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
/**
 * `tone` is opt-in and defaults to "neutral" (the original slate styling)
 * so every existing consumer of this shared control renders unchanged.
 * The named color tones give each filter *group* (not each option) a
 * distinct, consistent accent so a row of several filter groups is easy to
 * tell apart at a glance -- currently used by the Yardage Props Review
 * filters (Matchups=sky, Bands=amber, Lines=teal, Position=violet). These
 * are category identity colors only and carry no positive/negative betting
 * meaning; "accent" is kept as a deprecated alias for "sky" for any other
 * existing single-hue consumers.
 */
const TONE_CLASS: Record<Exclude<NflFilterChipTone, "neutral">, { selected: string; unselected: string }> = {
  accent: {
    selected: "border-sky-700 bg-sky-700 text-white shadow-sm",
    unselected: "border-sky-200 bg-sky-50/60 text-sky-800 hover:border-sky-400 hover:bg-sky-100",
  },
  sky: {
    selected: "border-sky-700 bg-sky-700 text-white shadow-sm",
    unselected: "border-sky-200 bg-sky-50/60 text-sky-800 hover:border-sky-400 hover:bg-sky-100",
  },
  amber: {
    selected: "border-amber-600 bg-amber-600 text-white shadow-sm",
    unselected: "border-amber-200 bg-amber-50/60 text-amber-800 hover:border-amber-400 hover:bg-amber-100",
  },
  teal: {
    selected: "border-teal-700 bg-teal-700 text-white shadow-sm",
    unselected: "border-teal-200 bg-teal-50/60 text-teal-800 hover:border-teal-400 hover:bg-teal-100",
  },
  violet: {
    selected: "border-violet-700 bg-violet-700 text-white shadow-sm",
    unselected: "border-violet-200 bg-violet-50/60 text-violet-800 hover:border-violet-400 hover:bg-violet-100",
  },
};

export type NflFilterChipTone = "neutral" | "accent" | "sky" | "amber" | "teal" | "violet";

export function NflFilterChips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  formatOption,
  size = "md",
  className = "",
  tone = "neutral",
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  formatOption?: (option: T) => string;
  size?: "sm" | "md";
  className?: string;
  tone?: NflFilterChipTone;
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
              tone === "neutral"
                ? selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                : selected
                  ? TONE_CLASS[tone].selected
                  : TONE_CLASS[tone].unselected,
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
