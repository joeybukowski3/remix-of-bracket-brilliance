/**
 * RESEARCH ONLY -- study mlb-k-archive-outcome-repair-and-workload-dispersion-v1
 *
 * Outcome-validity gate for the research archive. Nothing here is imported by
 * production code and nothing here rewrites a public artifact.
 *
 * THE DEFECT
 * ----------
 * scripts/research/mlb-k-extract-history.mjs harvests graded outcomes from two
 * sources. The start-log path is safe: it rejects a row whose outs are
 * unreadable. The top-k-grading path is not, because of this coercion:
 *
 *   const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
 *
 * Number(null) is 0 and Number.isFinite(0) is true, so num(null) returns 0
 * rather than null. A scheduled-but-unplayed row in
 * public/data/mlb/top-k-performance.json carries
 *   actualStrikeOuts: null, battersFaced: null, actualInningsPitched: null
 * and is therefore admitted as a real appearance of 0 strikeouts over 0
 * batters faced. The production artifact is correct; only the research
 * extractor misreads it.
 *
 * THE RULE
 * --------
 * An outcome is a real pitching appearance only if the pitcher actually faced
 * someone. Zero batters faced is not a performance, it is the absence of one.
 * A genuine 0-strikeout appearance always has positive batters faced and must
 * survive -- there are 17 such rows in this archive and every one is retained.
 */

/** Strict numeric read: null / undefined / "" are ABSENT, never zero. */
export function strictNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const EXCLUSION_REASONS = Object.freeze({
  MISSING_ACTUAL_KS: "MISSING_ACTUAL_KS",
  MISSING_ACTUAL_BF: "MISSING_ACTUAL_BF",
  UNRESOLVED_ZERO_BF_PLACEHOLDER: "UNRESOLVED_ZERO_BF_PLACEHOLDER",
  NEGATIVE_OUTCOME: "NEGATIVE_OUTCOME",
  UNPROJECTED_ZEROED_PROJECTION: "UNPROJECTED_ZEROED_PROJECTION",
});

/**
 * Classifies one archived outcome. Deterministic: the same row always yields
 * the same verdict and the same reason, and reasons are checked in a fixed
 * order so a row with two defects reports the more specific one.
 */
export function classifyOutcome(row) {
  const actualKs = strictNumber(row?.actualKs);
  const actualBF = strictNumber(row?.actualBF);

  if (actualKs === null) return { valid: false, reason: EXCLUSION_REASONS.MISSING_ACTUAL_KS };
  if (actualBF === null) return { valid: false, reason: EXCLUSION_REASONS.MISSING_ACTUAL_BF };
  if (actualKs < 0 || actualBF < 0) return { valid: false, reason: EXCLUSION_REASONS.NEGATIVE_OUTCOME };

  // The whole point of the repair: 0 batters faced means the appearance never
  // resolved, whatever the strikeout field says.
  if (actualBF === 0) return { valid: false, reason: EXCLUSION_REASONS.UNRESOLVED_ZERO_BF_PLACEHOLDER };

  return { valid: true, reason: null };
}

export function isValidOutcome(row) {
  return classifyOutcome(row).valid;
}

/**
 * The SAME coercion defect has a second manifestation on the projection side.
 * When kProjectionV2 declines to project -- confidence "insufficient", with
 * projectedStrikeouts, projectedKRate and pitcherSkillRate all null -- the
 * extractor's Number(null) turned each of those nulls into 0, producing rows
 * that claim a projection of exactly 0 strikeouts at a K rate of exactly 0.
 *
 * A strikeout rate of 0 is not a projection any model produces: MIN_K_RATE is
 * 0.10. Rows whose skill rate and K rate are both exactly zero are therefore
 * the null signature, not a real forecast, and they cannot enter a graded
 * sample or a league anchor recovery.
 */
export function classifyProjection(row) {
  const projectedKRate = strictNumber(row?.v2ProjectedKRate);
  const pitcherSkillRate = strictNumber(row?.v2PitcherSkillRate);
  const projectedBF = strictNumber(row?.v2ProjectedBF);

  const zeroed =
    projectedKRate === null ||
    pitcherSkillRate === null ||
    projectedBF === null ||
    projectedKRate <= 0 ||
    pitcherSkillRate <= 0 ||
    projectedBF <= 0;

  if (zeroed) return { valid: false, reason: EXCLUSION_REASONS.UNPROJECTED_ZEROED_PROJECTION };
  return { valid: true, reason: null };
}

/** A row is usable by this study only if BOTH its projection and its outcome are real. */
export function classifyRow(row) {
  const projection = classifyProjection(row);
  if (!projection.valid) return projection;
  return classifyOutcome(row);
}

/**
 * Splits rows into kept and excluded, preserving every excluded row alongside
 * its reason so the exclusions artifact is auditable rather than a count.
 */
export function partitionByOutcomeValidity(rows, { classify = classifyOutcome } = {}) {
  const kept = [];
  const excluded = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const verdict = classify(row);
    if (verdict.valid) kept.push(row);
    else excluded.push({ row, reason: verdict.reason });
  }
  return { kept, excluded };
}

/** Deterministic tally of exclusion reasons, keys in EXCLUSION_REASONS order. */
export function exclusionCounts(excluded) {
  const counts = {};
  for (const key of Object.keys(EXCLUSION_REASONS)) counts[key] = 0;
  for (const entry of Array.isArray(excluded) ? excluded : []) {
    if (counts[entry?.reason] !== undefined) counts[entry.reason] += 1;
  }
  return counts;
}
