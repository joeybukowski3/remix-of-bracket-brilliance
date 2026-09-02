/**
 * mlb-k-backtest-dataset.mjs  (backtest step 5, PURE)
 *
 * Assembles one three-view backtest row per historical pitcher start:
 *   - v2                 : the production V2 model, ALL confidences kept
 *   - legacy             : the legacy IP x K9 / 9 model, computed independently
 *   - productionResolved : exactly what production would have served, using the
 *                          same eligibility rule as live production
 *
 * Reuses the real production/model helpers via the injected `deps` object -
 * no formula is reimplemented here.
 *
 * No I/O, no clock. `buildBacktestRow` is deterministic given its inputs.
 */

const PUBLISHED_DECIMALS = 1;

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function round1(value) {
  return round(value, PUBLISHED_DECIMALS);
}

function toUsable(value) {
  const rounded = round1(value);
  return rounded != null && rounded > 0 ? rounded : null;
}

function seasonPhase(date) {
  const year = date.slice(0, 4);
  if (date < `${year}-05-15`) return "early";
  if (date > `${year}-08-15`) return "late";
  return "mid";
}

function projectionBucket(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < 3.5) return "lt_3_5";
  if (value < 4.5) return "3_5_to_4_5";
  if (value < 5.5) return "4_5_to_5_5";
  if (value < 6.5) return "5_5_to_6_5";
  return "gte_6_5";
}

function actualIpBucket(innings) {
  if (!Number.isFinite(innings)) return "unknown";
  if (innings < 4) return "lt_4";
  if (innings < 5) return "4_to_5";
  if (innings < 6) return "5_to_6";
  if (innings < 7) return "6_to_7";
  return "gte_7";
}

/**
 * @param {object} params
 * @param {object} params.identity        {season,date,gameId,gameNumber,pitcherId,pitcherName,team,opponent,pitcherIsHome,handedness,venueId}
 * @param {object} params.pitcherAsOf     from buildPitcherAsOf
 * @param {object} params.opponentAsOf    from buildTeamOffenseAsOf
 * @param {object} params.leagueAsOf      from buildLeagueAsOf
 * @param {object} params.workloadDataShape from buildWorkloadDataShape
 * @param {object} params.actual          {strikeouts,inningsPitched,battersFaced,pitches,walks,hits}
 * @param {object} params.deps            production helpers (see module doc)
 */
