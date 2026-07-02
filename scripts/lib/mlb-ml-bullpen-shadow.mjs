/**
 * mlb-ml-bullpen-shadow.mjs
 *
 * Phase 2.3b -- Bullpen quality/fatigue scoring + weight-transfer helpers
 * for the Moneyline projected-IP shadow (SHADOW ONLY).
 *
 * Pure helper module. All wiring into computeMlProjectedIpShadow() lives in
 * mlb-ml-projected-ip-shadow.mjs, per that file's own header note ("Once
 * the bullpen shadow signal lands, a later commit will route freed weight
 * there instead -- that change is isolated to this file"). This module
 * only supplies the two pieces that file needs: (1) a bounded per-team
 * bullpen quality score derived from the Phase 2.3 bullpen data pipeline
 * (mlb-bullpen-stats.mjs schema), and (2) the bounded weight-carving math
 * that decides how much of the live Pitcher Quality weight (and how much
 * of a small proportional carve from the other four live components)
 * bullpen gets.
 *
 * NEVER read by any live scoring path. NEVER displayed publicly.
 *
 * Weight design (approved 2026-07-02):
 *   - BULLPEN_BASE_WEIGHT (0.08): a conservative baseline bullpen weight,
 *     carved PROPORTIONALLY out of the four non-pitcher live components
 *     (matchup, offense, form, season) whenever a team's bullpen data is
 *     available and of adequate/high quality. This baseline applies even
 *     to a workhorse starter -- a good/bad bullpen still matters some.
 *   - Starter weight FREED by a short projected outing (see
 *     mlb-ml-projected-ip-shadow.mjs's ipFactor) is added on TOP of the
 *     base weight, dynamically, instead of being redistributed to the
 *     other four components as it was pre-bullpen. This is what prevents
 *     double-counting: the same freed weight can only go to ONE place
 *     (bullpen), never both bullpen AND the other four components.
 *   - BULLPEN_MAX_WEIGHT (0.20): hard ceiling on the effective bullpen
 *     weight, so an extreme opener cannot make bullpen data dominate the
 *     whole model. Any freed weight beyond the cap overflows back to the
 *     other four components proportionally (never dropped -- total always
 *     normalizes to exactly 1.0).
 *   - Missing, stale, or low-quality (dataQuality "insufficient"/"low")
 *     bullpen data makes bullpen UNAVAILABLE for that team: weight
 *     carving is skipped entirely and the ORIGINAL pre-bullpen behavior
 *     (freed weight redistributed across the other four components,
 *     bullpen weight = 0) is used instead. Computed independently per
 *     team, matching the existing per-team ipFactor normalization.
 */

/** Baseline bullpen weight, carved from the other four live components when bullpen data is available. */
export const BULLPEN_BASE_WEIGHT = 0.08;

/** Hard ceiling on the effective (base + transferred) bullpen weight. */
export const BULLPEN_MAX_WEIGHT = 0.2;

/** Bullpen data-quality tiers (from mlb-bullpen-season-aggregate.mjs) usable for shadow scoring. */
const USABLE_DATA_QUALITY_TIERS = new Set(["adequate", "high"]);

/** Bounded fatigue penalty (score points) applied per bullpenFatigueTier (mlb-bullpen-workload.mjs). */
const FATIGUE_PENALTY = { fresh: 0, normal: 4, tired: 10 };

function clamp(v, lo = 15, hi = 88) {
  return Math.max(lo, Math.min(hi, v));
}

// Same normalization style as eraScore/hr9Score/etc. in mlb-ml-edge-core.mjs
// (clamp(15, 88) around a league-average pivot), so bullpen quality scores
// live on the same scale as the other live/shadow components.
function bullpenEraScore(era) {
  if (era == null) return 50;
  const avg = 4.12;
  return era <= avg ? clamp(50 + ((avg - era) / 2.12) * 40) : clamp(50 - ((era - avg) / 2.88) * 38);
}

