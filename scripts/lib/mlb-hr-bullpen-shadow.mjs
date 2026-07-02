/**
 * mlb-hr-bullpen-shadow.mjs
 *
 * Phase 2.4 -- Opposing bullpen HR vulnerability for HR props (SHADOW ONLY).
 *
 * Computes a bounded, shadow-only signal describing how HR-vulnerable a
 * batter's OPPONENT's bullpen is, scaled by how many innings that bullpen
 * is actually expected to pitch this game (estimated from the opposing
 * starter's projected innings, via the same shared formula the Moneyline
 * projected-IP shadow uses -- see mlb-projected-innings.mjs). A batter
 * who is unlikely to face the bullpen at all (opponent starter projected
 * to go deep) gets a near-zero contribution regardless of how bad that
 * bullpen's HR rate is; a batter facing a short-outing starter gets a
 * larger share of the bullpen's vulnerability.
 *
 * This NEVER feeds computeCandidateHrScore() (mlb-hr-candidate-score.mjs)
 * or the live HR Quality Score (computeBatterHrScore in
 * generate-mlb-hr-props.mjs) -- it is an entirely separate, additively-
 * exposed field, gated behind ENABLE_HR_BULLPEN_SHADOW and NOT wired into
 * any generator, archive, workflow, or public UI in this commit.
 *
 * Design (approved 2026-07-02):
 *   - Bullpen HR/9 is converted to a bounded [15, 88] vulnerability score
 *     (higher = more HR-vulnerable), using the SAME league-average HR/9
 *     pivot (1.18) and curve shape as hr9Score() in mlb-ml-edge-core.mjs,
 *     inverted (a bullpen with a low HR/9 is a LOW-vulnerability bullpen).
 *   - The final contribution is bounded to +/-MAX_CONTRIBUTION points and
 *     scaled by exposureFraction (projected bullpen innings / 9), so a
 *     deep-starter matchup structurally cannot produce a large swing.
 *   - Missing, stale, or low-quality (dataQuality "insufficient"/"low")
 *     opposing-bullpen data produces a NEUTRAL/NO-OP result: contribution
 *     is exactly 0 and `available` is false. Callers must never treat a
 *     missing-data result as "bullpen is average" implicitly -- the
 *     explicit `available`/`reason` fields make the distinction visible.
 */

import { calculateProjectedInnings, hasRealProjectedInningsData, parseInningsPitchedString } from "./mlb-projected-innings.mjs";
import { MLB_HR_MODEL_VERSION, MLB_HR_BULLPEN_SHADOW_VERSION } from "./mlb-hr-model-version.mjs";

const GAME_INNINGS = 9;

/** Bullpen data-quality tiers (from mlb-bullpen-season-aggregate.mjs) usable for shadow scoring. */
const USABLE_DATA_QUALITY_TIERS = new Set(["adequate", "high"]);

/** Hard bound on how many points this component can move a downstream score by, in either direction. */
export const MAX_HR_BULLPEN_CONTRIBUTION = 8;

/** Same league-average bullpen HR/9 pivot used elsewhere (hr9Score in mlb-ml-edge-core.mjs / mlb-ml-bullpen-shadow.mjs), for cross-model consistency. */
const LEAGUE_AVG_BULLPEN_HR9 = 1.18;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Inverted relative to a "goodness" score: a HIGHER bullpen HR/9 means
// MORE vulnerable to home runs, so this returns a higher score for worse
// (higher) HR/9, on the same [15, 88] scale used across the Phase 2
// shadow components.
function bullpenHr9VulnerabilityScore(hr9) {
  if (hr9 == null) return null;
  const avg = LEAGUE_AVG_BULLPEN_HR9;
  return hr9 <= avg
    ? clamp(50 - ((avg - hr9) / 0.68) * 28, 15, 88)
    : clamp(50 + ((hr9 - avg) / 0.82) * 33, 15, 88);
}

/**
 * @param {object|null|undefined} bullpenEntry  A team-bullpen-stats cache
 *   entry (see mlb-bullpen-stats.mjs schema).
 * @returns {{ available: boolean, reason: string }}
 */
