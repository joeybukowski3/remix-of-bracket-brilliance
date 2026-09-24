import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Visible (client) width of the element in `ref`, kept current with ResizeObserver.
 * Re-attaches when the ref points at a different element after a re-render (e.g. the
 * table moving into a portal). Returns 0 until measured and in environments without
 * layout, so callers should treat 0 as "no constraint".
 */
export function useElementWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  const observed = useRef<{ element: HTMLElement; observer: ResizeObserver | null } | null>(null);
  // No deps on purpose: cheap identity check on every commit; setWidth only fires when the element changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = ref.current;
    if (observed.current?.element === element) return;
    observed.current?.observer?.disconnect();
    observed.current = null;
    if (!element) { setWidth(0); return; }
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    observed.current = { element, observer };
  });
  useEffect(() => () => observed.current?.observer?.disconnect(), []);
  return width;
}
