/**
 * Pure metrics for nfl-power-v0.3.0.
 *
 * This module deliberately has no file, provider, season, or team dependencies.
 * Callers provide the relevant full-season or rolling-window observations.
 * Standard deviations use the league population divisor (N). A valid value in
 * a zero-variance league receives z = 0; missing or non-finite inputs remain
 * explicit nulls and are never converted to zero.
 */

export const NFL_POWER_V03_MODEL_VERSION = "nfl-power-v0.3.0";

export const NFL_POWER_V03_FORMULA_WEIGHTS = Object.freeze({
  opponentAdjustedOffensiveEpaPerPlay: 0.4,
  opponentAdjustedDefensiveEpaPerPlayInverted: 0.4,
  opponentAdjustedPointDifferentialPerGame: 0.2,
});

export const NFL_POWER_V03_POOLED_DIVISOR = 0.733;

export const NFL_POWER_V03_PUBLIC_SCALE = Object.freeze({
  center: 50,
  standardDeviation: 15,
  minimum: 1,
  maximum: 99,
});

export const NFL_POWER_V03_TRAJECTORY = Object.freeze({
  lambda: 0,
  shrinkageK: 4,
  cap: 1,
});

export const NFL_POWER_V03_TRAJECTORY_THRESHOLDS = Object.freeze({
  lateRiser: 0.5,
  lateDecline: -0.5,
  scheduleInflatedAdjustedMaximum: 0.25,
  scheduleMaskedAdjustedMinimum: -0.25,
  scheduleModifierGap: 0.5,
});

export const NFL_POWER_V03_REQUIRED_METRICS = Object.freeze([
  "offensiveEpaPerPlay",
  "defensiveEpaPerPlay",
  "pointDifferentialPerGame",
]);

export const NFL_POWER_V03_FORMULA_METADATA = Object.freeze({
  modelVersion: NFL_POWER_V03_MODEL_VERSION,
  formula: "40% opponent-adjusted offensive EPA/play + 40% inverted opponent-adjusted defensive EPA/play + 20% opponent-adjusted point differential/game",
  weights: NFL_POWER_V03_FORMULA_WEIGHTS,
  standardization: Object.freeze({
    method: "league population z-score",
    zeroVarianceZScore: 0,
  }),
  opponentAdjustments: Object.freeze({
    offense: "raw offensive EPA/play minus opponent defensive EPA/play relative to the league defensive mean",
    defense: "raw defensive EPA/play minus opponent offensive EPA/play relative to the league offensive mean, then inverted",
    margin: "mean game point differential plus each opponent point differential/game relative to the league mean",
  }),
  publicScale: Object.freeze({
    formula: "50 + 15 * (compositeZ / pooledDivisor)",
    pooledDivisor: NFL_POWER_V03_POOLED_DIVISOR,
    cap: Object.freeze([
      NFL_POWER_V03_PUBLIC_SCALE.minimum,
      NFL_POWER_V03_PUBLIC_SCALE.maximum,
    ]),
  }),
  trajectory: Object.freeze({
    formula: "lambda * clamp((windowSize / (windowSize + k)) * (finalWindowAdjustedZ - fullSeasonAdjustedZ), -cap, cap)",
    lambda: NFL_POWER_V03_TRAJECTORY.lambda,
    shrinkageK: NFL_POWER_V03_TRAJECTORY.shrinkageK,
    cap: NFL_POWER_V03_TRAJECTORY.cap,
    thresholds: NFL_POWER_V03_TRAJECTORY_THRESHOLDS,
  }),
  requiredMetrics: NFL_POWER_V03_REQUIRED_METRICS,
});

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const allFiniteNumbers = (values) =>
  Array.isArray(values) && values.length > 0 && values.every(isFiniteNumber);

/** Return the population mean and standard deviation, or null for invalid data. */
export function leagueMeanAndStandardDeviation(values) {
  if (!allFiniteNumbers(values)) return null;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);

  if (!isFiniteNumber(mean) || !isFiniteNumber(standardDeviation)) return null;
  return { mean, standardDeviation, count: values.length };
}

