// CFB Model V2 — production version identifiers (Phase 10 §5).
//
// Every generated V2 artifact must carry all four layer versions plus the
// config hash. These are plain string-literal constants, never derived at
// runtime from research config — Phase 10 §21/WU1 forbids a production
// runtime dependency on src/lib/cfb/research/**.

/** Rating foundation: metrics + preseason prior + connectivity Ridge. */
export const CFB_V2_IPR_MODEL_VERSION = "cfb-ipr-v2.0" as const;

/** Scoring regression: HFA + scoring environment + secondary block. */
export const CFB_V2_SCORING_VERSION = "cfb-scoring-v2.0" as const;

/** Total calibration (TOTAL_ONLY_LINEAR). */
export const CFB_V2_CALIBRATION_VERSION = "cfb-calibration-v2.0" as const;

/** Empirical residual bootstrap probability/interval generation. */
export const CFB_V2_PROBABILITY_VERSION = "cfb-probability-v2.0" as const;

/** Bundle id referenced by UI-facing provenance fields. */
export const CFB_V2_MODEL_VERSION = "cfb-v2.0" as const;

export type CfbV2ModelVersion = typeof CFB_V2_IPR_MODEL_VERSION;
export type CfbV2ScoringVersion = typeof CFB_V2_SCORING_VERSION;
export type CfbV2CalibrationVersion = typeof CFB_V2_CALIBRATION_VERSION;
export type CfbV2ProbabilityVersion = typeof CFB_V2_PROBABILITY_VERSION;

/**
 * All four layer versions, bundled. Required (never optional) on every V2
 * artifact row so an artifact can never omit provenance for a layer.
 */
export type CfbV2Versions = {
  ipr: CfbV2ModelVersion;
  scoring: CfbV2ScoringVersion;
  calibration: CfbV2CalibrationVersion;
  probability: CfbV2ProbabilityVersion;
};

export const CFB_V2_VERSIONS: CfbV2Versions = Object.freeze({
  ipr: CFB_V2_IPR_MODEL_VERSION,
  scoring: CFB_V2_SCORING_VERSION,
  calibration: CFB_V2_CALIBRATION_VERSION,
  probability: CFB_V2_PROBABILITY_VERSION,
});

/**
 * Deterministic 32-bit FNV-1a hash, hex-encoded. Dependency-free (no
 * node:crypto) so this module stays safe to import from browser-bundled
 * code in a future work unit without pulling in a Node-only API.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * configVersion/configHash (§3/§5) — a stable hash of a canonical config
 * snapshot so silent parameter drift is detectable even if a version
 * constant above isn't bumped. Callers pass the frozen config snapshot
 * object; the hash is computed over its deterministic JSON serialization.
 */
export function computeCfbV2ConfigHash(configSnapshot: unknown): string {
  return `cfb-v2-config-${fnv1aHex(JSON.stringify(configSnapshot))}`;
}
