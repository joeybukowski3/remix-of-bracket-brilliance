/**
 * mlb-ml-projected-ip-shadow.mjs
 *
 * Phase 2.1 -- Starter projected-innings scaling for Moneyline (SHADOW ONLY).
 *
 * Computes a shadow Moneyline result that scales the live "Pitcher
 * Quality" component's weight (LIVE_EDGE_WEIGHTS.pitcher = 0.30) down for
 * a team whose starter is projected for a short outing (opener, tandem
 * starter, early hook), and redistributes the freed weight proportionally
 * across that SAME team's other four live components (Matchup Edge,
 * Lineup Offense, Recent Form, Season Quality). This never touches the
 * live computeModelEdgeCore() result -- it reuses the identical
 * component-scoring math via computeModelEdgeComponents() (see
 * mlb-ml-edge-core.mjs) so there is exactly one implementation of the
 * underlying Pitcher/Matchup/Offense/Form/Season scoring formulas.
 *
 * NEVER read by any live scoring path. NEVER displayed publicly. Output
 * of this module is for shadow archiving / comparison only (later
 * commits), gated behind ENABLE_ML_PROJECTED_IP_SHADOW.
 *
 * Weight-transfer design (approved 2026-07-02; bullpen routing added in
 * the Phase 2.4 bullpen-shadow-integration commit):
 *   - Weight freed by a short-outing starter (ipFactor < 1.0) now routes
 *     to bullpen FIRST (see mlb-ml-bullpen-shadow.mjs), not to the other
 *     four live components -- this is what this file's own prior header
 *     note anticipated ("a later commit will route freed weight there
 *     instead -- that change is isolated to this file"). A team's
 *     bullpen also gets a small conservative BASE weight
 *     (BULLPEN_BASE_WEIGHT, ~8%) even when its starter goes deep,
 *     carved proportionally from the other four components.
 *   - If a team's bullpen data is missing, stale, or low-quality
 *     (see classifyBullpenAvailability()), bullpen weight is exactly 0
 *     for that team and behavior falls back EXACTLY to the pre-bullpen
 *     formula: freed pitcher weight redistributes proportionally across
 *     the other four live components, unchanged from before this commit.
 *   - Weight scaling is computed INDEPENDENTLY per team (away and home
 *     each normalize to 1.0 on their own), so one team's opener -- or one
 *     team's missing bullpen data -- does not affect the other team's
 *     weighting.
 */

import { computeModelEdgeComponents, LIVE_EDGE_WEIGHTS, getEdgeTierKeyCore } from "./mlb-ml-edge-core.mjs";
import {
  classifyPitcherRole,
  calculateProjectedInnings,
  hasRealProjectedInningsData,
  parseInningsPitchedString,
} from "./mlb-projected-innings.mjs";
import { computeBullpenQualityScore, buildBullpenAwareShadowWeights } from "./mlb-ml-bullpen-shadow.mjs";
import { MLB_ML_MODEL_VERSION, MLB_ML_PHASE2_SHADOW_VERSION } from "./mlb-ml-model-version.mjs";

/**
 * Reference full-workload start length. A starter projected at or above
 * this many innings gets the full live Pitcher Quality weight; below it,
 * weight scales down toward MIN_IP_WEIGHT_FACTOR.
 */
export const FULL_START_IP = 6.0;

/**
 * Floor on how much of the live Pitcher Quality weight an extremely short
 * projected outing (e.g. a true opener) can lose. Even a 1-inning opener
 * still carries some signal (the pitcher's rate stats aren't meaningless),
 * so weight is scaled down, never to zero.
 */
export const MIN_IP_WEIGHT_FACTOR = 0.5;

const OTHER_LIVE_WEIGHT_KEYS = ["matchup", "offense", "form", "season"];
const OTHER_LIVE_WEIGHT_SUM = OTHER_LIVE_WEIGHT_KEYS.reduce((sum, k) => sum + LIVE_EDGE_WEIGHTS[k], 0);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {{ inningsPitched: string|number|null, gamesStarted: number|null }} starter
 * @returns {{
 *   pitcherInput: { seasonIP: number|null, seasonGS: number|null },
 *   projectedIp: number,
 *   role: "starter"|"reliever",
 *   hasRealData: boolean,
 *   dataQuality: "real"|"fallback_missing_data",
 *   ipFactor: number,
 * }}
 */
