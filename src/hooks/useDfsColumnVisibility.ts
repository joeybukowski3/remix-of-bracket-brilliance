import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyDfsColumnVisibility,
  dfsDefaultHiddenIds,
  sanitizeHiddenIds,
  type DfsColumnDef,
  type DfsColumnId,
  type DfsColumnLayout,
} from "@/lib/nfl/dfs/columnRegistry";
import type { DfsBoardView } from "@/lib/nfl/dfs/presentation";

/**
 * Versioned key. Bump the suffix only for a breaking change to the stored
 * shape; adding a new registry column is NOT breaking (the stored unit is a
 * hidden-id set, so unknown-to-old / new-to-user columns default to visible).
 */
export const DFS_COLUMNS_STORAGE_KEY = "jkb-nfl-dfs-columns-v1";

type StoredShape = { v: 1; hidden: string[] };

function readStoredHiddenIds(): DfsColumnId[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DFS_COLUMNS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.hidden)) return null;
    return sanitizeHiddenIds(parsed.hidden);
  } catch {
    return null;
  }
}

function writeStoredHiddenIds(hidden: readonly DfsColumnId[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredShape = { v: 1, hidden: [...hidden] };
    window.localStorage.setItem(DFS_COLUMNS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable (private mode, quota, disabled) — in-memory state still works */
  }
}

export type DfsColumnVisibility = {
  /** Hidden optional column ids (sanitized). */
  hiddenIds: ReadonlySet<string>;
  /** Whether a given column id is currently visible. */
  isVisible: (id: DfsColumnId) => boolean;
  /** Ordered, scope-filtered, visibility-filtered columns for a board view. */
  columnsForView: (view: DfsBoardView) => DfsColumnDef[];
  /** Toggle one optional column (mandatory columns are ignored). */
  toggle: (column: DfsColumnDef) => void;
  /** Restore the layout's default visible set. */
  reset: () => void;
  /** True when the current selection differs from the layout default. */
  isCustomized: boolean;
};

/**
 * Column-visibility state for the DFS analyzer board, persisted to
 * localStorage under a versioned key. SSR/test-safe: reads happen lazily and
 * every access is wrapped, so an unavailable `localStorage` degrades to
 * in-memory state with sensible layout defaults.
 *
 * `layout` only affects the *default* set used on a first load (or after
 * Reset); once the user makes a choice it is a single shared selection.
 */
export function useDfsColumnVisibility(layout: DfsColumnLayout): DfsColumnVisibility {
  const [hidden, setHidden] = useState<DfsColumnId[]>(() => readStoredHiddenIds() ?? dfsDefaultHiddenIds(layout));

  // If no saved config exists yet, keep following the layout default as the
  // viewport crosses the breakpoint. Once a saved config exists it wins.
  useEffect(() => {
    if (readStoredHiddenIds() != null) return;
    setHidden(dfsDefaultHiddenIds(layout));
  }, [layout]);

  const hiddenSet = useMemo(() => new Set<string>(hidden), [hidden]);

  const toggle = useCallback((column: DfsColumnDef) => {
    if (column.mandatory) return;
    setHidden((current) => {
      const next = current.includes(column.id)
        ? current.filter((id) => id !== column.id)
        : [...current, column.id];
      writeStoredHiddenIds(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(DFS_COLUMNS_STORAGE_KEY); } catch { /* ignore */ }
    }
    setHidden(dfsDefaultHiddenIds(layout));
  }, [layout]);

  const isVisible = useCallback((id: DfsColumnId) => !hiddenSet.has(id), [hiddenSet]);
  const columnsForView = useCallback((view: DfsBoardView) => applyDfsColumnVisibility(view, hiddenSet), [hiddenSet]);

  const isCustomized = useMemo(() => {
    const def = new Set(dfsDefaultHiddenIds(layout));
    return def.size !== hiddenSet.size || [...hiddenSet].some((id) => !def.has(id));
  }, [hiddenSet, layout]);

  return { hiddenIds: hiddenSet, isVisible, columnsForView, toggle, reset, isCustomized };
}

export default useDfsColumnVisibility;
