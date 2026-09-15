import { useEffect, useState, type RefObject } from "react";

/**
 * True only when the referenced element's content is actually wider than its
 * box — the swipe affordance for Rank Towers and Signature Profile must never
 * show when everything already fits. Re-evaluated on resize (ResizeObserver)
 * and whenever `deps` changes (e.g. the selected metric count), since adding
 * or removing metrics can flip overflow either way without the element
 * itself resizing.
 *
 * Every category's chart stays mounted while its tabpanel is `hidden`
 * (matching the existing detailed-table pattern), so a chart frequently
 * mounts at zero size. A `ResizeObserver` created against that zero-size box
 * does not reliably re-fire the instant the ancestor's `hidden` attribute is
 * removed, which would otherwise leave the swipe hint permanently stuck off
 * for any category that was not the default tab. A small `MutationObserver`
 * on the nearest tabpanel's `hidden` attribute re-measures the moment it
 * becomes visible, independent of the resize path.
 */
export function useSwipeOverflow(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[] = []
): boolean {
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      setHasOverflow(false);
      return;
    }

    const measure = () => setHasOverflow(node.scrollWidth > node.clientWidth + 1);
    measure();

    const cleanups: Array<() => void> = [];

    // jsdom (unit tests) has no ResizeObserver — fall back to a resize
    // listener plus the initial measurement above rather than throwing.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      cleanups.push(() => window.removeEventListener("resize", measure));
    } else {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      cleanups.push(() => observer.disconnect());
    }

    const tabpanel = node.closest<HTMLElement>('[role="tabpanel"]');
    if (tabpanel && typeof MutationObserver !== "undefined") {
      const mutationObserver = new MutationObserver(measure);
      mutationObserver.observe(tabpanel, { attributes: true, attributeFilter: ["hidden"] });
      cleanups.push(() => mutationObserver.disconnect());
    }

    return () => cleanups.forEach((cleanup) => cleanup());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return hasOverflow;
}
