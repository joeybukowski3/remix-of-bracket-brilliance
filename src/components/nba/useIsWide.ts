import { useEffect, useState } from "react";

/** The md breakpoint: below it the props table keeps only a few columns and the row detail carries the rest. */
const WIDE_QUERY = "(min-width: 768px)";

const canMatch = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** True at the md breakpoint and wider. Assumes wide where the browser cannot tell (server render, tests). */
export function useIsWide(): boolean {
  const [wide, setWide] = useState<boolean>(() => (canMatch() ? window.matchMedia(WIDE_QUERY).matches : true));
  useEffect(() => {
    if (!canMatch()) return;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}
