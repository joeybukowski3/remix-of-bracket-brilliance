/**
 * mlb-k-projection-v4-core.mjs
 *
 * V4 strikeout projection. NEW module: V2 (src/lib/mlb/kProjectionV2.ts) and
 * V3 (scripts/lib/mlb-k-projection-v3.mjs, scripts/mlb-k/*-v3*.mjs) are
 * untouched and remain independently reproducible.
 *
 * ARCHITECTURE -- two separate questions, then a product
 * -----------------------------------------------------
 *      projectedKs = projectedIP x projectedKPerIP
 *
 * V2 and V3 both projected a K RATE PER BATTER FACED and multiplied by a
 * projected batters-faced count. That made workload and skill hard to
 * disentangle and is how V3's workload error propagated straight into the
 * strikeout number. V4 keeps them apart, gives each its own matchup
 * adjustment, and reports every intermediate term.
 *
 * WHAT CHANGES VERSUS V3
 * ----------------------
 *   1. Season is the anchor again. V3 weighted recent workload 0.70
 *      (0.45 last-10 + 0.25 last-5) against 0.30 season, which for a
 *      September cohort systematically projected above each pitcher's own
 *      season average. V4 inverts that to 0.55 season / 0.30 last-10 /
 *      0.15 last-5, and additionally CLAMPS the blend to within
 *      `recentFormIPCap` of the season figure so recent form can move the
 *      projection but never replace it.
 *   2. Opponent effects are relative and self-centering. See
 *      mlb-k-opponent-starter-context.mjs. Summed league-wide these factors
 *      average ~1.00, so they redistribute rather than inflate.
 *   3. Strikeouts are projected per INNING, adjusted by an opponent factor
 *      that is itself a per-inning rate factor, so innings suppression is
 *      never counted twice.
 *   4. The three correlated opponent strikeout signals (relative starter K
 *      suppression, K% versus this handedness, recent team K environment) are
 *      combined into ONE bounded deviation instead of being multiplied
 *      together as three independent factors.
 *
 * NO MARKET INPUT. Nothing in this module reads kLine, oddsOver, oddsUnder or
 * any Vegas quantity; an enforced test passes a line in and asserts the output
 * is unchanged.
 *
 * DETERMINISTIC. No clock, no randomness, no I/O. Same inputs -> same output.
 */

export const K_PROJECTION_V4_MODEL_VERSION = "mlb-k-projection-v4";

/**
 * Every tunable, in one frozen object.
 *
 * Innings weights (0.55 / 0.30 / 0.15) put the season figure back in charge.
 * `recentFormIPCap` / `recentFormKCap` bound how far the recent blend may
 * pull away from season regardless of those weights.
 *
 * League priors are beta-style. `leagueIPPriorStarts: 3` means a pitcher with
 * 17 starts keeps 17/20 = 0.85 of his own signal. `leagueKPriorInnings: 30`
 * mirrors the validated V3 shrinkage prior (125 batters faced is about 30
 * innings), so V4 does not quietly change how hard K skill is regressed.
 *
 * wRC+ scales are deliberately small: the opponent starter factors already
 * carry most of the offensive-quality signal, and stacking a second large
 * offense term on top would double count it.
 */
