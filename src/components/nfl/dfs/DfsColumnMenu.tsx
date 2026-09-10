import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DfsColumnDef } from "@/lib/nfl/dfs/columnRegistry";

export type DfsColumnMenuProps = {
  /** Optional (hideable) columns for the active board view, in canonical order. */
  optionalColumns: readonly DfsColumnDef[];
  isVisible: (id: DfsColumnDef["id"]) => boolean;
  onToggle: (column: DfsColumnDef) => void;
  onReset: () => void;
  isCustomized: boolean;
};

/**
 * Compact "Columns" disclosure: a toggle button + a checkbox panel listing the
 * optional columns for the current view, plus Reset. Native button/checkbox
 * semantics, closes on Escape or outside click, first item focused on open.
 */
export default function DfsColumnMenu({ optionalColumns, isVisible, onToggle, onReset, isCustomized }: DfsColumnMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hiddenCount = optionalColumns.filter((column) => !isVisible(column.id)).length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
        Columns
        {hiddenCount > 0 && <span className="rounded bg-slate-200 px-1 text-[10px] tabular-nums">{hiddenCount} hidden</span>}
        <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Toggle table columns"
          className="absolute right-0 z-30 mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Optional columns</p>
          <ul>
            {optionalColumns.map((column) => {
              const checked = isVisible(column.id);
              return (
                <li key={column.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(column)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="min-w-0 flex-1 truncate">{column.label}</span>
                    {checked && <Check aria-hidden className="h-3.5 w-3.5 text-sky-600" />}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              onClick={onReset}
              disabled={!isCustomized}
              className="w-full rounded px-2 py-1.5 text-left text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
