/**
 * Centralized pause switch for ML live posting (post-mlb-ml-edges-to-x.mjs).
 * The ML model/table is under revision, so every live path -- workflow_run,
 * schedule, and manual workflow_dispatch mode=post/post-text-only -- must
 * be blocked before any X API call is made (including account
 * verification, which is itself a real API call). Preview (--dry-run),
 * --verify-account, and --post-key-only stay fully available. Flip
 * ML_X_POSTING_ENABLED=true (in the workflow's env) to re-enable.
 */
export function isMlPostingEnabled(envValue) {
  return envValue === "true";
}