export const V4_DEFAULTS = Object.freeze({
  // ---- innings ----
  ipSeasonWeight: 0.55,
  ipLast10Weight: 0.30,
  ipLast5Weight: 0.15,
  recentFormIPCap: 0.60,
  leagueIPPriorStarts: 3,
  ipClamp: [2.5, 7.5],

  // ---- strikeouts per inning ----
  kSeasonWeight: 0.55,
  kLast10Weight: 0.30,
  kLast5Weight: 0.15,
  recentFormKCap: 0.15,
  leagueKPriorInnings: 30,
  kPerIpClamp: [0.35, 1.85],

  /**
   * League K/IP calibration.
   *
   * Every pregame strikeout-rate input available in this repo sits about
   * +0.022 K/IP above what starters actually realize. Measured on the graded
   * archive (n=944, aggregate actual K/IP 0.9099):
   *
   *   venue-split season K/IP        0.9378   (+0.0263)
   *   pregame season K/9 / 9         0.9323   (+0.0217)
   *   pregame recent K/9 / 9         0.9294   (+0.0189)
   *   V2's own implied K/IP          0.9349   (+0.0243)
   *
   * This is NOT a V4 defect -- it is a property of the shared inputs. V2's
   * overall signed error looks healthy (+0.041) only because its workload is
   * too LOW (IP signed -0.096, BF signed -0.467), which cancels the rate bias.
   * V3 and V4 corrected the innings and thereby exposed it.
   *
   * A season rate is computed over innings a pitcher completed; a projected
   * start includes outings where he is removed early having missed few bats,
   * so the unconditional rate over-predicts the next start's rate.
   *
   * The constant is FIT ON THE DEVELOPMENT WINDOW ONLY (2026-07-23..2026-08-17,
   * 609 starts) as sum(actual K) / sum(projected IP x projected K/IP) with
   * calibration disabled, and the 2026-08-18..2026-09-05 window is reported
   * but never used to choose it. Re-derive with:
   *   node scripts/research/mlb-k-v4-backtest.mjs --calibrate
   */
  kPerIpCalibration: 0.9727,

  // ---- opponent strikeout environment (ONE combined, bounded term) ----
  opponentStarterKWeight: 0.60,
  handednessKWeight: 0.25,
  recentTeamKWeight: 0.15,
  maxOpponentKEnvironmentAdjustment: 0.15,

  // ---- opponent offence (wRC+), small on purpose ----
  wrcIpScale: 0.03,
  wrcKScale: 0.02,
  wrcRecentWeight: 0.40,
  wrcSeasonWeight: 0.60,

  // ---- league fallbacks, used only when slate context is absent ----
  leagueIPPerStartFallback: 5.0,
  leagueKPerIPFallback: 0.94,
  leagueKRateFallback: 0.2187,
  leagueBFPerIPFallback: 4.3,
});

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const round = (value, digits = 4) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

/**
 * Weighted blend that renormalizes over whichever components are present, so
 * a missing last-10 window redistributes its weight rather than silently
 * contributing zero.
 */
function blend(parts) {
  let weighted = 0;
  let totalWeight = 0;
  const used = [];
  for (const [label, value, weight] of parts) {
    const v = finite(value);
    if (v === null || weight <= 0) continue;
    weighted += v * weight;
    totalWeight += weight;
    used.push(label);
  }
  if (totalWeight <= 0) return { value: null, used, coverage: 0 };
  return { value: weighted / totalWeight, used, coverage: totalWeight };
}

/**
 * Opponent offensive strength as a signed index in [-1, 1] from wRC+ RANKS
 * (1 = best offence). Positive means a strong offence, which suppresses both
 * innings and strikeout rate. Ranks are used rather than raw wRC+ because the
 * rank scale is stable across the season and across artifact revisions.
 */
export function offensiveStrengthIndex(rankRecent, rankSeason, config = V4_DEFAULTS) {
  const toIndex = (rank) => {
    const r = finite(rank);
    if (r === null || r < 1 || r > 30) return null;
    return clamp((15.5 - r) / 14.5, -1, 1);
  };
  const recent = toIndex(rankRecent);
  const season = toIndex(rankSeason);
  const parts = blend([
    ["recent", recent, config.wrcRecentWeight],
    ["season", season, config.wrcSeasonWeight],
  ]);
  return parts.value;
}

/**
 * PART 1 -- projected innings.
 *
 *   neutral   = 0.55*season + 0.30*last10 + 0.15*last5   (renormalized)
 *   neutral   = clamp(neutral, season +/- 0.60)          (recent may move, not replace)
 *   anchored  = trust*neutral + (1-trust)*leagueIP,  trust = GS/(GS+3)
 *   final     = clamp(anchored * opponentIPFactor * wrcIPMultiplier, 2.5, 7.5)
 */
