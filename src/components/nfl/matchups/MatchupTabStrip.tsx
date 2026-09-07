import { useRef } from "react";
import { cn } from "@/lib/utils";

export type MatchupTabDef = {
  id: string;
  label: string;
  /** Stable DOM id for the trigger button, so a deep link can focus it. */
  triggerId?: string;
};

/**
 * One tinted pill treatment per tab position, cycled by index rather than by
 * any semantic meaning of the tab — this component has no idea what a tab
 * represents, only how many there are. Colours are deliberately soft (the
 * `-50`/`-100` steps) so a row of tabs reads as one calm system rather than a
 * loud rainbow; only the border and text steps up in strength for the active
 * state, never the saturation.
 *
 * Every caller (Statistical Comparison, Unit by Unit, What the Book Says)
 * imports this same array — there is exactly one tab visual system on the
 * page, not three.
 */
const TAB_PALETTE: readonly { inactive: string; active: string }[] = [
  {
    inactive: "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100/70",
    active: "border-blue-400 bg-blue-100 text-blue-900 shadow-sm",
  },
  {
    inactive:
      "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100/70",
    active: "border-emerald-400 bg-emerald-100 text-emerald-900 shadow-sm",
  },
  {
    inactive: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100/70",
    active: "border-amber-400 bg-amber-100 text-amber-900 shadow-sm",
  },
  {
    inactive:
      "border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300 hover:bg-violet-100/70",
    active: "border-violet-400 bg-violet-100 text-violet-900 shadow-sm",
  },
  {
    inactive: "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100/70",
    active: "border-rose-400 bg-rose-100 text-rose-900 shadow-sm",
  },
  {
    inactive: "border-cyan-200 bg-cyan-50 text-cyan-800 hover:border-cyan-300 hover:bg-cyan-100/70",
    active: "border-cyan-400 bg-cyan-100 text-cyan-900 shadow-sm",
  },
  {
    inactive:
      "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-slate-200/70",
    active: "border-slate-500 bg-slate-200 text-slate-900 shadow-sm",
  },
];

/**
 * Shared low-level tab strip for the sub-containers on the matchup analyzer
 * (Statistical Comparison, Unit by Unit, What the Book Says).
 *
 * Each tab renders as its own bordered, tinted pill rather than plain text
 * with an underline, so the row reads as tabs — not as adjacent navigation
 * links — at a glance. The strip scrolls horizontally instead of wrapping
 * when it does not fit, so it degrades the same way on narrow screens; each
 * pill keeps its border and fill at every width rather than collapsing to
 * bare text.
 *
 * Real tab semantics (`role="tablist"`/`"tab"`, `aria-selected`, a roving
 * tabindex, Left/Right/Home/End keyboard nav) implemented directly, matching
 * the pattern already proven for the page's top-level `MatchupTabRow`.
 */
export default function MatchupTabStrip({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  triggerRef,
  className = "",
}: {
  tabs: readonly MatchupTabDef[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  triggerRef?: (id: string, node: HTMLButtonElement | null) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeId);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const next = tabs[nextIndex];
    onSelect(next.id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)
      ?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex flex-nowrap gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === activeId;
        const palette = TAB_PALETTE[index % TAB_PALETTE.length];
        return (
          <button
            key={tab.id}
            ref={(node) => triggerRef?.(tab.id, node)}
            data-tab-id={tab.id}
            type="button"
            role="tab"
            id={tab.triggerId}
            aria-selected={selected}
            aria-controls={`${tab.id}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-2 text-center text-[12px] font-bold uppercase tracking-[0.06em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-emerald-500",
              selected ? palette.active : palette.inactive
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
