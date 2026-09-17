import { useCallback, useState } from "react";
import type { MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import { CURATED_METRIC_DEFAULTS } from "@/lib/nfl/matchupCuratedMetrics";

export type MatchupVisualizationView = "towers" | "profile";

/**
 * Session-only state shared by Rank Towers and Signature Profile.
 *
 * View mode is a single value for the whole page visit — switching category
 * never resets it. Metric selection is kept per category so a visitor can
 * pick different metrics for Offense than for Passing, but Towers and Profile
 * always read the same selection for whichever category is active: there is
 * exactly one `selectionsByCategory` map, not one per view.
 *
 * Deliberately not persisted (no localStorage) — the spec calls for
 * per-visit persistence only.
 */
export function useMatchupVisualizationState() {
  const [view, setView] = useState<MatchupVisualizationView>("towers");
  const [selectionsByCategory, setSelectionsByCategory] = useState<
    Partial<Record<MatchupCategoryId, readonly string[]>>
  >({});

  const getSelectedMetricIds = useCallback(
    (categoryId: MatchupCategoryId): readonly string[] =>
      selectionsByCategory[categoryId] ?? CURATED_METRIC_DEFAULTS[categoryId],
    [selectionsByCategory]
  );

  const isUsingDefaults = useCallback(
    (categoryId: MatchupCategoryId): boolean => !(categoryId in selectionsByCategory),
    [selectionsByCategory]
  );

  const setSelectedMetricIds = useCallback(
    (categoryId: MatchupCategoryId, ids: readonly string[]) => {
      setSelectionsByCategory((prev) => ({ ...prev, [categoryId]: ids }));
    },
    []
  );

  const resetToDefaults = useCallback((categoryId: MatchupCategoryId) => {
    setSelectionsByCategory((prev) => {
      if (!(categoryId in prev)) return prev;
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
  }, []);

  return {
    view,
    setView,
    getSelectedMetricIds,
    setSelectedMetricIds,
    resetToDefaults,
    isUsingDefaults,
  };
}