export function projectInningsV4(input = {}, config = V4_DEFAULTS) {
  const cfg = { ...V4_DEFAULTS, ...config };
  const warnings = [];

  const seasonIP = finite(input.seasonIPPerStart);
  const last10IP = finite(input.last10IPPerStart);
  const last5IP = finite(input.last5IPPerStart);
  const leagueIP = finite(input.leagueIPPerStart) ?? cfg.leagueIPPerStartFallback;
  const gamesStarted = finite(input.seasonGamesStarted) ?? 0;

  const blended = blend([
    ["season", seasonIP, cfg.ipSeasonWeight],
    ["last10", last10IP, cfg.ipLast10Weight],
    ["last5", last5IP, cfg.ipLast5Weight],
  ]);
  if (blended.value === null) {
    return {
      seasonIPPerStart: seasonIP,
      last10IPPerStart: last10IP,
      last5IPPerStart: last5IP,
      neutralPitcherIP: null,
      recentFormIPAdjustment: null,
      leagueRegressedIP: null,
      opponentIPFactor: null,
      wrcIPMultiplier: null,
      finalProjectedIP: null,
      warnings: ["NO_INNINGS_HISTORY"],
    };
  }
  if (!blended.used.includes("season")) warnings.push("SEASON_IP_UNAVAILABLE");
  if (!blended.used.includes("last10")) warnings.push("LAST10_IP_UNAVAILABLE");

  // Recent form may move the projection, but never replace the season anchor.
  let neutral = blended.value;
  if (seasonIP !== null) {
    const capped = clamp(neutral, seasonIP - cfg.recentFormIPCap, seasonIP + cfg.recentFormIPCap);
    if (capped !== neutral) warnings.push("RECENT_FORM_IP_CAPPED");
    neutral = capped;
  }
  const recentFormIPAdjustment = seasonIP === null ? null : neutral - seasonIP;

  const trust = gamesStarted > 0 ? gamesStarted / (gamesStarted + cfg.leagueIPPriorStarts) : 0;
  if (trust < 0.75) warnings.push("THIN_STARTER_SAMPLE");
  const leagueRegressedIP = trust * neutral + (1 - trust) * leagueIP;

  const opponentIPFactor = finite(input.opponentIPFactor) ?? 1;
  const strength = finite(input.offensiveStrengthIndex);
  const wrcIPMultiplier = strength === null ? 1 : 1 - cfg.wrcIpScale * strength;
  if (strength === null) warnings.push("OPPONENT_WRC_UNAVAILABLE");

  const raw = leagueRegressedIP * opponentIPFactor * wrcIPMultiplier;
  const finalProjectedIP = clamp(raw, cfg.ipClamp[0], cfg.ipClamp[1]);
  if (finalProjectedIP !== raw) warnings.push("PROJECTED_IP_CLAMPED");

  return {
    seasonIPPerStart: round(seasonIP, 3),
    last10IPPerStart: round(last10IP, 3),
    last5IPPerStart: round(last5IP, 3),
    leagueIPPerStart: round(leagueIP, 3),
    seasonGamesStarted: gamesStarted,
    neutralPitcherIP: round(neutral, 4),
    recentFormIPAdjustment: round(recentFormIPAdjustment, 4),
    // Named distinctly from projectKPerInningV4's own trust field (below) --
    // projectStrikeoutsV4 merges this object with that one via
    // `{...innings, ...kPerInning}`, and both stages previously used the
    // same key `leagueTrust`, so the K-side value silently overwrote the
    // IP-side one in every DOWNSTREAM SERIALIZED reader (k-props-v2-
    // shadow.json's `v4.leagueTrust`, and the V4 backtest's own `kTrust`
    // diagnostic, which was only accidentally correct because of the spread
    // order). This never affected `finalProjectedIP`, `finalProjectedKPerIP`,
    // `projectedKs`, `confidence`, or `confidenceScore` -- those are all
    // computed from these LOCAL, unmerged `innings`/`kPerInning` objects
    // before the merge happens (see projectStrikeoutsV4 below), so the
    // collision was diagnostics-only. Fixed here rather than left as a trap
    // for the next reader of the merged object.
    workloadLeagueTrust: round(trust, 4),
    leagueRegressedIP: round(leagueRegressedIP, 4),
    opponentIPFactor: round(opponentIPFactor, 4),
    wrcIPMultiplier: round(wrcIPMultiplier, 4),
    finalProjectedIP: round(finalProjectedIP, 4),
    warnings,
  };
}

