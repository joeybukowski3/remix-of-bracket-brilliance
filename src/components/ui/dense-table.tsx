import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Site-wide dense-table primitives.
 *
 * Promoted from the NFL dense-table pattern
 * (`src/components/nfl/ui/NflTable.tsx`, plan Phase 5) so CFB, PGA, MLB and
 * Fantasy tables stop hand-rolling their own scroller, head/row styling, and
 * sticky/frozen z-index values. See `docs/TABLE_CONVENTIONS.md`.
 *
 * This is composition, not a data grid: consumers still write their own
 * `<table>` / `<thead>` / `<tbody>`. These helpers provide the accessible
 * scroll region, the shared density classes, and the sticky/frozen layer
 * ladder — nothing else.
 */

/**
 * z-index ladder for in-table sticky/frozen layers, expressed as Tailwind
 * classes so it stays in one place.
 *
 * Deliberately kept BELOW page chrome:
 *   SiteHeader              `z-[100]`  global, always on top
 *   mobile context strips   `z-40`     below the header (e.g. `top-[72px]`)
 *   --- in-table layers, all below the above ---
 *   frozen header cell      `z-30`     header x frozen-column intersection
 *   sticky header row       `z-20`
 *   frozen first column     `z-10`
 */
export const TABLE_LAYER = {
  stickyHeader: "z-20",
  frozenColumn: "z-10",
  frozenHeaderCell: "z-30",
} as const;

/**
 * Scroll container for dense data tables.
 *
 * Data-dense tables stay tables on mobile — they are not converted into
 * stacked cards, which costs far more vertical space and makes column-to-column
 * comparison harder. Instead the overflow is contained here so the *page* never
 * scrolls horizontally, only the table does.
 *
 * `relative` is load-bearing, not decoration: Tailwind's `sr-only` is
 * `position: absolute`, and without a positioned ancestor a visually hidden
 * label inside a wide table escapes the scroller and widens the whole page.
 *
 * `role="region"` + `aria-label` + `tabIndex={0}` make the scroll region
 * reachable and announced for keyboard and screen-reader users, which a bare
 * `overflow-x-auto` div is not.
 */
export function DenseTableScroller({
  label,
  className = "",
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<"div">, "aria-label"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      {...props}
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "relative overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shared header-row styling so every dense table reads as the same component. */
export const DENSE_TABLE_HEAD_ROW =
  "bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600";

/** Shared body-row styling: hairline separators, restrained hover. */
export const DENSE_TABLE_ROW =
  "border-t border-slate-100 transition-colors hover:bg-slate-50";

/**
 * Sticky header row *within the table's own scroll container* (not the
 * viewport). Apply to the `<thead>` (or its `<tr>`), and give it an opaque
 * background so body rows do not bleed through. The `<table>` must use
 * `border-separate border-spacing-0` for header-cell borders to stay put while
 * scrolling.
 */
export function stickyDenseHeader(className?: string): string {
  return cn("sticky top-0", TABLE_LAYER.stickyHeader, className);
}

/**
 * Frozen first (identity) column. Apply to the leading `<th>`/`<td>` of every
 * row. Pass a `surface` that matches the row's own background so content does
 * not show through during horizontal scroll; set `isHeader` on the cells that
 * live in the sticky header so the intersection paints above both layers.
 * Add a right-edge hairline (`border-r …`) via `className` to signal the freeze.
 */
export function frozenDenseColumn({
  isHeader = false,
  surface,
  className,
}: {
  isHeader?: boolean;
  surface?: string;
  className?: string;
} = {}): string {
  return cn(
    "sticky left-0",
    isHeader ? TABLE_LAYER.frozenHeaderCell : TABLE_LAYER.frozenColumn,
    surface,
    className,
  );
}
