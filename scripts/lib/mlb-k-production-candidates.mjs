/**
 * mlb-k-production-candidates.mjs
 *
 * Loads the canonical K candidate pool written by
 * scripts/generate-mlb-k-production-candidates.ts (a separate tsx step, run
 * before this loader, so this plain .mjs file never needs to import
 * TypeScript/@-aliased modules itself -- same two-step pattern already used
 * for the daily model card: a tsx generator writes an artifact, a plain .mjs
 * script consumes it).
 *
 * Never falls back to fixture or any other data when the artifact is
 * missing or malformed -- fails closed with a thrown error instead, so a
 * scheduled canonical K run can never silently substitute placeholder data
 * for live production data (see post-mlb-social-canonical.mjs's
 * --source=production handling).
 */
import { existsSync, readFileSync } from "node:fs";

const REQUIRED_CANDIDATE_FIELDS = ["pitcher", "team", "opponent", "kLine", "projectedKs", "direction"];

function validateCandidate(candidate, index) {
  for (const field of REQUIRED_CANDIDATE_FIELDS) {
    if (candidate?.[field] === undefined) {
      throw new Error(`K production candidate at index ${index} is missing required field "${field}".`);
    }
  }
  if (candidate.direction !== "OVER" && candidate.direction !== "UNDER") {
    throw new Error(`K production candidate at index ${index} has invalid direction "${candidate.direction}" (expected OVER or UNDER).`);
  }
}

/**
 * @param {object} params
 * @param {string} params.path  path to the JSON artifact written by generate-mlb-k-production-candidates.ts
 * @returns {{ candidatePool: Array<object>, pendingConfirmationCount: number, generatedAt: string|null, sourceSummary: string[] }}
 */
export function loadProductionKCandidatePool({ path: candidatesPath }) {
  if (!candidatesPath) {
    throw new Error("--source=production for K requires --candidates-file=<path to generate-mlb-k-production-candidates.ts output>.");
  }
  if (!existsSync(candidatesPath)) {
    throw new Error(`K production candidates file does not exist: ${candidatesPath}. Run scripts/generate-mlb-k-production-candidates.ts first.`);
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(candidatesPath, "utf8"));
  } catch (error) {
    throw new Error(`K production candidates file is not valid JSON (${candidatesPath}): ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(payload?.candidatePool)) {
    throw new Error(`K production candidates file has no candidatePool array (${candidatesPath}).`);
  }
  payload.candidatePool.forEach(validateCandidate);

  // No separate "still awaiting confirmation" concept exists for this
  // source: buildKPropBestBets (via resolveKPropStatus === VALID) already
  // requires complete market + workload data before a row can qualify at
  // all, so there is nothing held back to report as pending. Always an
  // accurate 0, never a guess.
  return {
    candidatePool: payload.candidatePool,
    pendingConfirmationCount: 0,
    generatedAt: payload.generatedAt ?? null,
    sourceSummary: Array.isArray(payload.sourceSummary) ? payload.sourceSummary : [],
  };
}