function bullpenHr9Score(hr9) {
  if (hr9 == null) return 50;
  const avg = 1.18;
  return hr9 <= avg ? clamp(50 + ((avg - hr9) / 0.68) * 28) : clamp(50 - ((hr9 - avg) / 0.82) * 33);
}

// League-average bullpen K/BB is documented as an approximation (~2.4),
// since no canonical reference table exists elsewhere in this repo yet.
function bullpenKbbScore(kbb) {
  if (kbb == null) return 50;
  const avg = 2.4;
  return kbb >= avg ? clamp(50 + ((kbb - avg) / 1.0) * 30) : clamp(50 - ((avg - kbb) / 1.0) * 30);
}

function bullpenWhipScore(whip) {
  if (whip == null) return 50;
  const avg = 1.32;
  return whip <= avg ? clamp(50 + ((avg - whip) / 0.22) * 30) : clamp(50 - ((whip - avg) / 0.3) * 30);
}

/**
 * @param {object|null|undefined} bullpenEntry  A team-bullpen-stats cache
 *   entry (see mlb-bullpen-stats.mjs / mlb-bullpen-cache.mjs schema):
 *   { season: { seasonBullpenEra, seasonBullpenHr9, seasonBullpenKbb,
 *   seasonBullpenWhip, dataQuality, ... }, workload: { bullpenFatigueTier,
 *   ... }, freshnessStatus }.
 * @returns {{ available: boolean, reason: string }}
 */
export function classifyBullpenAvailability(bullpenEntry) {
  if (!bullpenEntry) return { available: false, reason: "missing" };
  if (bullpenEntry.freshnessStatus === "missing") return { available: false, reason: "missing" };
  // Stale-fallback data is explicitly excluded per Phase 2.4 requirement:
  // "Missing, stale, or low-quality bullpen data must fall back."
  if (bullpenEntry.freshnessStatus === "stale-fallback") return { available: false, reason: "stale" };
  const season = bullpenEntry.season;
  if (!season) return { available: false, reason: "missing_season_section" };
  if (!USABLE_DATA_QUALITY_TIERS.has(season.dataQuality)) return { available: false, reason: "low_coverage" };
  return { available: true, reason: "ok" };
}

/**
 * Computes a bounded [15, 88] bullpen quality score (higher = better
 * bullpen) from season rate stats, with a bounded fatigue penalty applied
 * on top. Returns an unavailable result (qualityScore: null) when the
 * data isn't usable -- callers must check `available` before using
 * qualityScore, never assume a numeric fallback.
 *
 * @param {object|null|undefined} bullpenEntry
 * @returns {{
 *   available: boolean, reason: string,
 *   dataQuality: string|null, freshnessStatus: string|null,
 *   fatigueTier: "fresh"|"normal"|"tired"|null,
 *   qualityScore: number|null,
 * }}
 */
export function computeBullpenQualityScore(bullpenEntry) {
  const availability = classifyBullpenAvailability(bullpenEntry);
  const season = bullpenEntry?.season ?? null;
  const workload = bullpenEntry?.workload ?? null;
  const fatigueTier = workload?.bullpenFatigueTier ?? null;

  if (!availability.available) {
    return {
      available: false,
      reason: availability.reason,
      dataQuality: season?.dataQuality ?? null,
      freshnessStatus: bullpenEntry?.freshnessStatus ?? null,
      fatigueTier,
      qualityScore: null,
    };
  }

  const base =
    bullpenEraScore(season.seasonBullpenEra) * 0.35 +
    bullpenHr9Score(season.seasonBullpenHr9) * 0.3 +
    bullpenKbbScore(season.seasonBullpenKbb) * 0.2 +
    bullpenWhipScore(season.seasonBullpenWhip) * 0.15;

  // Missing workload data (e.g. a fresh season section refreshed
  // independently of workload) is treated as neutral ("normal", 0
  // penalty) rather than gating the whole component -- workload is a
  // secondary modifier on top of season quality, not a hard requirement.
  const effectiveFatigueTier = fatigueTier ?? "normal";
  const penalty = FATIGUE_PENALTY[effectiveFatigueTier] ?? 0;
  const qualityScore = clamp(base - penalty, 15, 88);

  return {
    available: true,
    reason: "ok",
    dataQuality: season.dataQuality,
    freshnessStatus: bullpenEntry.freshnessStatus ?? null,
    fatigueTier: effectiveFatigueTier,
    qualityScore,
  };
}

