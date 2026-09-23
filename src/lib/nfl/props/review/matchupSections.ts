/** Pure section model for the Yardage Props Review's selected-matchup view. No data fetching, no model logic. */
import type { NflProjectionMarket } from "../types/projectionOutput";
import { DEFAULT_YARDAGE_REVIEW_FILTERS, applyYardageReviewFilters, type NflYardageReviewFilters } from "./reviewFilters";
import type { NflYardageReviewRow } from "./yardageMarketJoin";

export type NflMatchupPosition = "QB" | "RB" | "WR" | "TE";

export type NflMatchupSectionConfig = {
  position: NflMatchupPosition;
  /** Prop types this section can show; a single entry means no local tabs. First entry is the default. */
  markets: readonly NflProjectionMarket[];
};

/** Render order for a selected matchup. */
export const MATCHUP_SECTIONS: readonly NflMatchupSectionConfig[] = [
  { position: "QB", markets: ["passing", "rushing"] },
  { position: "RB", markets: ["rushing", "receiving"] },
  { position: "WR", markets: ["receiving"] },
  { position: "TE", markets: ["receiving"] },
];

export type NflMatchupSectionEntries = {
  /** Rows passing the shared band/line filters for this position + prop type. */
  entries: NflYardageReviewRow[];
  /** Rows for this position + prop type in the matchup before band/line filters (drives the empty-state wording). */
  unfilteredCount: number;
};

/**
 * Selects one section's rows from all-market review entries. The matchup, band and line
 * filters are the same ones the global table uses (applyYardageReviewFilters); position is
 * fixed by the section, so the global position filter is intentionally ignored here.
 */
export function selectMatchupSectionEntries(
  entriesByMarket: Readonly<Record<NflProjectionMarket, readonly NflYardageReviewRow[]>>,
  filters: NflYardageReviewFilters,
  position: NflMatchupPosition,
  market: NflProjectionMarket,
): NflMatchupSectionEntries {
  const forPosition = entriesByMarket[market].filter((entry) => entry.row.position === position);
  const inMatchup = applyYardageReviewFilters(forPosition, { ...DEFAULT_YARDAGE_REVIEW_FILTERS, matchup: filters.matchup });
  const entries = applyYardageReviewFilters(forPosition, { ...filters, position: "all" });
  return { entries, unfilteredCount: inMatchup.length };
}

