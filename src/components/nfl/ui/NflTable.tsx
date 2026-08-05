import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll container for NFL data tables.
 *
 * Data-dense tables stay tables on mobile — they are not converted into stacked
 * cards, which costs far more vertical space and makes rank comparison harder.
 * Instead the overflow is contained here so the *page* never scrolls
 * horizontally, only the table does.
 *
 * `aria-label` plus `tabIndex={0}` make the scroll region reachable and
 * announced for keyboard and screen-reader users, which a bare `overflow-x-auto`
 * div is not.
 */
export function NflTableScroller({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        // `relative` is load-bearing, not decoration. Tailwind's `sr-only` is
        // `position: absolute`, and without a positioned ancestor its
        // containing block is the initial one — so a visually hidden label
        // inside a 600px-wide table escaped this scroller entirely and pushed
        // the *page* to 583px at a 390px viewport. Containing it here fixes the
        // whole class of bug for every NFL table at once.
        "relative overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shared header-row styling so every NFL table reads as the same component. */
export const NFL_TABLE_HEAD_ROW =
  "bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600";

/** Shared body-row styling: hairline separators, restrained hover. */
export const NFL_TABLE_ROW =
  "border-t border-slate-100 transition-colors hover:bg-slate-50";
