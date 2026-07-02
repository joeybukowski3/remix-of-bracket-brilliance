/**
 * mlb-ml-model-version.mjs
 *
 * Centralized Moneyline Edge model version constant, mirroring
 * mlb-hr-model-version.mjs. This marks the version of the archival
 * pipeline (schema, archive format, grading rules) -- NOT the live
 * scoring formula, which is unchanged by Phase 1 (see mlb-ml-edge-core.mjs
 * header note on keeping the JS port in sync with mlbModelEdge.ts).
 *
 * Increment MLB_ML_MODEL_VERSION whenever:
 *  - The live computeModelEdge() weighting or inputs change (and the JS
 *    port here is updated to match)
 *  - The archive record schema changes in a backward-incompatible way
 *  - The grading rules change
 *
 * Do NOT scatter hardcoded version strings elsewhere — import this constant.
 */

export const MLB_ML_MODEL_VERSION = "mlb-ml-edge-v1.0";

/**
 * Phase 2 shadow-experiment version for the Moneyline model. Identifies
 * ONLY the shadow/candidate scoring pipeline (projected-IP, park, bullpen
 * shadow components and their composition) -- NEVER the live pick,
 * differential, confidence, tier, or factors, which remain versioned
 * solely by MLB_ML_MODEL_VERSION above. A shadow record must never be
 * mistaken for a production model version; always store this alongside,
 * not in place of, MLB_ML_MODEL_VERSION.
 */
export const MLB_ML_PHASE2_SHADOW_VERSION = "mlb-ml-phase2-shadow-v1";
