/**
 * mlb-k-projection-v3 -- promotion gate.
 *
 * Decides whether one row's `v3` block is fit to become the PUBLIC production
 * projection. Nothing here computes a projection; it only judges one, so the
 * rule that lets v3 reach the public payload lives in exactly one readable
 * place rather than being spread through the resolver.
 *
 * The gate is deliberately conservative and fail-closed: anything it cannot
 * positively verify is a rejection, and a rejection means the row falls back to
 * v2 with a recorded reason. A v3 block that is absent, declined, or structurally
 * odd must never silently become a public number.
 */

/** Why a v3 block was refused for production. Mirrors the v2 reason style. */
export const K_PROJECTION_V3_REJECTION_REASON = Object.freeze({
  MISSING_V3_BLOCK: "missing-v3-block",
  V3_ROLE_OUT_OF_SCOPE: "v3-role-out-of-scope",
  INVALID_V3_PROJECTION: "invalid-v3-projection",
  INVALID_V3_K_RATE: "invalid-v3-k-rate",
  INVALID_V3_BATTERS_FACED: "invalid-v3-batters-faced",
  INVALID_V3_INNINGS: "invalid-v3-innings",
  INVALID_V3_ALPHA: "invalid-v3-alpha",
  INVALID_V3_SEASON_BF_PROVENANCE: "invalid-v3-season-bf-provenance",
  V3_MODEL_VERSION_MISMATCH: "v3-model-version-mismatch",
});

export const V3_MODEL_VERSION = "mlb-k-projection-v3";

/**
 * Bounds the gate enforces. These mirror the model's own clamps rather than
 * inventing new ones: a value outside them means the block did not come from
 * the model this gate believes it is judging.
 */
export const V3_BOUNDS = Object.freeze({
  minKRate: 0.1,
  maxKRate: 0.4,
  minBattersFaced: 12,
  maxBattersFaced: 30,
  minInnings: 3,
  maxInnings: 8.5,
  minStrikeouts: 0,
  maxStrikeouts: 20,
});

/**
 * Season-BF provenance values that may back a production alpha. A fallback
 * alpha is still allowed -- it is simply the current production constant -- but
 * "not-evaluated" means the row was declined before alpha was ever computed and
 * must not reach production.
 */
export const V3_VALID_SEASON_BF_SOURCES = Object.freeze(
  new Set(["workload.pitcherContext.seasonBattersFaced", "details.pitcherVenueSplits.season.battersFaced", "unavailable"]),
);

const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const inRange = (value, low, high) => {
  const n = finite(value);
  return n !== null && n >= low && n <= high;
};

/**
 * Judges one v3 block.
 *
 * @param {object|null} v3 the row's `v3` block from k-props-v2-shadow.json
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function validateV3ForProduction(v3) {
  if (v3 == null || typeof v3 !== "object") {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.MISSING_V3_BLOCK };
  }

  if (v3.modelVersion !== V3_MODEL_VERSION) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.V3_MODEL_VERSION_MISMATCH };
  }

  // An explicitly declined row (opener, reliever) is a correct refusal by the
  // model, not a defect -- but it is still not a production projection.
  const flags = Array.isArray(v3.flags) ? v3.flags : [];
  if (flags.some((flag) => String(flag).startsWith("ROLE_OUT_OF_V3_SCOPE_"))) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.V3_ROLE_OUT_OF_SCOPE };
  }

  // A projection of exactly 0 is the null signature, never a real forecast:
  // MIN_K_RATE is 0.10 and MIN_BF is 12, so the product cannot legitimately be 0.
  if (!inRange(v3.projectedKs, V3_BOUNDS.minStrikeouts, V3_BOUNDS.maxStrikeouts) || finite(v3.projectedKs) <= 0) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.INVALID_V3_PROJECTION };
  }
  if (!inRange(v3.projectedKRate, V3_BOUNDS.minKRate, V3_BOUNDS.maxKRate)) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.INVALID_V3_K_RATE };
  }
  if (!inRange(v3.projectedBF, V3_BOUNDS.minBattersFaced, V3_BOUNDS.maxBattersFaced)) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.INVALID_V3_BATTERS_FACED };
  }
  if (!inRange(v3.finalProjectedIP, V3_BOUNDS.minInnings, V3_BOUNDS.maxInnings)) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.INVALID_V3_INNINGS };
  }
  if (!inRange(v3.alpha, 0, 1)) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.INVALID_V3_ALPHA };
  }
  if (!V3_VALID_SEASON_BF_SOURCES.has(v3.seasonBFSource)) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.INVALID_V3_SEASON_BF_PROVENANCE };
  }

  // Internal consistency: the published strikeouts must actually be the product
  // of the published rate and batters faced. A mismatch means the block was
  // assembled from parts that do not belong together.
  const implied = finite(v3.projectedKRate) * finite(v3.projectedBF);
  if (Math.abs(implied - finite(v3.projectedKs)) > 0.02) {
    return { ok: false, reason: K_PROJECTION_V3_REJECTION_REASON.INVALID_V3_PROJECTION };
  }

  return { ok: true, reason: null };
}

export default validateV3ForProduction;
