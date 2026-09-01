import type { ReactNode } from "react";
import { TABLE_LAYER } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";

export interface PerformanceTableColumn<T> {
  key: string;
  header: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  render: (record: T) => ReactNode;
}

/** Reorders a column set for the compact (mobile/tablet, horizontal-scroll) layout. `compactOrder` must list every column key exactly once. */
export function reorderColumns<T>(columns: PerformanceTableColumn<T>[], compactOrder: string[]): PerformanceTableColumn<T>[] {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  return compactOrder.map((key) => {
    const column = byKey.get(key);
    if (!column) throw new Error(`Unknown performance table column key: ${key}`);
    return column;
  });
}

// Frozen-left-edge treatment for the Player column: opaque background so
// scrolled-under columns don't show through, plus a shadow to mark the
// frozen edge. group-hover keeps the tint in sync with the row's own hover
// color since the sticky cell's opaque bg would otherwise block it.
//
// The z-index values come from the shared `TABLE_LAYER` ladder in
// `src/components/ui/dense-table.tsx` (see docs/TABLE_CONVENTIONS.md §C) so this
// bespoke dark-shell frozen column stays on the same layer scale as the shared
// `frozenDenseColumn()` helper. This family's `<thead>` is not sticky, so the
// header cell sits on the sticky-header layer rather than the higher
// intersection layer; the class output is unchanged from the previous
// hand-rolled `z-20` / `z-10`.
export const STICKY_PLAYER_TH_CLASS = cn(
  "sticky left-0",
  TABLE_LAYER.stickyHeader,
  "bg-slate-900 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.45)]",
);

export function stickyPlayerTdClass(hoverBgClassName: string): string {
  return cn(
    "sticky left-0",
    TABLE_LAYER.frozenColumn,
    "bg-white shadow-[2px_0_6px_-2px_rgba(15,23,42,0.25)]",
    hoverBgClassName,
  );
}
