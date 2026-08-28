import type { ReactNode } from "react";
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
export const STICKY_PLAYER_TH_CLASS = "sticky left-0 z-20 bg-slate-900 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.45)]";

export function stickyPlayerTdClass(hoverBgClassName: string): string {
  return cn("sticky left-0 z-10 bg-white shadow-[2px_0_6px_-2px_rgba(15,23,42,0.25)]", hoverBgClassName);
}
