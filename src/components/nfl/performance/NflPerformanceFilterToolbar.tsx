import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact filter toolbar. Desktop (md+): always-visible labelled groups.
 * Mobile: collapsed behind a "Filters" disclosure that shows the active-filter
 * count. `Clear filters` appears only while something other than the default
 * is active. The Week control is intentionally NOT part of this toolbar (see
 * NflPerformanceWeekSelector) so there is only one week control.
 */
export default function NflPerformanceFilterToolbar({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const clear = (
    <button
      type="button"
      onClick={onClear}
      className="rounded border border-slate-400 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
    >
      Clear filters
    </button>
  );
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-2" data-testid="nfl-filter-toolbar">
      <div className={cn("flex items-center justify-between gap-2 md:justify-end", activeCount === 0 && "md:hidden")}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded border border-slate-400 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 md:hidden"
        >
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-slate-900 px-1.5 text-[10px] leading-4 text-white" data-testid="nfl-filter-active-count">
              {activeCount}
            </span>
          )}
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        {activeCount > 0 && clear}
      </div>
      <div id={panelId} className={cn("mt-2 flex-wrap items-end gap-x-4 gap-y-2 md:mt-0 md:flex", open ? "flex" : "hidden")}>
        {children}
      </div>
    </div>
  );
}

export function NflFilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Labelled native select; a non-default value gets a navy border + tint so active filters stand out. */
export function NflFilterSelect<T extends string | number>({
  label,
  options,
  value,
  onChange,
  formatOption,
  defaultValue = "all" as T,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  formatOption?: (option: T) => string;
  defaultValue?: T;
}) {
  const id = useId();
  const active = value !== defaultValue;
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className={cn("text-[11px] font-semibold", active ? "text-slate-900" : "text-slate-600")}>
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        data-active={active}
        onChange={(e) => {
          const next = options.find((option) => String(option) === e.target.value);
          if (next !== undefined) onChange(next);
        }}
        className={cn(
          "h-8 rounded border bg-white px-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500",
          active ? "border-slate-900 bg-slate-100 font-bold text-slate-900 ring-1 ring-slate-900" : "border-slate-300 text-slate-700",
        )}
      >
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {formatOption ? formatOption(option) : String(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
