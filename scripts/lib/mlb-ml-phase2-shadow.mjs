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
 *      mlb-ml-projected-ip-shadow.mjs) -- this becomes the new base. If
 *      bullpen shadow is ALSO enabled, per-team bullpen data is passed
 *      into this same step (bullpen weight lives inside the projected-IP
 *      shadow's weight set, see mlb-ml-projected-ip-shadow.mjs), not as a
 *      separate chained step -- bullpen has no meaningful standalone
 *      effect without the pitcher-weight-freeing mechanism projected-IP
 *      shadow already computes, so it never runs without it.
 *   3. If park shadow is enabled, it applies a bounded variance shrink
 *      (see mlb-ml-park-shadow.mjs) on top of whatever the current base
 *      is (the projected-IP+bullpen result if enabled, otherwise the
 *      live result) -- it never invents its own differential from scratch.
 * This mirrors the Phase 2 roadmap ordering (2.1 before 2.2 before 2.4)
 * and keeps each component reusable/removable independently: disabling
 * park shadow just means step 3 is skipped and the projected-IP (or
 * live) result passes through unchanged; disabling projected-IP shadow
 * just means step 3 operates directly on the live result (and bullpen,
 * having no home to attach to, does not run either).
 *
 * Deliberately deterministic: no timestamps, no I/O, no randomness. A
 * caller (a later, not-yet-approved wiring commit) is responsible for
 * stamping generatedAt when persisting this to an archive record.
 *
 * NEVER read by any live scoring path. NEVER displayed publicly. NOT YET
 * wired into generate-mlb-ml-picks.mjs, the archive, or workflows --
 * venue and bullpen data must be passed in explicitly by the caller (see
 * mlb-ml-park-shadow.mjs header for why; bullpen data isn't fetched
 * anywhere in the Moneyline pipeline yet either, same reasoning).
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
 * @param {{ away?: object|null, home?: object|null }} [options.bullpen]
 *   Optional per-team bullpen-stats cache entries (see
 *   mlb-bullpen-stats.mjs schema), passed through to the projected-IP
 *   shadow's bullpen weighting when ENABLE_ML_BULLPEN_SHADOW is true.
 *   Ignored (never read) when that flag is off.
 * @param {{ ENABLE_ML_PROJECTED_IP_SHADOW?: boolean, ENABLE_ML_PARK_SHADOW?: boolean, ENABLE_ML_BULLPEN_SHADOW?: boolean }} options.flags
 *   Typically the result of getPhase2Flags() from mlb-phase2-flags.mjs.
 *   All default to false if omitted -- this function itself has no
 *   opinion on defaults; it does exactly what the flags it's given say.
 * @returns {object}
 */
export function computeMlPhase2Shadow(detail, { venue = null, bullpen = null, flags = {} } = {}) {
  const live = computeModelEdgeCore(detail);

  const projectedIpEnabled = flags.ENABLE_ML_PROJECTED_IP_SHADOW === true;
  const parkEnabled = flags.ENABLE_ML_PARK_SHADOW === true;
  // Bullpen shadow has no standalone effect -- it only adjusts the
  // weight set INSIDE the projected-IP shadow's per-team weighting, so
  // it never "runs" on its own when projected-IP shadow is disabled.
  const bullpenEnabled = flags.ENABLE_ML_BULLPEN_SHADOW === true && projectedIpEnabled;

  const projectedIpShadow = projectedIpEnabled
    ? computeMlProjectedIpShadow(detail, bullpenEnabled ? { bullpen: bullpen ?? {} } : {})
    : null;

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
      bullpen: bullpenEnabled,
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