function analyzeStarter(starter) {
  const pitcherInput = {
    seasonIP: parseInningsPitchedString(starter?.inningsPitched),
    seasonGS: starter?.gamesStarted ?? null,
  };
  const hasRealData = hasRealProjectedInningsData(pitcherInput);
  const projectedIp = calculateProjectedInnings(pitcherInput);
  const role = classifyPitcherRole(pitcherInput);

  // Per Phase 2.1 requirement: "Missing projected-IP data must fall back
  // to the current live weighting behavior." Only scale the weight when
  // we have REAL season IP/GS data behind the projection -- a role-based
  // default (5.5 starter / 1.5 reliever fallback) is not a confirmed
  // short outing, so it must not shrink the live weight.
  const ipFactor = hasRealData ? clamp(projectedIp / FULL_START_IP, MIN_IP_WEIGHT_FACTOR, 1.0) : 1.0;

  return {
    pitcherInput,
    projectedIp,
    role,
    hasRealData,
    dataQuality: hasRealData ? "real" : "fallback_missing_data",
    ipFactor,
  };
}

/**
 * Builds one team's independently-normalized, bullpen-aware shadow weight
 * set from its ipFactor and bullpen availability/quality. Always sums to
 * exactly 1.0. Thin wrapper around buildBullpenAwareShadowWeights() (see
 * mlb-ml-bullpen-shadow.mjs) that supplies this file's own live-weight
 * constants -- the actual carving/capping math lives there so it can be
 * unit-tested independently of this file's starter-analysis plumbing.
 *
 * @param {number} ipFactor
 * @param {{ available: boolean, qualityScore: number|null }} bullpenAnalysis
 * @returns {{
 *   weights: { pitcher: number, matchup: number, offense: number, form: number, season: number, bullpen: number },
 *   bullpenBaseWeight: number, bullpenTransferredWeight: number, bullpenEffectiveWeight: number,
 * }}
 */
function buildShadowWeights(ipFactor, bullpenAnalysis) {
  return buildBullpenAwareShadowWeights({
    pitcherWeight: LIVE_EDGE_WEIGHTS.pitcher * ipFactor,
    livePitcherWeight: LIVE_EDGE_WEIGHTS.pitcher,
    bullpenAnalysis,
    liveWeights: LIVE_EDGE_WEIGHTS,
    otherKeys: OTHER_LIVE_WEIGHT_KEYS,
    otherSum: OTHER_LIVE_WEIGHT_SUM,
  });
}

function weightedTotal(components, weights) {
  return (
    components.pit * weights.pitcher +
    components.match * weights.matchup +
    components.off * weights.offense +
    components.form * weights.form +
    components.szn * weights.season +
    // qualityScore is null when bullpen is unavailable, but weights.bullpen
    // is exactly 0 in that case, so the null-guard below never affects the
    // total -- it only avoids `null * 0` producing 0 via coercion surprises.
    (components.bp ?? 0) * (weights.bullpen ?? 0)
  );
}

/**
 * @param {object} detail  Same shape passed to computeModelEdgeCore(detail)
 *   in mlb-ml-edge-core.mjs, with starters.{away,home}.gamesStarted also
 *   populated (see mlb-ml-detail-fetch.mjs Phase 2 addition). If
 *   gamesStarted is absent, this degrades gracefully to the missing-data
 *   fallback (ipFactor = 1.0, i.e. identical to live weighting) for that
 *   side -- it does not throw.
 * @param {object} [options]
 * @param {{ away?: object|null, home?: object|null }} [options.bullpen]
 *   Optional per-team bullpen-stats cache entries (see
 *   mlb-bullpen-stats.mjs schema). Omitted entirely (the default) is
 *   IDENTICAL in every output byte to calling this function before the
 *   Phase 2.4 bullpen-shadow-integration commit -- bullpen is treated as
 *   unavailable for both teams and freed pitcher weight redistributes to
 *   the other four live components exactly as before. A caller only
 *   opts in to bullpen weighting by explicitly passing bullpen data (the
 *   Phase 2 composition layer gates this behind ENABLE_ML_BULLPEN_SHADOW,
 *   see mlb-ml-phase2-shadow.mjs).
 * @returns {object} shadow result, structurally similar to
 *   computeModelEdgeCore()'s return shape but under shadow-specific field
 *   names so it can never be confused with a live pick.
 */