/**
 * Builds one team's bounded, bullpen-aware shadow weight set. Always sums
 * to exactly 1.0 (pitcher weight is provided pre-scaled by the caller's
 * ipFactor; this function only decides how the freed remainder splits
 * between bullpen and the other four live components).
 *
 * @param {object} params
 * @param {number} params.pitcherWeight  Already ipFactor-scaled pitcher weight (0.30 * ipFactor).
 * @param {number} params.livePitcherWeight  The UN-scaled live pitcher weight (LIVE_EDGE_WEIGHTS.pitcher).
 * @param {{ available: boolean, qualityScore: number|null }} params.bullpenAnalysis  From computeBullpenQualityScore().
 * @param {Record<string, number>} params.liveWeights  Full LIVE_EDGE_WEIGHTS map.
 * @param {string[]} params.otherKeys  The four non-pitcher weight keys (matchup/offense/form/season).
 * @param {number} params.otherSum  Sum of liveWeights[otherKeys] (0.70 in the live formula).
 * @returns {{
 *   weights: Record<string, number>,
 *   bullpenBaseWeight: number,
 *   bullpenTransferredWeight: number,
 *   bullpenEffectiveWeight: number,
 * }}
 */
export function buildBullpenAwareShadowWeights({ pitcherWeight, livePitcherWeight, bullpenAnalysis, liveWeights, otherKeys, otherSum }) {
  const freedFromPitcher = livePitcherWeight - pitcherWeight;

  if (!bullpenAnalysis?.available) {
    // Original pre-bullpen behavior, byte-for-byte: freed weight
    // redistributes proportionally across the other four components,
    // bullpen weight is exactly 0.
    const weights = { pitcher: pitcherWeight, bullpen: 0 };
    for (const key of otherKeys) {
      weights[key] = liveWeights[key] + freedFromPitcher * (liveWeights[key] / otherSum);
    }
    return { weights, bullpenBaseWeight: 0, bullpenTransferredWeight: 0, bullpenEffectiveWeight: 0 };
  }

  const rawBullpenWeight = BULLPEN_BASE_WEIGHT + freedFromPitcher;
  const bullpenEffectiveWeight = Math.min(rawBullpenWeight, BULLPEN_MAX_WEIGHT);
  // Overflow beyond the cap is never dropped -- it flows back to the
  // other four components proportionally, same as freed weight would
  // have pre-bullpen, which is what keeps normalization exact at 1.0
  // regardless of whether the cap engages.
  const overflow = rawBullpenWeight - bullpenEffectiveWeight;
  const othersBaseSum = otherSum - BULLPEN_BASE_WEIGHT;

  const weights = { pitcher: pitcherWeight, bullpen: bullpenEffectiveWeight };
  for (const key of otherKeys) {
    const carvedBase = liveWeights[key] - BULLPEN_BASE_WEIGHT * (liveWeights[key] / otherSum);
    weights[key] = carvedBase + overflow * (liveWeights[key] / otherSum);
  }

  return {
    weights,
    bullpenBaseWeight: BULLPEN_BASE_WEIGHT,
    bullpenTransferredWeight: bullpenEffectiveWeight - BULLPEN_BASE_WEIGHT,
    bullpenEffectiveWeight,
  };
}