/** Convert a finite value to z. Valid zero-variance inputs deterministically map to 0. */
export function stableZScore(value, leagueStats) {
  if (
    !isFiniteNumber(value) ||
    !leagueStats ||
    !isFiniteNumber(leagueStats.mean) ||
    !isFiniteNumber(leagueStats.standardDeviation) ||
    leagueStats.standardDeviation < 0
  ) {
    return null;
  }
  if (leagueStats.standardDeviation === 0) return 0;

  const zScore = (value - leagueStats.mean) / leagueStats.standardDeviation;
  return isFiniteNumber(zScore) ? zScore : null;
}

/**
 * Reward offensive production against defenses that allow less EPA than the
 * league average, and discount production against weaker defenses.
 */
export function adjustOffensiveEpaPerPlay(
  offensiveEpaPerPlay,
  opponentDefensiveEpaPerPlay,
  leagueDefensiveEpaPerPlayMean
) {
  if (
    !isFiniteNumber(offensiveEpaPerPlay) ||
    !allFiniteNumbers(opponentDefensiveEpaPerPlay) ||
    !isFiniteNumber(leagueDefensiveEpaPerPlayMean)
  ) {
    return null;
  }

  const opponentMean =
    opponentDefensiveEpaPerPlay.reduce((sum, value) => sum + value, 0) /
    opponentDefensiveEpaPerPlay.length;
  const adjusted =
    offensiveEpaPerPlay - (opponentMean - leagueDefensiveEpaPerPlayMean);
  return isFiniteNumber(adjusted) ? adjusted : null;
}

/**
 * Adjust EPA allowed for opposing offenses. Lower output remains better until
 * invertDefensiveValue is applied for the composite.
 */
export function adjustDefensiveEpaPerPlay(
  defensiveEpaPerPlay,
  opponentOffensiveEpaPerPlay,
  leagueOffensiveEpaPerPlayMean
) {
  if (
    !isFiniteNumber(defensiveEpaPerPlay) ||
    !allFiniteNumbers(opponentOffensiveEpaPerPlay) ||
    !isFiniteNumber(leagueOffensiveEpaPerPlayMean)
  ) {
    return null;
  }

  const opponentMean =
    opponentOffensiveEpaPerPlay.reduce((sum, value) => sum + value, 0) /
    opponentOffensiveEpaPerPlay.length;
  const adjusted =
    defensiveEpaPerPlay - (opponentMean - leagueOffensiveEpaPerPlayMean);
  return isFiniteNumber(adjusted) ? adjusted : null;
}

/**
 * Adjust each game margin using that game's opponent context, then average the
 * adjusted games. Callers are responsible for providing the desired window.
 */
export function adjustPointDifferentialPerGame(
  gameContexts,
  leaguePointDifferentialPerGameMean
) {
  if (
    !Array.isArray(gameContexts) ||
    gameContexts.length === 0 ||
    !isFiniteNumber(leaguePointDifferentialPerGameMean) ||
    gameContexts.some(
      (game) =>
        !game ||
        !isFiniteNumber(game.pointDifferential) ||
        !isFiniteNumber(game.opponentPointDifferentialPerGame)
    )
  ) {
    return null;
  }

  const adjustedTotal = gameContexts.reduce(
    (sum, game) =>
      sum +
      game.pointDifferential +
      (game.opponentPointDifferentialPerGame - leaguePointDifferentialPerGameMean),
    0
  );
  const adjusted = adjustedTotal / gameContexts.length;
  return isFiniteNumber(adjusted) ? adjusted : null;
}

/** Invert a lower-is-better defensive value so better defense scores higher. */
export function invertDefensiveValue(value) {
  return isFiniteNumber(value) ? -value : null;
}

