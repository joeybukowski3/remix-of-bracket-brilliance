import { useEffect, useRef, useState } from "react";
import { readHeaderColumnGeometry, type CloneColumnGeometry } from "@/lib/nfl/powerRatingsTableGeometry";

/**
 * Page-scroll sticky header for the Anytime TD scorer table.
 *
 * `DenseTableScroller` keeps `overflow-x: auto` for mobile-local horizontal
 * scroll. Per the CSS overflow spec that forces its `overflow-y` to `auto` too,
 * so that div — not the viewport — becomes the containing block for any
 * `position: sticky` descendant. A plain sticky `<thead>` therefore cannot track
 * page scroll relative to the fixed 72px `SiteHeader`; giving it `top: 72px`
 * only shoves it 72px down *inside* the never-vertically-scrolling scroller,
 * pushing the first body rows above it (the PR #327 bug).
 *
 * Same resolution as `/nfl/power-ratings` (`useStickyHeaderClone`): leave the
 * real `<thead>` in normal flow and, on scroll/resize, measure whether it has
 * scrolled above `STICKY_TOP` while the table body is still on screen. When so,
 * report geometry for a `position: fixed` clone rendered outside the scroller
 * that sits exactly where a viewport-sticky header would.
 */

/**
 * `SiteHeader` real rendered height: `min-h-[72px]` + its 1px `border-b`
 * (src/components/layout/SiteHeader.tsx, `sticky top-0 z-[100]`). The clone's
 * `top`, so the pinned header sits directly under global chrome, never beneath it.
 */
export const STICKY_TOP = 73;

export type TouchdownHeaderGeometry = {
  active: boolean;
  left: number;
  width: number;
  height: number;
  tableWidth: number;
  scrollLeft: number;
  columns: CloneColumnGeometry[];
};

export const INACTIVE_TOUCHDOWN_HEADER_GEOMETRY: TouchdownHeaderGeometry = {
  active: false,
  left: 0,
  width: 0,
  height: 0,
  tableWidth: 0,
  scrollLeft: 0,
  columns: [],
};

export function useTouchdownStickyHeader() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [geometry, setGeometry] = useState<TouchdownHeaderGeometry>(INACTIVE_TOUCHDOWN_HEADER_GEOMETRY);

  useEffect(() => {
    const wrap = wrapRef.current;
    const scroller = scrollRef.current;
    const thead = theadRef.current;
    const table = thead?.closest("table") as HTMLElement | null;
    if (!wrap || !scroller || !thead || !table) return;

    let frame = 0;
    let columns: CloneColumnGeometry[] = [];
    let headerHeight = 0;

    // Column widths only change on resize / responsive breakpoints — measured
    // here, cached, and reused by every reposition until the next resize.
    const measureColumns = () => {
      const geo = readHeaderColumnGeometry(thead, table);
      if (!geo) return;
      columns = geo.columns;
      headerHeight = geo.height;
    };

    // Per scroll frame: decide active/inactive and, when active, refresh only the
    // fixed offset + horizontal translation. Never re-measures column widths.
    const reposition = () => {
      frame = 0;
      const wrapRect = wrap.getBoundingClientRect();
      const theadRect = thead.getBoundingClientRect();
      const active = theadRect.bottom <= STICKY_TOP && wrapRect.bottom > STICKY_TOP;
      if (!active) {
        setGeometry((prev) => (prev.active ? INACTIVE_TOUCHDOWN_HEADER_GEOMETRY : prev));
        return;
      }
      const scrollRect = scroller.getBoundingClientRect();
      setGeometry({
        active: true,
        left: scrollRect.left,
        width: scrollRect.width,
        height: headerHeight || theadRect.height,
        tableWidth: table.getBoundingClientRect().width || scroller.scrollWidth,
        scrollLeft: scroller.scrollLeft,
        columns,
      });
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(reposition);
    };
    const remeasure = () => {
      measureColumns();
      schedule();
    };

    measureColumns();
    reposition();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", remeasure);
    scroller.addEventListener("scroll", schedule, { passive: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(remeasure);
      observer.observe(table);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
      scroller.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, []);

  return { wrapRef, scrollRef, theadRef, geometry };
}
