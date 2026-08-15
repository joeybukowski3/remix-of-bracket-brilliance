import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { MATCHUP_SECTION_SCROLL_MT } from "@/lib/nfl/matchupSections";
import { cn } from "@/lib/utils";

/**
 * A collapsible group inside a section.
 *
 * The shared `NflSection` primitive stays the analyzer's section shell. This is
 * deliberately a narrower thing: a full-row disclosure whose trigger carries a
 * caller-supplied, stable DOM id.
 *
 * Both properties are load-bearing for the category jump. Arriving at
 * `#comparison-defense` has to move focus onto the control that expanded, and
 * that control has to be addressable from outside the component — `NflSection`
 * generates its ids internally and exposes its toggle only as a small
 * "Hide/Show" chip in the header, so neither is reachable there. The a11y
 * wiring is otherwise the same: a real `<button>` with `aria-expanded` and
 * `aria-controls` over a labelled panel.
 *
 * `scroll-margin-top` comes from `MATCHUP_SECTION_SCROLL_MT`, the repository's
 * sticky-offset contract, so a jumped-to heading clears the site header and the
 * tab row without any component measuring or hardcoding a pixel value.
 */
export default function MatchupCollapsibleGroup({
  id,
  triggerId,
  title,
  meta,
  open,
  onToggle,
  highlighted = false,
  triggerRef,
  children,
}: {
  /** Stable anchor id — also the jump destination. */
  id: string;
  /** Stable id for the trigger, so a jump can move focus to it. */
  triggerId: string;
  title: string;
  /**
   * Short secondary content beside the title, e.g. a metric count or a category
   * advantage chip. Accepts a node so a caller can supply a crest without this
   * component learning what a matchup is; anything interactive belongs
   * elsewhere, since this sits inside the trigger button.
   */
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Brief arrival highlight. Respects reduced motion via the transition only. */
  highlighted?: boolean;
  triggerRef?: (node: HTMLButtonElement | null) => void;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;

  return (
    <div
      id={id}
      className={cn(
        MATCHUP_SECTION_SCROLL_MT,
        "border-b border-slate-200 last:border-0 motion-safe:transition-colors motion-safe:duration-700",
        highlighted && "bg-sky-50"
      )}
    >
      <h3>
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-[46px] w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:px-4"
        >
          <span className="text-[13px] font-semibold text-slate-900">{title}</span>
          {meta && (
            <span className="flex min-w-0 items-center text-[11px] font-medium text-slate-600">
              {meta}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </h3>

      <div id={panelId} hidden={!open} className="px-2.5 pb-2 sm:px-3">
        {children}
      </div>
    </div>
  );
}
