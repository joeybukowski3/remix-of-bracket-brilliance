import type { CfbResearchGame } from "../types";
import type { CfbGameMatchupPopulation } from "./types";

/**
 * Centralized research-population policy (Section 1). Every place that
 * needs to know "is this an FBS game" should go through
 * classifyMatchupPopulation / isFbsResearchPopulationGame instead of
 * inlining classification-string comparisons.
 */
export const CFB_RESEARCH_POPULATION_CONFIG = Object.freeze({
  fbsClassificationValue: "fbs",
  fcsClassificationValue: "fcs",
  // Section 1: "The derived Model V2 research metrics should primarily
  // target FBS teams." A team-game enters the primary Phase 1 metrics
  // population when its own classification is FBS, regardless of
  // opponent (FBS or FCS) — matches "FBS team games" as the primary
  // population, while fbs_vs_fbs / fbs_vs_fcs remain distinguishable via
  // matchupPopulation for downstream filtering.
});

function normalizeClassification(value: string | null): string | null {
  return value === null ? null : value.trim().toLowerCase();
}

function isFbs(value: string | null): boolean {
  return normalizeClassification(value) === CFB_RESEARCH_POPULATION_CONFIG.fbsClassificationValue;
}

function isFcs(value: string | null): boolean {
  return normalizeClassification(value) === CFB_RESEARCH_POPULATION_CONFIG.fcsClassificationValue;
}

/** Section 1: at minimum distinguish fbs_vs_fbs / fbs_vs_fcs / fcs_vs_fbs / non_fbs_only / unknown. */
export function classifyMatchupPopulation(game: CfbResearchGame): CfbGameMatchupPopulation {
  const home = normalizeClassification(game.homeClassification);
  const away = normalizeClassification(game.awayClassification);
  if (home === null || away === null) return "unknown";
  if (isFbs(game.homeClassification) && isFbs(game.awayClassification)) return "fbs_vs_fbs";
  if (isFbs(game.homeClassification) && isFcs(game.awayClassification)) return "fbs_vs_fcs";
  if (isFcs(game.homeClassification) && isFbs(game.awayClassification)) return "fcs_vs_fbs";
  if (!isFbs(game.homeClassification) && !isFbs(game.awayClassification)) return "non_fbs_only";
  return "unknown";
}

/** Whether `game` belongs in the primary Phase 1 population at all (has at least one FBS side). */
export function isFbsResearchPopulationGame(game: CfbResearchGame): boolean {
  const population = classifyMatchupPopulation(game);
  return population === "fbs_vs_fbs" || population === "fbs_vs_fcs" || population === "fcs_vs_fbs";
}

/** Whether a single team-side classification qualifies for the primary FBS team-game population. */
export function isFbsTeamClassification(classification: string | null): boolean {
  return isFbs(classification);
}
