/**
 * Canonical section registry for the matchup analyzer.
 *
 * Single source of truth for section ids, order and Jump To labels so the
 * anchors, the navigation and the page can never drift apart.
 */

export type NflMatchupSectionId =
  | "overview"
  | "advantages"
  | "things-to-watch"
  | "offense"
  | "defense"
  | "matchups"
  | "trenches"
  | "market"
  | "injuries"
  | "game-trends"
  | "model-analysis";

export type NflMatchupSection = {
  id: NflMatchupSectionId;
  /** Full label used for the section heading. */
  label: string;
  /** Compact label used in the Jump To control. */
  navLabel: string;
};

/** Page order. The analyzer renders these top to bottom. */
export const NFL_MATCHUP_SECTIONS: readonly NflMatchupSection[] = [
  { id: "overview", label: "Matchup Overview", navLabel: "Overview" },
  { id: "advantages", label: "Advantages", navLabel: "Advantages" },
  { id: "things-to-watch", label: "Things to Watch", navLabel: "Things to Watch" },
  { id: "offense", label: "Offense Comparison", navLabel: "Offense" },
  { id: "defense", label: "Defense Comparison", navLabel: "Defense" },
  { id: "matchups", label: "Offense vs Defense", navLabel: "Matchups" },
  { id: "trenches", label: "Trenches", navLabel: "Trenches" },
  { id: "market", label: "Spread & Market Profile", navLabel: "Market" },
  { id: "injuries", label: "Injury Impact", navLabel: "Injuries" },
  { id: "game-trends", label: "Game Trends", navLabel: "Game Trends" },
  { id: "model-analysis", label: "Model Analysis", navLabel: "Model Analysis" },
] as const;

export function getMatchupSection(id: NflMatchupSectionId): NflMatchupSection {
  const section = NFL_MATCHUP_SECTIONS.find((entry) => entry.id === id);
  // Registry is exhaustive over the id union, so this is unreachable in
  // practice; throwing beats silently rendering an unlabelled section.
  if (!section) throw new Error(`Unknown matchup section: ${id}`);
  return section;
}
