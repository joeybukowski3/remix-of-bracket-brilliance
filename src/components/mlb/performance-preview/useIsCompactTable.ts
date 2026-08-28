import { useEffect, useState } from "react";

const COMPACT_TABLE_BREAKPOINT = 1024;

/**
 * Below this width the desktop-style performance tables (min-width 900-980px)
 * horizontally scroll, so column order switches to surface the primary
 * score/odds/result fields before the user has to scroll to reach them.
 */
export function useIsCompactTable(): boolean {
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== "undefined" && window.innerWidth < COMPACT_TABLE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_TABLE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsCompact(window.innerWidth < COMPACT_TABLE_BREAKPOINT);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isCompact;
}
