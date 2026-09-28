/**
 * AI Picks v2 automation -- the explicit manifest of what a scheduled run may
 * COMMIT. A fresh CI checkout has none of data/nfl/analysis, so the planner
 * needs a minimal, normalized slice of it to avoid treating every game as new.
 * Everything not listed here is deliberately never committed.
 *
 * The workflow (.github/workflows/nfl-ai-handicap-v2.yml, env
 * GENERATED_PATHSPECS) must list exactly V2_COMMIT_PATHSPECS; a test enforces it.
 *
 * WHY EACH PERSISTED FILE IS REQUIRED ACROSS CI RUNS
 *   evidence.live-test.json   The provider's normalized evidence. Drives evidence-change detection (Stage A
 *                             evidence hash), is the input Stage A/B read, is the baseline a research UPDATE
 *                             diffs against, and its generatedAt is the "last researched" clock. Costs a paid
 *                             research call to recreate.
 *   handicap-v2/*.json        The write-once v2 records. Carry the locked Stage A (so a market-only reprice does
 *                             not rerun it), the context hash, the market at decision and the input fingerprint
 *                             (no-op detection), and the published content (presentation comparison/regeneration).
 *                             Costs Stage A + B calls to recreate, and would change the pick.
 *   v2-attempts.json          The failure ledger. Without it a failing game is retried and billed every run.
 *                             Error text only (truncated), no provider output.
 *
 * WHY THE REST IS EXCLUDED
 *   latest.json, history.json,   The v1 snapshot lineage. Only the research UPDATE mode needs it, and it is
 *   snapshots/*.json             rebuilt for free by the zero-cost bootstrap from evidence.live-test.json plus the
 *                                rebuilt context (the planner already plans that bootstrap when lineage is absent).
 *   research/**                  Raw provider responses and run diagnostics.
 *   game-context/**              Free to rebuild from tracked upstream artifacts.
 *   evidence.json                The synthetic WU2 fixture (already tracked, never written by this pipeline).
 */
export const V2_PUBLIC_ARTIFACT_PATHSPEC = ":(glob)public/data/nfl/*/ai-handicaps/*.json";

export const V2_PERSISTED_STATE_PATHSPECS = [
  ":(glob)data/nfl/analysis/*/*/*/*/evidence.live-test.json",
  ":(glob)data/nfl/analysis/*/*/*/*/handicap-v2/*.json",
  ":(glob)data/nfl/analysis/*/*/*/*/v2-attempts.json",
] as const;

/** Everything a scheduled run may stage, in workflow order. */
export const V2_COMMIT_PATHSPECS: readonly string[] = [V2_PUBLIC_ARTIFACT_PATHSPEC, ...V2_PERSISTED_STATE_PATHSPECS];
