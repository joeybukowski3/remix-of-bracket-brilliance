/**
 * CFB Model V2 — production namespace (Phase 10 WU1).
 *
 * - Model V2 (IPR) is analytics-only: no betting recommendations, edge, EV,
 *   or confidence-bet fields exist anywhere in this namespace (Phase 10 §27).
 * - IPR (Independent Predictive Rating) is market-independent by
 *   construction — this namespace never imports marketAnchor.ts, MIC code,
 *   or market-line data (Phase 10 §6/§16, enforced by architectureGuard.test.ts).
 * - Market comparison, if ever built, stays strictly downstream of IPR and
 *   lives outside this namespace (Phase 10 §7) — IPR → future MIC, never MIC → IPR.
 * - No validated betting edge exists (Phase 6/9 research findings) — nothing
 *   in this namespace should be presented as one.
 *
 * See docs/cfb-model-v2-production-integration-plan.md for the full design.
 */

export * from "./versions";
export * from "./config";
export * from "./connectivity";
export * from "./types";
export * from "./artifactContracts";
export * from "./legacyCompat";
