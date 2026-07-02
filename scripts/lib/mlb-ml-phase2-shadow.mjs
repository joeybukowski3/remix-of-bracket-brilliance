/**
 * mlb-ml-phase2-shadow.mjs
 *
 * Phase 2 Moneyline shadow COMPOSITION LAYER. Runs whichever shadow
 * components are enabled (currently: 2.1 projected-IP, 2.2 park-context)
 * and chains them into one combined shadow pick/differential/tier,
 * without ever touching the live computeModelEdgeCore() result.
 *
 * Composition order (documented, not incidental):
 *   1. Live result (computeModelEdgeCore) is always computed as the base.
 *   2. If projected-IP shadow is enabled, it recomputes a full alternate
 *      differential using different component WEIGHTS (see
 *      mlb-ml-projected-ip-shadow.mjs) -- this becomes the new base.
 *   3. If park shadow is enabled, it applies a bounded variance shrink
 *      (see mlb-ml-park-shadow.mjs) on top of whatever the current base
 *      is (the projected-IP result if enabled, otherwise the live
 *      result) -- it never invents its own differential from scratch.
 * This mirrors the Phase 2 roadmap ordering (2.1 before 2.2) and keeps
 * each component reusable/removable independently: disabling park
 * shadow just means step 3 is skipped and the projected-IP (or live)
 * result passes through unchanged; disabling projected-IP shadow just
 * means step 3 operates directly on the live result.
 *
 * Deliberately deterministic: no timestamps, no I/O, no randomness. A
 * caller (a later, not-yet-approved wiring commit) is responsible for
 * stamping generatedAt when persisting this to an archive record.
 *
 * NEVER read by any live scoring path. NEVER displayed publicly. NOT YET
 * wired into generate-mlb-ml-picks.mjs, the archive, or workflows --
 * venue must be passed in explicitly by the caller (see
 * mlb-ml-park-shadow.mjs header for why).
 */

import { computeModelEdgeCore } from "./mlb-ml-edge-core.mjs";
import { computeMlProjectedIpShadow } from "./mlb-ml-projected-ip-shadow.mjs";
import { computeMlParkShadow } from "./mlb-ml-park-shadow.mjs";
import { MLB_ML_MODEL_VERSION, MLB_ML_PHASE2_SHADOW_VERSION } from "./mlb-ml-model-version.mjs";

/**
 * @param {object} detail  Same shape as computeModelEdgeCore(detail).
 * @param {object} options
 * @param {string|null} [options.venue]  Venue name for park lookup; null/
 *   omitted is treated as "missing_venue" by the park component.
 * @param {{ ENABLE_ML_PROJECTED_IP_SHADOW?: boolean, ENABLE_ML_PARK_SHADOW?: boolean }} options.flags
 *   Typically the result of getPhase2Flags() from mlb-phase2-flags.mjs.
 *   Both default to false if omitted -- this function itself has no
 *   opinion on defaults; it does exactly what the flags it's given say.
 * @returns {object}
 */
export function computeMlPhase2Shadow(detail, { venue = null, flags = {} } = {}) {
  const live = computeModelEdgeCore(detail);

  const projectedIpEnabled = flags.ENABLE_ML_PROJECTED_IP_SHADOW === true;
  const parkEnabled = flags.ENABLE_ML_PARK_SHADOW === true;

  const projectedIpShadow = projectedIpEnabled ? computeMlProjectedIpShadow(detail) : null;

  // The base that park shadow (if enabled) chains from: the projected-IP
  // result if it ran, otherwise the live result. Never re-derived from
  // components directly -- always passed through from whichever step ran.
  const chainBase = projectedIpShadow
    ? { differential: projectedIpShadow.projectedIpShadowDifferential, pick: projectedIpShadow.projectedIpShadowPick }
    : { differential: live.differential, pick: live.pick };

  const parkShadow = parkEnabled
    ? computeMlParkShadow({ venue, baseDifferential: chainBase.differential, basePick: chainBase.pick })
    : null;

  const combined = parkShadow
    ? { differential: parkShadow.parkShadowDifferential, pick: parkShadow.parkShadowPick, tier: parkShadow.parkShadowTier }
    : { differential: chainBase.differential, pick: chainBase.pick, tier: projectedIpShadow ? projectedIpShadow.projectedIpShadowTier : null };

  return {
    liveModelVersion: MLB_ML_MODEL_VERSION,
    shadowExperimentVersion: MLB_ML_PHASE2_SHADOW_VERSION,

    // -- what actually ran --
    enabledComponents: {
      projectedIp: projectedIpEnabled,
      park: parkEnabled,
    },

    // -- live result, untouched --
    live: {
      pick: live.pick,
      differential: live.differential,
      confidence: live.confidence,
    },

    // -- per-component shadow results (null when that component was disabled) --
    projectedIpShadow,
    parkShadow,

    // -- combined Phase 2 shadow result --
    combinedShadowPick: combined.pick,
    combinedShadowDifferential: combined.differential,
    combinedShadowTier: combined.tier,

    // -- convenience: did the combined shadow pick differ from the live pick --
    pickFlipped: combined.pick !== "push" && live.pick !== "push" && combined.pick !== live.pick,
  };
}
