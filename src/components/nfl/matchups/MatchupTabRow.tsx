import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MATCHUP_STICKY_NAV_TOP } from "@/lib/nfl/matchupSections";
import {
  MATCHUP_TABS,
  matchupPanelId,
  matchupTabId,
  prefersReducedMotion,
  type MatchupTabId,
} from "@/components/nfl/matchups/matchupNavigation";

/**
 * The analyzer's primary navigation: a real tablist, not anchors over a stacked
 * page.
 *
 * Sticky offset comes from `MATCHUP_STICKY_NAV_TOP`, the repository's single
 * source of truth for this contract, so the row sits directly beneath the
 * global site header instead of underneath it. It paints below the header
 * (z-30 against the header's z-100), which is what stops a scrolled mobile view
 * from hiding the row entirely.
 *
 * Mobile discoverability, without adding a second navigation surface:
 *
 *  - selecting a tab by click, keyboard or hash restore scrolls it *fully* into
 *    view, so "Model Details" is never functionally stranded past the right edge
 *  - a narrow edge fade appears only on a side that actually has more tabs, and
 *    is recomputed on scroll, resize and selection
 *  - `scroll-padding-inline` keeps a sliver of the neighbouring tab visible, so
 *    the row reads as scrollable rather than as a clipped list
 *
 * No arrow buttons, no dropdown, no second bar. Motion is skipped entirely when
 * the visitor prefers reduced motion.
 */
export default function MatchupTabRow({
  activeTab,
  onSelect,
  /** Changes on every navigation, so a repeat selection still re-reveals. */
  token,
}: {
  activeTab: MatchupTabId;
  onSelect: (tab: MatchupTabId) => void;
  token: number;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<MatchupTabId, HTMLButtonElement>());
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const updateCues = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    setOverflow({
      start: max > 2 && scroller.scrollLeft > 2,
      end: max > 2 && scroller.scrollLeft < max - 2,
    });
  }, []);

  // Layout effect so the first paint already carries the correct cue state
  // rather than flashing a fade in on the next frame.
  useLayoutEffect(() => {
    updateCues();
  }, [updateCues]);

  useEffect(() => {
    window.addEventListener("resize", updateCues);
    return () => window.removeEventListener("resize", updateCues);
  }, [updateCues]);

  useEffect(() => {
    const tab = tabRefs.current.get(activeTab);
    if (!tab?.scrollIntoView) return;
    tab.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    // The scroll is asynchronous when smooth, so the cues are re-read once it
    // has had time to settle as well as immediately.
    updateCues();
    const timer = window.setTimeout(updateCues, 240);
    return () => window.clearTimeout(timer);
  }, [activeTab, token, updateCues]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = MATCHUP_TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % MATCHUP_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + MATCHUP_TABS.length) % MATCHUP_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = MATCHUP_TABS.length - 1;
    if (nextIndex == null) return;
    event.preventDefault();
    const next = MATCHUP_TABS[nextIndex];
    onSelect(next.id);
    tabRefs.current.get(next.id)?.focus();
  }

  return (
    <div
      className={`sticky ${MATCHUP_STICKY_NAV_TOP} z-30 -mx-4 border-b border-slate-200 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 sm:-mx-6 lg:mx-0 lg:rounded-lg lg:border lg:bg-white`}
    >
      <div className="relative">
        {overflow.start && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-slate-100 to-transparent lg:from-white"
          />
        )}
        {overflow.end && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-slate-100 to-transparent lg:from-white"
          />
        )}

        <div
          ref={scrollerRef}
          onScroll={updateCues}
          role="tablist"
          aria-label="Matchup sections"
          onKeyDown={handleKeyDown}
          style={{ scrollPaddingInline: "28px" }}
          className="flex gap-0.5 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 lg:px-2 [&::-webkit-scrollbar]:hidden"
        >
          {MATCHUP_TABS.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(tab.id, node);
                  else tabRefs.current.delete(tab.id);
                }}
                type="button"
                role="tab"
                id={matchupTabId(tab.id)}
                aria-controls={matchupPanelId(tab.id)}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                className={`min-h-[46px] shrink-0 whitespace-nowrap border-b-2 px-3.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:px-4 ${
                  selected
                    ? "border-emerald-700 text-emerald-800"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
