// CFB Model V2 Phase 3 — preseason prior + early-season shrinkage. Builds
// on Phase 2 (src/lib/cfb/research/phase2) only. Zero dependency on
// CfbResearchMarketLine, marketAnchor, MIC, or any Phase-2+ production
// config (see noMarketImportGuard.test.ts, mirrored here).

export type CfbPriorFeatureSet = "PRIOR_A" | "PRIOR_B" | "PRIOR_C" | "PRIOR_D";
export type CfbDecayMethod = "NONE" | "FIXED_GAME_COUNT" | "PRECISION_WEIGHTED";

/**
 * Per-team preseason raw inputs for one season, all sourced from
 * information available before that season's kickoff:
 *  - prevSeasonOffense/Defense: prior full season's opponent-adjusted
 *    Iterative rating (computed on prior-season-only data).
 *  - returningProductionOffense: CFBD's /player/returning percentPPA —
 *    OFFENSE-ONLY by construction (CFBD has no defensive returning-
 *    production metric; see priorRegression.ts doc).
 *  - talent: CFBD recruiting/roster talent composite for the target season
 *    (published preseason).
 * Any field may be null — never imputed as zero (Section 9).
 */
export type PreseasonRawInputs = {
  teamExternalId: string;
  season: number;
  classification: string | null;
  prevSeasonOffense: number | null;
  prevSeasonDefense: number | null;
  returningProductionOffense: number | null;
  talent: number | null;
};

export type PriorRatings = {
  teamExternalId: string;
  priorOffense: number | null;
  priorDefense: number | null;
  /** Which fallback tier was used, for transparency/QA (Section 9). */
  offenseTier: string;
  defenseTier: string;
};

export type WeeklyBlendedRating = {
  teamExternalId: string;
  offense: number | null;
  defense: number | null;
  currentSeasonGamesPlayed: number;
};