/**
 * PART 2 -- projected strikeouts per inning.
 *
 *   neutral   = 0.55*season + 0.30*last10 + 0.15*last5   (renormalized)
 *   neutral   = clamp(neutral, season +/- 0.15)
 *   anchored  = trust*neutral + (1-trust)*leagueKPerIP,  trust = IP/(IP+30)
 *
 *   environment = clamp(
 *       0.60*(opponentStarterKFactor - 1)
 *     + 0.25*(opponentKRateVsHand/leagueKRate - 1)
 *     + 0.15*(opponentRecentKRate  /leagueKRate - 1),
 *     -0.15, +0.15)
 *
 *   final     = clamp(anchored * (1 + environment) * wrcKMultiplier, 0.35, 1.85)
 *
 * The three opponent strikeout signals are heavily correlated, so they are
 * summed into ONE bounded deviation rather than multiplied as three
 * independent factors -- multiplying 0.88 x 0.84 x 0.84 would apply the same
 * underlying "this offence does not strike out" fact three times.
 */
export function projectKPerInningV4(input = {}, config = V4_DEFAULTS) {
  const cfg = { ...V4_DEFAULTS, ...config };
  const warnings = [];

  const seasonK = finite(input.seasonKPerIP);
  const last10K = finite(input.last10KPerIP);
  const last5K = finite(input.last5KPerIP);
  const leagueK = finite(input.leagueKPerIP) ?? cfg.leagueKPerIPFallback;
  const leagueKRate = finite(input.leagueKRate) ?? cfg.leagueKRateFallback;
  const seasonInnings = finite(input.seasonInnings) ?? 0;

  const blended = blend([
    ["season", seasonK, cfg.kSeasonWeight],
    ["last10", last10K, cfg.kLast10Weight],
    ["last5", last5K, cfg.kLast5Weight],
  ]);
  if (blended.value === null) {
    return {
      seasonKPerIP: seasonK,
      last10KPerIP: last10K,
      last5KPerIP: last5K,
      neutralPitcherKPerIP: null,
      finalProjectedKPerIP: null,
      warnings: ["NO_STRIKEOUT_HISTORY"],
    };
  }
  if (!blended.used.includes("season")) warnings.push("SEASON_K_UNAVAILABLE");

  let neutral = blended.value;
  if (seasonK !== null) {
    const capped = clamp(neutral, seasonK - cfg.recentFormKCap, seasonK + cfg.recentFormKCap);
    if (capped !== neutral) warnings.push("RECENT_FORM_K_CAPPED");
    neutral = capped;
  }
  const recentFormKAdjustment = seasonK === null ? null : neutral - seasonK;

  const trust = seasonInnings > 0 ? seasonInnings / (seasonInnings + cfg.leagueKPriorInnings) : 0;
  if (trust < 0.70) warnings.push("THIN_STRIKEOUT_SAMPLE");
  const leagueRegressedKPerIP = trust * neutral + (1 - trust) * leagueK;

  // ---- one combined, bounded opponent strikeout environment ----
  const opponentStarterKFactor = finite(input.opponentKRateFactor) ?? 1;
  const kRateVsHand = finite(input.opponentKRateVsHand);
  const recentTeamKRate = finite(input.opponentRecentKRate);

  const starterDeviation = opponentStarterKFactor - 1;
  const handDeviation = kRateVsHand !== null && leagueKRate > 0 ? kRateVsHand / leagueKRate - 1 : null;
  const recentDeviation = recentTeamKRate !== null && leagueKRate > 0 ? recentTeamKRate / leagueKRate - 1 : null;
  if (handDeviation === null) warnings.push("OPPONENT_HAND_K_RATE_UNAVAILABLE");
  if (recentDeviation === null) warnings.push("OPPONENT_RECENT_K_RATE_UNAVAILABLE");

  const environmentBlend = blend([
    ["starter", starterDeviation, cfg.opponentStarterKWeight],
    ["hand", handDeviation, cfg.handednessKWeight],
    ["recent", recentDeviation, cfg.recentTeamKWeight],
  ]);
  // blend() renormalizes, which would let a lone surviving signal speak at
  // full strength. Rescale by realized coverage so missing signals pull the
  // combined term toward neutral instead of amplifying what remains.
  const totalWeight = cfg.opponentStarterKWeight + cfg.handednessKWeight + cfg.recentTeamKWeight;
  const rawEnvironment = environmentBlend.value === null
    ? 0
    : environmentBlend.value * (environmentBlend.coverage / totalWeight);
  const environment = clamp(
    rawEnvironment,
    -cfg.maxOpponentKEnvironmentAdjustment,
    cfg.maxOpponentKEnvironmentAdjustment,
  );
  if (environment !== rawEnvironment) warnings.push("OPPONENT_K_ENVIRONMENT_CAPPED");

  const strength = finite(input.offensiveStrengthIndex);
  const wrcKMultiplier = strength === null ? 1 : 1 - cfg.wrcKScale * strength;

  const calibration = finite(cfg.kPerIpCalibration) ?? 1;
  const raw = leagueRegressedKPerIP * (1 + environment) * wrcKMultiplier * calibration;
  const finalProjectedKPerIP = clamp(raw, cfg.kPerIpClamp[0], cfg.kPerIpClamp[1]);
  if (finalProjectedKPerIP !== raw) warnings.push("PROJECTED_K_PER_IP_CLAMPED");

  return {
    seasonKPerIP: round(seasonK),
    last10KPerIP: round(last10K),
    last5KPerIP: round(last5K),
    leagueKPerIP: round(leagueK),
    seasonInnings: round(seasonInnings, 2),
    neutralPitcherKPerIP: round(neutral),
    recentFormKAdjustment: round(recentFormKAdjustment),
    // Distinct from projectInningsV4's own `workloadLeagueTrust` -- see the
    // comment there for why these must not share a key.
    kRateLeagueTrust: round(trust),
    leagueRegressedKPerIP: round(leagueRegressedKPerIP),
    opponentStarterKFactor: round(opponentStarterKFactor),
    opponentKRateVsHand: round(kRateVsHand),
    opponentRecentKRate: round(recentTeamKRate),
    handednessDeviation: round(handDeviation),
    recentTeamKDeviation: round(recentDeviation),
    rawOpponentKEnvironment: round(rawEnvironment),
    opponentKEnvironment: round(environment),
    wrcKMultiplier: round(wrcKMultiplier),
    kPerIpCalibration: round(calibration),
    finalProjectedKPerIP: round(finalProjectedKPerIP),
    warnings,
  };
}