/** Calculate the approved 40/40/20 composite from already standardized inputs. */
export function calculateComposite({
  offensiveZ,
  defensiveZ,
  pointDifferentialZ,
} = {}) {
  if (
    !isFiniteNumber(offensiveZ) ||
    !isFiniteNumber(defensiveZ) ||
    !isFiniteNumber(pointDifferentialZ)
  ) {
    return null;
  }

  const composite =
    NFL_POWER_V03_FORMULA_WEIGHTS.opponentAdjustedOffensiveEpaPerPlay *
      offensiveZ +
    NFL_POWER_V03_FORMULA_WEIGHTS
      .opponentAdjustedDefensiveEpaPerPlayInverted *
      defensiveZ +
    NFL_POWER_V03_FORMULA_WEIGHTS
      .opponentAdjustedPointDifferentialPerGame *
      pointDifferentialZ;
  return isFiniteNumber(composite) ? composite : null;
}

/** Convert composite z to unit z with the approved versioned pooled divisor. */
export function compositeToUnitZ(compositeZ) {
  if (!isFiniteNumber(compositeZ)) return null;
  const unitZ = compositeZ / NFL_POWER_V03_POOLED_DIVISOR;
  return isFiniteNumber(unitZ) ? unitZ : null;
}

/** Apply the stable public scale and only the pathological [1, 99] cap. */
export function toPublicRating(compositeZ) {
  const unitZ = compositeToUnitZ(compositeZ);
  if (unitZ === null) return null;

  const unbounded =
    NFL_POWER_V03_PUBLIC_SCALE.center +
    NFL_POWER_V03_PUBLIC_SCALE.standardDeviation * unitZ;
  if (!isFiniteNumber(unbounded)) return null;
  return Math.min(
    NFL_POWER_V03_PUBLIC_SCALE.maximum,
    Math.max(NFL_POWER_V03_PUBLIC_SCALE.minimum, unbounded)
  );
}

/** Shrink a supplied adjusted window delta toward the full-season baseline. */
export function shrinkTrajectoryDelta(
  finalWindowAdjustedZ,
  fullSeasonAdjustedZ,
  windowSize,
  shrinkageK = NFL_POWER_V03_TRAJECTORY.shrinkageK
) {
  if (
    !isFiniteNumber(finalWindowAdjustedZ) ||
    !isFiniteNumber(fullSeasonAdjustedZ) ||
    !Number.isInteger(windowSize) ||
    windowSize <= 0 ||
    !isFiniteNumber(shrinkageK) ||
    shrinkageK < 0
  ) {
    return null;
  }

  const shrunkDelta =
    (windowSize / (windowSize + shrinkageK)) *
    (finalWindowAdjustedZ - fullSeasonAdjustedZ);
  return isFiniteNumber(shrunkDelta) ? shrunkDelta : null;
}

/** Clamp a finite shrunk trajectory delta to the supplied symmetric cap. */
export function clampTrajectoryDelta(
  shrunkDelta,
  cap = NFL_POWER_V03_TRAJECTORY.cap
) {
  if (!isFiniteNumber(shrunkDelta) || !isFiniteNumber(cap) || cap <= 0) {
    return null;
  }
  return Math.min(cap, Math.max(-cap, shrunkDelta));
}

/** Apply the trajectory weight; launch lambda is zero but remains overridable. */
export function calculateTrajectoryTerm(
  clampedDelta,
  lambda = NFL_POWER_V03_TRAJECTORY.lambda
) {
  if (!isFiniteNumber(clampedDelta) || !isFiniteNumber(lambda)) return null;
  if (lambda === 0) return 0;

  const trajectoryTerm = lambda * clampedDelta;
  return isFiniteNumber(trajectoryTerm) ? trajectoryTerm : null;
}

/** Classify an adjusted trajectory delta at the approved inclusive boundaries. */
export function classifyPrimaryTrajectory(adjustedDelta) {
  if (!isFiniteNumber(adjustedDelta)) return null;
  if (adjustedDelta >= NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateRiser) {
    return "Late Riser";
  }
  if (adjustedDelta <= NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateDecline) {
    return "Late Decline";
  }
  return "Stable";
}

