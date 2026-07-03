/**
 * mlb-phase2-flags.mjs
 *
 * Centralized Phase 2 shadow-experiment feature flags.
 *
 * Convention (matches the existing repo pattern, e.g. X_ALLOW_LIVE_POST in
 * scripts/post-mlb-hr-props-to-x.mjs): an env var must be the exact string
 * "true" to enable a flag. Anything else (unset, "false", "1", "TRUE",
 * etc.) is treated as disabled.
 *
 * ALL flags default to false. Local/manual runs are inert by default --
 * no shadow computation, no optional archive fields, no comparison
 * artifact. Production activation happens explicitly in the GitHub
 * Actions workflow YAML (env: block on the relevant step/job), never
 * here. This file only defines the safe default and the read logic, so
 * disabling a flag in the workflow is always a one-line kill switch.
 *
 * None of these flags may be read by any live-scoring code path
 * (computeModelEdgeCore in mlb-ml-edge-core.mjs / mlbModelEdge.ts,
 * computeBatterHrScore in generate-mlb-hr-props.mjs). They gate ONLY
 * shadow/candidate computation, optional archive fields, and the Phase 2
 * shadow-comparison artifact.
 */

const ENABLED_VALUE = "true";

function isEnabled(envVarName) {
  return process.env[envVarName] === ENABLED_VALUE;
}

/**
 * @typedef {object} Phase2Flags
 * @property {boolean} ENABLE_ML_PROJECTED_IP_SHADOW
 * @property {boolean} ENABLE_ML_PARK_SHADOW
 * @property {boolean} ENABLE_BULLPEN_DATA_PIPELINE
 * @property {boolean} ENABLE_ML_BULLPEN_SHADOW
 * @property {boolean} ENABLE_HR_BULLPEN_SHADOW
 * @property {boolean} ENABLE_HAND_SPLIT_DATA_PIPELINE
 * @property {boolean} ENABLE_HR_HAND_SPLIT_SHADOW
 * @property {boolean} ENABLE_PHASE2_SHADOW_COMPARISON
 */

/**
 * Reads all Phase 2 flags fresh from process.env on every call (rather
 * than caching at import time), so tests can mutate process.env between
 * cases and workflow steps always see the current environment.
 *
 * @returns {Phase2Flags}
 */
export function getPhase2Flags() {
  return {
    ENABLE_ML_PROJECTED_IP_SHADOW: isEnabled("ENABLE_ML_PROJECTED_IP_SHADOW"),
    ENABLE_ML_PARK_SHADOW: isEnabled("ENABLE_ML_PARK_SHADOW"),
    ENABLE_BULLPEN_DATA_PIPELINE: isEnabled("ENABLE_BULLPEN_DATA_PIPELINE"),
    ENABLE_ML_BULLPEN_SHADOW: isEnabled("ENABLE_ML_BULLPEN_SHADOW"),
    ENABLE_HR_BULLPEN_SHADOW: isEnabled("ENABLE_HR_BULLPEN_SHADOW"),
    ENABLE_HAND_SPLIT_DATA_PIPELINE: isEnabled("ENABLE_HAND_SPLIT_DATA_PIPELINE"),
    ENABLE_HR_HAND_SPLIT_SHADOW: isEnabled("ENABLE_HR_HAND_SPLIT_SHADOW"),
    ENABLE_PHASE2_SHADOW_COMPARISON: isEnabled("ENABLE_PHASE2_SHADOW_COMPARISON"),
  };
}

/** Convenience single-flag reader for the Phase 2.1 Moneyline projected-IP shadow. */
export function isMlProjectedIpShadowEnabled() {
  return isEnabled("ENABLE_ML_PROJECTED_IP_SHADOW");
}