/**
 * Full V4 projection: innings x strikeouts-per-inning.
 *
 * Batters faced is reported for comparability with V2/V3 and for the
 * downstream eligibility rules that read it, but it is an OUTPUT here, not an
 * input to the strikeout number.
 */
export function projectStrikeoutsV4(input = {}, config = V4_DEFAULTS) {
  const cfg = { ...V4_DEFAULTS, ...config };
  const innings = projectInningsV4(input, cfg);
  const kPerInning = projectKPerInningV4(input, cfg);

  const ip = finite(innings.finalProjectedIP);
  const kpi = finite(kPerInning.finalProjectedKPerIP);
  const projectedKs = ip === null || kpi === null ? null : ip * kpi;

  const bfPerIP = finite(input.bfPerIP) ?? cfg.leagueBFPerIPFallback;
  const projectedBattersFaced = ip === null ? null : ip * bfPerIP;

  const warnings = [...innings.warnings, ...kPerInning.warnings, ...(input.contextWarnings ?? [])];

  // Confidence mirrors the two league-regression trusts and the opponent
  // sample confidence, so a thin pitcher or a thin opponent sample is visible
  // rather than implied.
  const confidenceParts = [
    finite(innings.workloadLeagueTrust) ?? 0,
    finite(kPerInning.kRateLeagueTrust) ?? 0,
    finite(input.opponentConfidence) ?? 0,
  ];
  const confidenceScore = confidenceParts.reduce((sum, part) => sum + part, 0) / confidenceParts.length;
  const confidence = confidenceScore >= 0.66 ? "high" : confidenceScore >= 0.45 ? "medium" : "low";

  return {
    modelVersion: K_PROJECTION_V4_MODEL_VERSION,
    ...innings,
    ...kPerInning,
    projectedKs: round(projectedKs, 3),
    projectedBattersFaced: round(projectedBattersFaced, 3),
    bfPerIP: round(bfPerIP),
    confidenceScore: round(confidenceScore),
    confidence,
    warnings: [...new Set(warnings)],
  };
}

export default projectStrikeoutsV4;
