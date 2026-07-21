import { useEffect, useState } from "react";

const DEFAULT_QUERY = "(max-width: 1023px)";

function resolveMatch(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/**
 * matchMedia-backed breakpoint hook. The initial state is resolved
 * synchronously (lazy useState initializer), so the first render already
 * reflects the real viewport instead of always starting at the desktop
 * default and flipping after a `useEffect` fires. Falls back to `false`
 * (desktop) when `matchMedia` isn't available (older browsers, jsdom test
 * environments without a mock), which matches the layout every existing
 * test already assumes.
 */
export function useIsCompactLayout(query: string = DEFAULT_QUERY): boolean {
  const [isCompact, setIsCompact] = useState(() => resolveMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setIsCompact(event.matches);

    setIsCompact(mql.matches);

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }
    // Safari < 14 fallback.
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, [query]);

  return isCompact;
}

export default useIsCompactLayout;
