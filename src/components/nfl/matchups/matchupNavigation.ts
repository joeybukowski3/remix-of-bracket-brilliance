/**
 * Tab and category navigation state for the matchup analyzer.
 *
 * The four tabs are real content panels, and the URL fragment is their address:
 *
 *   #overview  #comparison  #availability  #model  #comparison-{categoryId}
 *
 * Every fragment is team-neutral. A category fragment names the category only —
 * never a team, abbreviation, slug or game — so the same link works on every
 * matchup page.
 *
 * Tradeoff, deliberately taken: selection uses plain `history.pushState` and a
 * `popstate` listener rather than the router. The route itself never changes —
 * only the fragment does, and this page is the sole owner of its fragment — so
 * pushing through the router would add a re-render of the whole route for a
 * purely in-page state change, and `useNavigate` with `replace: false` would
 * still need the same popstate handling to restore state on Back. Scoping the
 * history calls to this module keeps that decision in one reviewable place.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isMatchupCategoryId,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";

export type MatchupTabId = "overview" | "comparison" | "availability" | "model";

export type MatchupTab = {
  id: MatchupTabId;
  label: string;
};

/** Tab order. Overview is the default and always leads. */
export const MATCHUP_TABS: readonly MatchupTab[] = [
  { id: "overview", label: "Overview" },
  { id: "comparison", label: "Team Comparison" },
  { id: "availability", label: "Availability & Snaps" },
  { id: "model", label: "Model Details" },
] as const;

export const MATCHUP_TAB_IDS: readonly MatchupTabId[] = MATCHUP_TABS.map((tab) => tab.id);

const CATEGORY_HASH_PREFIX = "comparison-";

/** DOM id of a tab control. Pairs with `matchupPanelId` for the ARIA wiring. */
export function matchupTabId(tab: MatchupTabId): string {
  return `matchup-tab-${tab}`;
}

/** DOM id of a tab's content panel. */
export function matchupPanelId(tab: MatchupTabId): string {
  return `matchup-panel-${tab}`;
}

export function isMatchupTabId(value: string): value is MatchupTabId {
  return (MATCHUP_TAB_IDS as readonly string[]).includes(value);
}

export type MatchupLocation = {
  tab: MatchupTabId;
  /** Set only when the fragment addresses a specific comparison category. */
  category: MatchupCategoryId | null;
};

/**
 * Read a fragment into a tab (and category, when it names one).
 * Anything unrecognised falls back to Overview rather than rendering nothing.
 */
export function parseMatchupHash(hash: string): MatchupLocation {
  const value = (hash || "").replace(/^#/, "");
  if (value.startsWith(CATEGORY_HASH_PREFIX)) {
    const category = value.slice(CATEGORY_HASH_PREFIX.length);
    if (isMatchupCategoryId(category)) return { tab: "comparison", category };
  }
  if (isMatchupTabId(value)) return { tab: value, category: null };
  return { tab: "overview", category: null };
}

/** True when the visitor has asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type MatchupNavigation = MatchupLocation & {
  /**
   * Increments on every navigation, including a repeat selection of the same
   * category. Consumers use it to re-run the expand/scroll/focus sequence that
   * a plain value comparison would swallow the second time.
   */
  token: number;
  selectTab: (tab: MatchupTabId) => void;
  openCategory: (category: MatchupCategoryId) => void;
};

export function useMatchupNavigation(): MatchupNavigation {
  const initialHash = typeof window === "undefined" ? "" : window.location.hash;
  const [state, setState] = useState<MatchupLocation & { token: number }>(() => ({
    ...parseMatchupHash(initialHash),
    token: 0,
  }));
  const tokenRef = useRef(0);
  /** Last fragment this hook has applied, so one change is never handled twice. */
  const appliedHashRef = useRef(initialHash);

  const advance = useCallback((next: MatchupLocation) => {
    tokenRef.current += 1;
    setState({ ...next, token: tokenRef.current });
  }, []);

  useEffect(() => {
    /**
     * Two events, deliberately.
     *
     * `popstate` covers Back and Forward. `hashchange` covers a fragment
     * changed any other way — an in-page link, a pasted or edited address bar —
     * which fires no `popstate` at all, and without which arriving at
     * `#comparison-defense` from an already-loaded page would silently do
     * nothing. A hash-only history traversal fires both, so the applied
     * fragment is tracked and a repeat is ignored rather than double-counted.
     *
     * `pushState` fires neither, so the two explicit actions below are not
     * affected by this and can still re-run on a repeat selection.
     */
    const sync = () => {
      const hash = window.location.hash;
      if (hash === appliedHashRef.current) return;
      appliedHashRef.current = hash;
      advance(parseMatchupHash(hash));
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [advance]);

  const selectTab = useCallback(
    (tab: MatchupTabId) => {
      appliedHashRef.current = `#${tab}`;
      window.history.pushState({ matchupTab: tab }, "", `#${tab}`);
      advance({ tab, category: null });
    },
    [advance]
  );

  const openCategory = useCallback(
    (category: MatchupCategoryId) => {
      const hash = `#${CATEGORY_HASH_PREFIX}${category}`;
      appliedHashRef.current = hash;
      window.history.pushState(
        { matchupTab: "comparison", matchupCategory: category },
        "",
        hash
      );
      advance({ tab: "comparison", category });
    },
    [advance]
  );

  return { ...state, selectTab, openCategory };
}
