/**
 * Touch-friendly segmented control used for section subgroups
 * (Overall / Passing / Rushing, Away Ball / Home Ball, Away / Home).
 *
 * Implemented as a real tablist so arrow-key navigation and `aria-selected`
 * come from the platform rather than being approximated with buttons.
 */
export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Shorter label used at the narrowest breakpoints. */
  shortLabel?: string;
};

export default function MatchupSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className = "",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const padding = size === "sm" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]";

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = options[(index + delta + options.length) % options.length];
    onChange(next.value);
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        // Only emit both label variants when they actually differ; rendering
        // two identical spans would double the button's accessible name.
        const hasDistinctShortLabel = !!option.shortLabel && option.shortLabel !== option.label;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            // Both label variants are in the DOM at once (CSS picks one per
            // breakpoint), so pin the accessible name to the full label rather
            // than letting it concatenate to "Overall Overall Offense".
            aria-label={hasDistinctShortLabel ? option.label : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`rounded-md font-bold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${padding} ${
              selected
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {hasDistinctShortLabel ? (
              <>
                <span className="sm:hidden">{option.shortLabel}</span>
                <span className="hidden sm:inline">{option.label}</span>
              </>
            ) : (
              <span>{option.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