export function computeMlProjectedIpShadow(detail, options = {}) {
  const { game, starters } = detail;
  const { bullpen = {} } = options;
  const components = computeModelEdgeComponents(detail);

  const away = analyzeStarter(starters.away);
  const home = analyzeStarter(starters.home);

  const awayBullpenAnalysis = computeBullpenQualityScore(bullpen.away ?? null);
  const homeBullpenAnalysis = computeBullpenQualityScore(bullpen.home ?? null);

  const awayBullpenWeighting = buildShadowWeights(away.ipFactor, awayBullpenAnalysis);
  const homeBullpenWeighting = buildShadowWeights(home.ipFactor, homeBullpenAnalysis);
  const awayWeights = awayBullpenWeighting.weights;
  const homeWeights = homeBullpenWeighting.weights;

  const awayTotalShadow = weightedTotal(
    {
      pit: components.awayPit,
      match: components.awayMatch,
      off: components.awayOff,
      form: components.awayForm,
      szn: components.awaySzn,
      bp: awayBullpenAnalysis.qualityScore,
    },
    awayWeights,
  );
  const homeTotalShadow = weightedTotal(
    {
      pit: components.homePit,
      match: components.homeMatch,
      off: components.homeOff,
      form: components.homeForm,
      szn: components.homeSzn,
      bp: homeBullpenAnalysis.qualityScore,
    },
    homeWeights,
  );

  const diff = awayTotalShadow - homeTotalShadow;
  const absDiff = Math.abs(diff);
  // Same push threshold as the live formula (see computeModelEdgeCore),
  // so shadow and live picks are directly comparable.
  const pick = absDiff < 2.5 ? "push" : diff > 0 ? "away" : "home";
  const confidence = pick === "push" ? 50 : Math.round(Math.min(82, 52 + (absDiff / 5) * 4));

  const awayBullpenContribution =
    Math.round((awayBullpenAnalysis.qualityScore ?? 0) * awayBullpenWeighting.bullpenEffectiveWeight * 100) / 100;
  const homeBullpenContribution =
    Math.round((homeBullpenAnalysis.qualityScore ?? 0) * homeBullpenWeighting.bullpenEffectiveWeight * 100) / 100;

  return {
    // -- identification / versioning (never confused with a live pick) --
    liveModelVersion: MLB_ML_MODEL_VERSION,
    shadowExperimentVersion: MLB_ML_PHASE2_SHADOW_VERSION,
    shadowComponent: "projected-ip",

    // -- projected-IP inputs --
    awayStarterProjectedIp: away.projectedIp,
    homeStarterProjectedIp: home.projectedIp,
    awayStarterProjectedIpSource: away.dataQuality,
    homeStarterProjectedIpSource: home.dataQuality,
    awayStarterRoleShadow: away.role,
    homeStarterRoleShadow: home.role,
    projectedIpDataQuality: {
      away: away.dataQuality,
      home: home.dataQuality,
      bothReal: away.hasRealData && home.hasRealData,
    },

    // -- weight transfer --
    awayPitcherEffectiveWeightShadow: awayWeights.pitcher,
    homePitcherEffectiveWeightShadow: homeWeights.pitcher,
    awayWeightsShadow: awayWeights,
    homeWeightsShadow: homeWeights,

    // -- bullpen shadow component (availability, freshness, data quality, contribution) --
    awayBullpenShadow: {
      available: awayBullpenAnalysis.available,
      reason: awayBullpenAnalysis.reason,
      dataQuality: awayBullpenAnalysis.dataQuality,
      freshnessStatus: awayBullpenAnalysis.freshnessStatus,
      fatigueTier: awayBullpenAnalysis.fatigueTier,
      qualityScore: awayBullpenAnalysis.qualityScore,
      baseWeight: awayBullpenWeighting.bullpenBaseWeight,
      transferredWeight: awayBullpenWeighting.bullpenTransferredWeight,
      effectiveWeight: awayBullpenWeighting.bullpenEffectiveWeight,
      contribution: awayBullpenContribution,
    },
    homeBullpenShadow: {
      available: homeBullpenAnalysis.available,
      reason: homeBullpenAnalysis.reason,
      dataQuality: homeBullpenAnalysis.dataQuality,
      freshnessStatus: homeBullpenAnalysis.freshnessStatus,
      fatigueTier: homeBullpenAnalysis.fatigueTier,
      qualityScore: homeBullpenAnalysis.qualityScore,
      baseWeight: homeBullpenWeighting.bullpenBaseWeight,
      transferredWeight: homeBullpenWeighting.bullpenTransferredWeight,
      effectiveWeight: homeBullpenWeighting.bullpenEffectiveWeight,
      contribution: homeBullpenContribution,
    },
    bullpenShadowDataQuality: {
      away: awayBullpenAnalysis.dataQuality,
      home: homeBullpenAnalysis.dataQuality,
      bothAvailable: awayBullpenAnalysis.available && homeBullpenAnalysis.available,
    },

    // -- shadow result --
    projectedIpShadowPick: pick,
    projectedIpShadowDifferential: Math.round(absDiff),
    projectedIpShadowConfidence: confidence,
    projectedIpShadowTier: getEdgeTierKeyCore(confidence),
    awayAbbr: game.away.abbreviation,
    homeAbbr: game.home.abbreviation,
  };
}
