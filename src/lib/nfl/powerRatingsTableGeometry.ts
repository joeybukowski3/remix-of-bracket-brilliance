/**
 * Pure DOM measurement for the /nfl/power-ratings page-scroll sticky header clone.
 *
 * The fixed clone must line up exactly with the real `<table>` columns at every
 * viewport, so it renders from the actual `<thead>` geometry rather than any
 * static width guess. This module owns that single measurement step; the clone
 * component and its `useStickyHeaderClone` hook consume the result.
 */

/** One header cell's box: `left` is relative to the table's own content origin (scroll-invariant). */
export type CloneColumnGeometry = { left: number; width: number };

export type HeaderColumnGeometry = {
  columns: CloneColumnGeometry[];
  height: number;
};

/**
 * Read every real header cell's width + left offset (relative to the table's
 * content box) plus the total header height. Left offsets are table-relative, so
 * they stay valid while the scroller scrolls horizontally — only repositioning
 * reacts to `scrollLeft`, never re-measurement. Returns `null` for an empty header.
 */
export function readHeaderColumnGeometry(
  thead: HTMLTableSectionElement,
  table: HTMLElement
): HeaderColumnGeometry | null {
  const ths = Array.from(thead.querySelectorAll("th"));
  if (ths.length === 0) return null;
  const tableLeft = table.getBoundingClientRect().left;
  const columns = ths.map((th) => {
    const rect = th.getBoundingClientRect();
    return { left: rect.left - tableLeft, width: rect.width };
  });
  return { columns, height: thead.getBoundingClientRect().height };
}