/** Apply schedule-context reclassifications before the primary classification. */
export function classifyTrajectoryWithScheduleContext(rawDelta, adjustedDelta) {
  if (!isFiniteNumber(rawDelta) || !isFiniteNumber(adjustedDelta)) return null;

  if (
    rawDelta >= NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateRiser &&
    adjustedDelta <
      NFL_POWER_V03_TRAJECTORY_THRESHOLDS.scheduleInflatedAdjustedMaximum
  ) {
    return "Schedule-Inflated Surge";
  }
  if (
    rawDelta <= NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateDecline &&
    adjustedDelta >
      NFL_POWER_V03_TRAJECTORY_THRESHOLDS.scheduleMaskedAdjustedMinimum
  ) {
    return "Schedule-Masked Fade";
  }
  return classifyPrimaryTrajectory(adjustedDelta);
}

/** Return schedule-context modifiers at the approved inclusive gap threshold. */
export function getScheduleContextModifiers(rawDelta, adjustedDelta) {
  if (!isFiniteNumber(rawDelta) || !isFiniteNumber(adjustedDelta)) return null;

  if (
    rawDelta - adjustedDelta >=
    NFL_POWER_V03_TRAJECTORY_THRESHOLDS.scheduleModifierGap
  ) {
    return ["Schedule-Aided"];
  }
  if (
    adjustedDelta - rawDelta >=
    NFL_POWER_V03_TRAJECTORY_THRESHOLDS.scheduleModifierGap
  ) {
    return ["Schedule-Hidden"];
  }
  return [];
}

/**
 * Validate raw metrics without coercion. Missing and invalid values are kept
 * separate so a later artifact can report an explicit unrated reason.
 */
export function validateRequiredMetrics(metrics) {
  const source = metrics && typeof metrics === "object" ? metrics : {};
  const missingFields = NFL_POWER_V03_REQUIRED_METRICS.filter(
    (field) => source[field] === null || source[field] === undefined
  );
  const invalidFields = NFL_POWER_V03_REQUIRED_METRICS.filter(
    (field) =>
      source[field] !== null &&
      source[field] !== undefined &&
      !isFiniteNumber(source[field])
  );
  const isValid = missingFields.length === 0 && invalidFields.length === 0;

  return {
    isValid,
    status: isValid ? "rated" : "unrated",
    missingFields,
    invalidFields,
  };
}

/**
 * Return cloned rows ranked high-to-low. Capped public ties use uncapped
 * composite z, then teamId ascending. Invalid ratings remain explicitly
 * unrated at the end and receive rank null.
 */
export function rankRatings(rows) {
  if (!Array.isArray(rows)) return [];

  const cloned = rows.map((row) => ({ ...row }));
  for (const row of cloned) {
    if (typeof row.teamId !== "string" || row.teamId.length === 0) {
      throw new Error("rankRatings: every row requires a non-empty teamId");
    }
  }

  cloned.sort((a, b) => {
    const aRated = isFiniteNumber(a.publicRating);
    const bRated = isFiniteNumber(b.publicRating);
    if (aRated !== bRated) return aRated ? -1 : 1;
    if (aRated && bRated && b.publicRating !== a.publicRating) {
      return b.publicRating - a.publicRating;
    }

    const aComposite = isFiniteNumber(a.compositeZ) ? a.compositeZ : -Infinity;
    const bComposite = isFiniteNumber(b.compositeZ) ? b.compositeZ : -Infinity;
    if (bComposite !== aComposite) return bComposite - aComposite;
    return a.teamId.localeCompare(b.teamId);
  });

  let rank = 0;
  return cloned.map((row) => {
    if (!isFiniteNumber(row.publicRating)) return { ...row, rank: null };
    rank += 1;
    return { ...row, rank };
  });
}
