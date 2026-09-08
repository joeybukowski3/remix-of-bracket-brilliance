/**
 * mlb-k-v4-projection-validator.mjs
 *
 * The production gate on one row's V4 block. Mirrors the V3 validator's shape
 * and intent: V4 is used ONLY when its own output passes every structural
 * check, and a rejection is a normal, recorded outcome that falls back rather
 * than an error.
 *
 * V4 declines openers and relievers itself, so most rejections here are the
 * unremarkable "not a starter" case.
 */

export const V4_REJECTION_REASON = Object.freeze({
  MISSING_V4_BLOCK: "missing-v4-block",
  ROLE_OUT_OF_SCOPE: "v4-role-out-of-scope",
  INVALID_PROJECTION: "invalid-v4-projection",
  INVALID_COMPONENTS: "invalid-v4-components",
  LOW_CONFIDENCE: "low-v4-confidence",
  IMPLAUSIBLE_PROJECTION: "implausible-v4-projection",
});

/** Confidence grades allowed to reach production. */
export const V4_PRODUCTION_CONFIDENCE = Object.freeze(new Set(["high", "medium"]));

/**
 * Plausibility envelope for a STARTER's projected strikeouts. This is not a
 * modelling clamp -- the model already clamps innings and K/IP -- it is a
 * last-resort guard so a corrupted input can never publish an absurd number.
 */
export const V4_MIN_PROJECTED_KS = 0.5;
export const V4_MAX_PROJECTED_KS = 14;

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {object|null} v4 the row's v4 block
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function validateV4ForProduction(v4) {
  if (v4 == null || typeof v4 !== "object") {
    return { ok: false, reason: V4_REJECTION_REASON.MISSING_V4_BLOCK };
  }

  const warnings = Array.isArray(v4.warnings) ? v4.warnings : [];
  if (warnings.some((flag) => String(flag).startsWith("ROLE_OUT_OF_V4_SCOPE_"))) {
    return { ok: false, reason: V4_REJECTION_REASON.ROLE_OUT_OF_SCOPE };
  }

  const projectedKs = finite(v4.projectedKs);
  if (projectedKs === null || projectedKs <= 0) {
    return { ok: false, reason: V4_REJECTION_REASON.INVALID_PROJECTION };
  }

  // Both components must be real: publishing a strikeout total whose innings
  // or per-inning rate is unusable would leave the row internally inconsistent
  // for every downstream surface that reads projectedIP.
  const innings = finite(v4.finalProjectedIP);
  const kPerInning = finite(v4.finalProjectedKPerIP);
  if (innings === null || innings <= 0 || kPerInning === null || kPerInning <= 0) {
    return { ok: false, reason: V4_REJECTION_REASON.INVALID_COMPONENTS };
  }

  if (!V4_PRODUCTION_CONFIDENCE.has(v4.confidence)) {
    return { ok: false, reason: V4_REJECTION_REASON.LOW_CONFIDENCE };
  }

  if (projectedKs < V4_MIN_PROJECTED_KS || projectedKs > V4_MAX_PROJECTED_KS) {
    return { ok: false, reason: V4_REJECTION_REASON.IMPLAUSIBLE_PROJECTION };
  }

  return { ok: true, reason: null };
}

export default validateV4ForProduction;
