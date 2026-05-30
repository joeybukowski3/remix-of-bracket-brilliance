/**
 * Pitcher Regression Analysis
 * Compares ERA vs predictive metrics (xFIP, SIERA) to identify sustainability
 * Regression Score: -10 (outperforming, due for negative regression) to +10 (underperforming, due for positive regression)
 */

export type PitcherRegressionData = {
  pitcherId: number | null;
  name: string;
  team: string;
  era: number | null;
  xfip: number | null;        // Expected FIP
  xera: number | null;        // Expected ERA from Statcast (Baseball Savant)
  siera: number | null;       // Skill-Interactive ERA (fallback, often null)
  kbb: number | null;         // K-BB% (skill indicator)
  strandRate: number | null;  // LOB% (luck indicator, should be ~73%)
  hrfb: number | null;        // HR/FB% (luck indicator, should be ~10%)
  babip: number | null;       // Batting Avg on Balls in Play (luck)
  regressionScore: number;    // -10 to +10
  regressionTier: "extreme_positive" | "strong_positive" | "slight_positive" | "neutral" | "slight_negative" | "strong_negative" | "extreme_negative";
  summary: string;
};
  hrfb: number | null;        // HR/FB% (luck indicator, should be ~10%)
  babip: number | null;       // Batting Avg on Balls in Play (luck)
  regressionScore: number;    // -10 to +10
  regressionTier: "extreme_positive" | "strong_positive" | "slight_positive" | "neutral" | "slight_negative" | "strong_negative" | "extreme_negative";
  summary: string;
};

/**
 * Calculate regression score from ERA vs predictive metrics
 * -10 = massive outperformance (lucky, regress down)
 * 0 = sustainable
 * +10 = massive underperformance (unlucky, regress up)
 */
export function computeRegressionScore(data: {
  era: number | null;
  xfip: number | null;
  siera: number | null;
  strandRate: number | null;  // 0-100
  hrfb: number | null;        // 0-100
  babip: number | null;
}): { score: number; tier: PitcherRegressionData["regressionTier"]; } {
  if (data.era == null) return { score: 0, tier: "neutral" };

  // Estimate the "expected ERA" from advanced metrics
  // Use xFIP if available (more predictive), fall back to SIERA
  const expectedEra = data.xfip ?? data.siera;
  if (expectedEra == null) return { score: 0, tier: "neutral" };

  // Base differential: how far is ERA from what metrics expect?
  const baseDiff = data.era - expectedEra; // negative = lucky (outperforming)

  // Luck indicators
  let luckAdjustment = 0;
  
  // Strand rate: >80% is unsustainable (lucky), <65% is unlucky
  if (data.strandRate != null) {
    const strandNorm = 73; // league average
    const strandDiff = data.strandRate - strandNorm;
    // Each 1% above 73% makes it ~0.05 ERA "luck"
    luckAdjustment += (strandDiff / 20) * 0.5;
  }

  // HR/FB: >12% is unlucky (due to regress down), <8% is lucky (due to regress up)
  if (data.hrfb != null) {
    const hrfbNorm = 10;
    const hrfbDiff = data.hrfb - hrfbNorm;
    // Each 1% difference is ~0.08 ERA impact
    luckAdjustment += (hrfbDiff / 5) * 0.4;
  }

  // BABIP: >310 is lucky (pitcher has no control), <280 is unlucky
  if (data.babip != null) {
    const babipNorm = 0.300;
    const babipDiff = data.babip - babipNorm;
    // Each 0.01 BABIP is ~0.1 ERA
    luckAdjustment += babipDiff * 10 * 0.3;
  }

  // Total regression indicator
  const totalDiff = baseDiff + luckAdjustment;

  // Scale: ±4 ERA-run gap = ±10 (wider range, avoids clamping at extremes)
  // Luck adjustments capped so they can't dominate the score on their own
  const clampedLuck = Math.max(-3, Math.min(3, luckAdjustment));
  const adjusted = baseDiff + clampedLuck;
  const score = Math.max(-10, Math.min(10, (adjusted / 4) * 10));

  // Tier classification
  let tier: PitcherRegressionData["regressionTier"];
  if (score < -6.5) tier = "extreme_positive";
  else if (score < -3) tier = "strong_positive";
  else if (score < -1) tier = "slight_positive";
  else if (score < 1) tier = "neutral";
  else if (score < 3) tier = "slight_negative";
  else if (score < 6.5) tier = "strong_negative";
  else tier = "extreme_negative";

  return { score: Math.round(score * 10) / 10, tier };
}

/**
 * Build a pitcher regression entry from raw stats
 */
export function buildRegressionData(params: {
  pitcherId: number | null;
  name: string;
  team: string;
  era: number | null;
  xfip: number | null;
  siera: number | null;
  kbb: number | null;
  strandRate: number | null;
  hrfb: number | null;
  babip: number | null;
}): PitcherRegressionData {
  const { score, tier } = computeRegressionScore({
    era: params.era,
    xfip: params.xfip,
    siera: params.siera,
    strandRate: params.strandRate,
    hrfb: params.hrfb,
    babip: params.babip,
  });

  const summaries: Record<PitcherRegressionData["regressionTier"], string> = {
    extreme_positive: `${params.name} is massively overperforming — expect significant ERA regression downward.`,
    strong_positive: `${params.name} is exceeding metrics by ~2 runs — likely to regress.`,
    slight_positive: `${params.name} has a small edge over expected — slight upside regression risk.`,
    neutral: `${params.name}'s performance aligns with underlying metrics — sustainable.`,
    slight_negative: `${params.name} is slightly underperforming — modest upside potential.`,
    strong_negative: `${params.name} is ~2 runs below expected — strong positive regression likely.`,
    extreme_negative: `${params.name} is drastically underperforming — expect significant ERA improvement.`,
  };

  return {
    pitcherId: params.pitcherId,
    name: params.name,
    team: params.team,
    era: params.era,
    xfip: params.xfip,
    siera: params.siera,
    kbb: params.kbb,
    strandRate: params.strandRate,
    hrfb: params.hrfb,
    babip: params.babip,
    regressionScore: score,
    regressionTier: tier,
    summary: summaries[tier],
  };
}