export function classifyBullpenAvailability(bullpenEntry) {
  if (!bullpenEntry) return { available: false, reason: "missing" };
  if (bullpenEntry.freshnessStatus === "missing") return { available: false, reason: "missing" };
  if (bullpenEntry.freshnessStatus === "stale-fallback") return { available: false, reason: "stale" };
  const season = bullpenEntry.season;
  if (!season) return { available: false, reason: "missing_season_section" };
  if (!USABLE_DATA_QUALITY_TIERS.has(season.dataQuality)) return { available: false, reason: "low_coverage" };
  return { available: true, reason: "ok" };
}

/**
 * @param {object} [input]
 * @param {object|null} [input.opposingBullpen]  The batter's opponent's
 *   team-bullpen-stats cache entry (see mlb-bullpen-stats.mjs schema).
 * @param {{ inningsPitched?: string|number|null, gamesStarted?: number|null }|null} [input.opposingStarter]
 *   The opposing team's starting pitcher stat line, used ONLY to estimate
 *   expected bullpen innings this game. Missing/null falls back to the
 *   shared role-based default (never throws -- see
 *   hasRealProjectedInningsData()/calculateProjectedInnings() in
 *   mlb-projected-innings.mjs).
 * @returns {object} bounded shadow result. `available: false` results
 *   always carry `bullpenHrShadowContribution: 0` (neutral/no-op).
 */
export function computeHrBullpenShadow({ opposingBullpen = null, opposingStarter = null } = {}) {
  const availability = classifyBullpenAvailability(opposingBullpen);

  const pitcherInput = {
    seasonIP: parseInningsPitchedString(opposingStarter?.inningsPitched),
    seasonGS: opposingStarter?.gamesStarted ?? null,
  };
  const hasRealStarterData = hasRealProjectedInningsData(pitcherInput);
  const starterProjectedIp = calculateProjectedInnings(pitcherInput);
  const projectedBullpenInnings = clamp(GAME_INNINGS - starterProjectedIp, 0, GAME_INNINGS);
  const exposureFraction = projectedBullpenInnings / GAME_INNINGS;

  const base = {
    liveModelVersion: MLB_HR_MODEL_VERSION,
    shadowExperimentVersion: MLB_HR_BULLPEN_SHADOW_VERSION,
    shadowComponent: "bullpen-hr-vulnerability",
    starterProjectedIp,
    starterProjectedIpSource: hasRealStarterData ? "real" : "fallback_missing_data",
    projectedBullpenInnings: Math.round(projectedBullpenInnings * 10) / 10,
    exposureFraction: Math.round(exposureFraction * 1000) / 1000,
  };

  if (!availability.available) {
    return {
      ...base,
      available: false,
      reason: availability.reason,
      dataQuality: opposingBullpen?.season?.dataQuality ?? null,
      freshnessStatus: opposingBullpen?.freshnessStatus ?? null,
      bullpenHr9: null,
      bullpenVulnerabilityScore: null,
      // Neutral/no-op per Phase 2.4 requirement: missing data must never
      // move the shadow contribution off exactly 0.
      bullpenHrShadowContribution: 0,
    };
  }

  const bullpenHr9 = opposingBullpen.season.seasonBullpenHr9;
  const vulnerabilityScore = bullpenHr9VulnerabilityScore(bullpenHr9);
  // Deviation from the neutral midpoint (50) on the [15, 88] score scale,
  // normalized to [-1, 1] against the wider side of that range (38),
  // then scaled by exposure and bounded to +/-MAX_HR_BULLPEN_CONTRIBUTION.
  const deviation = vulnerabilityScore == null ? 0 : vulnerabilityScore - 50;
  const rawContribution = (deviation / 38) * MAX_HR_BULLPEN_CONTRIBUTION * exposureFraction;
  const contribution = clamp(rawContribution, -MAX_HR_BULLPEN_CONTRIBUTION, MAX_HR_BULLPEN_CONTRIBUTION);

  return {
    ...base,
    available: true,
    reason: "ok",
    dataQuality: opposingBullpen.season.dataQuality,
    freshnessStatus: opposingBullpen.freshnessStatus ?? null,
    bullpenHr9,
    bullpenVulnerabilityScore: vulnerabilityScore,
    bullpenHrShadowContribution: Math.round(contribution * 100) / 100,
  };
}
