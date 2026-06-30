/**
 * mlb-hr-confidence.mjs
 *
 * Deterministic confidence/data-quality layer for HR predictions.
 * This NEVER alters the HR Quality Score — it is purely descriptive
 * metadata about how complete and reliable the inputs were.
 */

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "incomplete"];

/**
 * @param {object} input
 * @param {boolean} input.lineupConfirmed
 * @param {boolean} input.starterConfirmed
 * @param {boolean} input.hrOddsAvailable
 * @param {boolean} input.weatherAvailable
 * @param {boolean} input.parkFactorAvailable
 * @param {number|null} input.batterSampleSize  // e.g. season at-bats
 * @param {boolean} input.opposingPitcherDataPresent
 * @param {boolean} input.requiredInputsPresent  // barrel/hardHit/xba/whiff/L7/L30 all non-null
 * @returns {{ confidenceLevel: string, confidenceReasons: string[], dataCompletenessPercent: number }}
 */
export function computeHrConfidence(input) {
  const checks = [
    { key: "lineupConfirmed", label: "Lineup confirmed", pass: Boolean(input.lineupConfirmed) },
    { key: "starterConfirmed", label: "Starting pitcher confirmed", pass: Boolean(input.starterConfirmed) },
    { key: "hrOddsAvailable", label: "HR odds available", pass: Boolean(input.hrOddsAvailable) },
    { key: "weatherAvailable", label: "Weather data available", pass: Boolean(input.weatherAvailable) },
    { key: "parkFactorAvailable", label: "Park factor available", pass: Boolean(input.parkFactorAvailable) },
    { key: "batterSampleSize", label: "Adequate batter sample size", pass: (input.batterSampleSize ?? 0) >= 30 },
    { key: "opposingPitcherDataPresent", label: "Opposing pitcher data present", pass: Boolean(input.opposingPitcherDataPresent) },
    { key: "requiredInputsPresent", label: "All required model inputs present", pass: Boolean(input.requiredInputsPresent) },
  ];

  const passCount = checks.filter((c) => c.pass).length;
  const dataCompletenessPercent = Math.round((passCount / checks.length) * 100);
  const failReasons = checks.filter((c) => !c.pass).map((c) => c.label);

  // requiredInputsPresent failing is disqualifying — without it the score itself is unreliable
  let confidenceLevel;
  if (!input.requiredInputsPresent) {
    confidenceLevel = "incomplete";
  } else if (dataCompletenessPercent >= 100) { // all 8 checks must pass for high
    confidenceLevel = "high";
  } else if (dataCompletenessPercent >= 62.5) { // 5/8, 6/8, or 7/8
    confidenceLevel = "medium";
  } else {
    confidenceLevel = "low";
  }

  return {
    confidenceLevel,
    confidenceReasons: failReasons,
    dataCompletenessPercent,
  };
}