export function buildBacktestRow({ identity, pitcherAsOf, opponentAsOf, leagueAsOf, workloadDataShape, actual, deps }) {
  const {
    calculateProjectedInnings,
    calculateProjectedK9,
    calculateProjectedKs,
    classifyPitcherRole,
    computeWorkloadProjection,
    projectStrikeoutsV2,
    v2ProductionConfidence,
  } = deps;

  // ---------------------------------------------------------------- LEGACY ----
  const seasonIP = pitcherAsOf.seasonInnings;
  const seasonGS = pitcherAsOf.seasonStarts;
  const seasonStrikeOuts = pitcherAsOf.seasonStrikeOuts;
  const legacyKRatePercent = pitcherAsOf.seasonKRate != null ? pitcherAsOf.seasonKRate * 100 : null;
  const legacyPitcherInput = {
    seasonIP,
    seasonGS,
    seasonStrikeOuts,
    kRate: legacyKRatePercent,
    whiffRate: null, // Statcast whiff not reconstructed (per approved scope)
    recentStarts: pitcherAsOf.recentStarts.map((row) => ({ inningsPitched: row.inningsPitched })),
  };
  const role = classifyPitcherRole(legacyPitcherInput);
  const legacyProjectedIP = calculateProjectedInnings(legacyPitcherInput);
  const legacyProjectedK9 = calculateProjectedK9(legacyPitcherInput);
  const legacyProjectedKs = calculateProjectedKs(legacyProjectedIP, legacyProjectedK9);

  const hasRealSeasonK9 = seasonStrikeOuts != null && seasonIP != null && seasonIP > 0;
  const k9Source = hasRealSeasonK9 ? "season-real" : (legacyProjectedK9 != null ? "rate-estimate" : "unavailable");
  const recentIpValues = pitcherAsOf.recentStarts.map((row) => row.inningsPitched).filter((value) => value != null);
  const ipSource = recentIpValues.length >= 3
    ? "recent-starts"
    : (seasonIP != null && seasonGS != null && seasonGS > 0 ? "season-aggregate" : "role-default");

  const legacy = {
    projectedKs: legacyProjectedKs,
    projectedIP: legacyProjectedIP,
    projectedK9: legacyProjectedK9,
    role,
    k9Source,
    ipSource,
    whiffFallbackApplied: k9Source === "rate-estimate",
  };

  // -------------------------------------------------------------- WORKLOAD ----
  const workload = computeWorkloadProjection({
    workloadData: workloadDataShape,
    pitcher: {
      seasonKRate: pitcherAsOf.seasonKRate,
      recentKRate: pitcherAsOf.recentKRate,
      whiffRate: null,
    },
    opponent: {
      seasonPitchesPerPA: opponentAsOf.seasonPitchesPerPA,
      recent14PitchesPerPA: opponentAsOf.recent14PitchesPerPA,
    },
    league: leagueAsOf,
    context: { listedProbableStarter: true },
  });
  const expectedBF = Number.isFinite(workload?.projection?.expectedBF) ? workload.projection.expectedBF : null;
  const expectedInnings = Number.isFinite(workload?.projection?.expectedInnings) ? workload.projection.expectedInnings : null;
  const bfPerInning = expectedBF != null && expectedInnings != null && expectedInnings > 0 ? expectedBF / expectedInnings : null;

  // -------------------------------------------------------------------- V2 ----
  // Mirrors scripts/lib/mlb-k-props-v2-shadow-core.mjs buildV2Input. Fields that
  // production always leaves null (home/away splits, lineup K%, opponent whiff)
  // are left null here too so V2 is scored on the same input surface it runs on.
  const v2Input = {
    pitcher: {
      seasonKRate: pitcherAsOf.seasonKRate ?? null,
      seasonKPer9: legacyProjectedK9,
      seasonWhiffRate: null,
      recentKRate: pitcherAsOf.recentKRate ?? null,
      recentKPer9: pitcherAsOf.recentKPer9 ?? null,
      recentWhiffRate: null,
      homeKRate: null,
      awayKRate: null,
      homeWhiffRate: null,
      awayWhiffRate: null,
      handedness: identity.handedness ?? null,
      projectedInnings: expectedInnings ?? legacyProjectedIP,
      projectedBattersFaced: expectedBF,
      averageBattersFacedPerInning: bfPerInning,
      pitchCountTrend: Number.isFinite(workload?.inputs?.recentPitchAverage) ? workload.inputs.recentPitchAverage : null,
      pitcherKScore: null,
      recentStarts: pitcherAsOf.recentStarts.map((row) => ({
        strikeouts: row.strikeouts,
        inningsPitched: row.inningsPitched,
        battersFaced: row.battersFaced,
        pitchCount: row.pitchCount,
      })),
    },
    opponent: {
      seasonKRate: opponentAsOf.seasonKRate ?? null,
      recentKRate: opponentAsOf.recent14KRate ?? null,
      homeKRate: null,
      awayKRate: null,
      vsLhpKRate: null,
      vsRhpKRate: null,
      seasonWhiffRate: null,
      recentWhiffRate: null,
      homeWhiffRate: null,
      awayWhiffRate: null,
      projectedLineupKRate: null, // not reconstructable historically (posted lineups unarchived)
      opponentKScore: null,
      matchupRating: null,
      recentVsStarters: [],
    },
    context: {
      pitcherIsHome: Boolean(identity.pitcherIsHome),
      leagueAverageKRate: leagueAsOf.kRate ?? null,
      leagueAverageWhiffRate: null, // Statcast whiff not reconstructed
    },
  };
  const v2Raw = projectStrikeoutsV2(v2Input);
  const v2ProjectedStrikeouts = Number.isFinite(v2Raw.projectedStrikeouts) ? v2Raw.projectedStrikeouts : null;
  const v2Positive = v2ProjectedStrikeouts != null && v2ProjectedStrikeouts > 0;
  const productionEligible = v2Positive && v2ProductionConfidence.has(v2Raw.confidence);
  const productionIneligibleReason = productionEligible
    ? null
    : (!v2Positive ? "non-positive" : (v2Raw.confidence === "insufficient" ? "insufficient" : "low-confidence"));

  const v2 = {
    projectedStrikeouts: v2ProjectedStrikeouts,
    projectedKs: toUsable(v2ProjectedStrikeouts),
    projectedKRate: round(v2Raw.projectedKRate),
    projectedBattersFaced: round(v2Raw.projectedBattersFaced),
    projectedInnings: round(v2Raw.projectedInnings),
    pitcherSkillRate: round(v2Raw.pitcherSkillRate),
    opponentEnvironmentRate: round(v2Raw.opponentEnvironmentRate),
    matchupAdjustment: round(v2Raw.matchupAdjustment, 5),
    confidence: v2Raw.confidence,
    productionEligible,
    productionIneligibleReason,
    componentCount: v2Raw.components.length,
    components: v2Raw.components.map((component) => ({
      key: component.key,
      value: round(component.value),
      normalizedWeight: round(component.normalizedWeight),
      contribution: round(component.contribution),
      source: component.source,
    })),
    fallbackFields: v2Raw.fallbacks.map((entry) => entry.field),
    warnings: v2Raw.warnings,
  };

  // --------------------------------------------------- PRODUCTION-RESOLVED ----
  const legacyUsable = toUsable(legacy.projectedKs);
  let productionResolved;
  if (productionEligible) {
    productionResolved = { projectedKs: toUsable(v2ProjectedStrikeouts), source: "v2", fallbackReason: null };
  } else if (legacyUsable != null) {
    const reasonMap = { "non-positive": "invalid-v2-projection", insufficient: "insufficient-v2-confidence", "low-confidence": "low-v2-confidence" };
    productionResolved = { projectedKs: legacyUsable, source: "legacy-fallback", fallbackReason: reasonMap[productionIneligibleReason] };
  } else {
    productionResolved = { projectedKs: null, source: "unavailable", fallbackReason: "invalid-legacy-projection" };
  }
  const projectionServedByProduction = productionResolved.source === "v2" ? "v2" : (productionResolved.source === "legacy-fallback" ? "legacy" : null);

  // ------------------------------------------------------------- RESIDUALS ----
  const actualK = Number.isFinite(actual?.strikeouts) ? actual.strikeouts : null;
  const residual = (projection) => (actualK != null && projection != null ? round(actualK - projection) : null);
  const eProduction = residual(productionResolved.projectedKs);
  const eV2 = residual(v2.projectedStrikeouts);
  const eLegacy = residual(legacy.projectedKs);
  const bothAvailable = v2.projectedStrikeouts != null && legacyUsable != null;

  // ---------------------------------------------------------- AVAILABILITY ----
  const availability = {
    v2: v2.projectedStrikeouts != null,
    legacy: legacyUsable != null,
    both: bothAvailable,
    productionScoreable: productionResolved.projectedKs != null && actualK != null,
    isProductionFallbackRow: productionResolved.source === "legacy-fallback",
  };

  // ---------------------------------------------- DEGRADATION / FIDELITY ------
  const degradationFlags = ["SAVANT_STATCAST_RATES_SUBSTITUTED_STATSAPI", "PROJECTED_LINEUP_KRATE_DROPPED", "LEAGUE_WHIFF_UNAVAILABLE", "V2_WHIFF_SUPPORTED_TERMS_DROPPED"];
  if (legacy.whiffFallbackApplied) degradationFlags.push("LEGACY_K9_RATE_ESTIMATE");
  if (pitcherAsOf.usedPriorSeason) degradationFlags.push("RECENT_FORM_USED_PRIOR_SEASON");
  if (pitcherAsOf.firstStartOfSeason) degradationFlags.push("FIRST_START_OF_SEASON");
  if (pitcherAsOf.recentStartCount < 3) degradationFlags.push("SPARSE_RECENT_START_SAMPLE");
  if (opponentAsOf.seasonKRate == null) degradationFlags.push("OPPONENT_SEASON_KRATE_UNAVAILABLE");
  if (workloadDataShape?.completeness?.flags?.length) degradationFlags.push(...workloadDataShape.completeness.flags.map((flag) => `WORKLOAD_${flag}`));

  const dataQualityTier = (pitcherAsOf.seasonStarts >= 8 && pitcherAsOf.recentStartCount >= 4 && !pitcherAsOf.firstStartOfSeason)
    ? "A"
    : ((pitcherAsOf.seasonStarts >= 3 || pitcherAsOf.recentStartCount >= 3) ? "B" : "C");

  const recentFormDelta = pitcherAsOf.recentKRate != null && pitcherAsOf.seasonKRate != null
    ? round(pitcherAsOf.recentKRate - pitcherAsOf.seasonKRate)
    : null;

  return {
    schemaVersion: 1,
    season: identity.season,
    date: identity.date,
    gameId: identity.gameId,
    gameNumber: identity.gameNumber ?? 1,
    pitcherId: identity.pitcherId,
    pitcherName: identity.pitcherName ?? null,
    team: identity.team ?? null,
    opponent: identity.opponent ?? null,
    pitcherIsHome: identity.pitcherIsHome ?? null,
    handedness: identity.handedness ?? null,
    venueId: identity.venueId ?? null,

    v2,
    legacy,
    productionResolved,
    projectionServedByProduction,

    inputs: {
      asOfCutoff: identity.date,
      pitcher: {
        seasonStarts: pitcherAsOf.seasonStarts,
        seasonStrikeOuts,
        seasonInnings: round(seasonIP, 2),
        seasonBattersFaced: pitcherAsOf.seasonBattersFaced,
        seasonKRate: round(pitcherAsOf.seasonKRate),
        seasonKPer9: round(pitcherAsOf.seasonKPer9, 3),
        recentStartCount: pitcherAsOf.recentStartCount,
        recentKRate: round(pitcherAsOf.recentKRate),
        recentKPer9: round(pitcherAsOf.recentKPer9, 3),
        recentMeanInnings: round(pitcherAsOf.recentMeanInnings, 3),
        recentMeanBattersFaced: round(pitcherAsOf.recentMeanBattersFaced, 3),
        homeKRate: round(pitcherAsOf.homeKRate),
        awayKRate: round(pitcherAsOf.awayKRate),
        usedPriorSeason: pitcherAsOf.usedPriorSeason,
        firstStartOfSeason: pitcherAsOf.firstStartOfSeason,
        rateSource: "statsapi-cumulative",
      },
      opponent: {
        seasonKRate: round(opponentAsOf.seasonKRate),
        recent14KRate: round(opponentAsOf.recent14KRate),
        seasonPlateAppearances: opponentAsOf.seasonPlateAppearances,
        seasonPitchesPerPA: round(opponentAsOf.seasonPitchesPerPA, 3),
        recent14PitchesPerPA: round(opponentAsOf.recent14PitchesPerPA, 3),
        gamesBeforeCutoff: opponentAsOf.gamesBeforeCutoff,
      },
      league: { kRate: round(leagueAsOf.kRate), pitchesPerPA: round(leagueAsOf.pitchesPerPA, 3), whiffRate: null },
      workload: {
        role: workload?.role ?? null,
        expectedBF: round(expectedBF, 3),
        expectedInnings: round(expectedInnings, 3),
        confidenceGrade: workload?.confidence?.grade ?? null,
        bfSource: expectedBF != null ? "workload-model" : "unavailable",
        flags: workload?.flags ?? [],
      },
    },

    actual: {
      strikeouts: actualK,
      inningsPitched: Number.isFinite(actual?.inningsPitched) ? round(actual.inningsPitched, 3) : null,
      battersFaced: Number.isFinite(actual?.battersFaced) ? actual.battersFaced : null,
      pitches: Number.isFinite(actual?.pitches) ? actual.pitches : null,
      walks: Number.isFinite(actual?.walks) ? actual.walks : null,
      hits: Number.isFinite(actual?.hits) ? actual.hits : null,
    },

    market: { kLine: null, overOdds: null, underOdds: null, book: null },

    residuals: {
      productionResolved: eProduction,
      v2: eV2,
      legacy: eLegacy,
      v2MinusLegacyAbsError: bothAvailable && eV2 != null && eLegacy != null ? round(Math.abs(eV2) - Math.abs(eLegacy)) : null,
    },

    availability,
    degradationFlags: [...new Set(degradationFlags)],
    dataQualityTier,
    seasonPhase: seasonPhase(identity.date),
    segments: {
      productionProjectionBucket: projectionBucket(productionResolved.projectedKs),
      v2ProjectionBucket: projectionBucket(v2.projectedStrikeouts),
      legacyProjectionBucket: projectionBucket(legacy.projectedKs),
      actualIpBucket: actualIpBucket(actual?.inningsPitched),
      homeAway: identity.pitcherIsHome === true ? "home" : identity.pitcherIsHome === false ? "away" : "unknown",
      handedness: identity.handedness ?? "unknown",
      recentFormDelta,
    },
  };
}
