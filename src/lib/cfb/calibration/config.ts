export const CFB_V02_CANDIDATE_CONFIG = Object.freeze({
  version: "cfb-preseason-v0.2-candidate" as const,
  standardization: "league-z-score" as const,
  offense: Object.freeze({ yardsPerPlayWeight: 0.5, pointsPerPlayWeight: 0.5 }),
  defense: Object.freeze({ yardsPerPlayWeight: 0.5, pointsPerPlayWeight: 0.5 }),
  returningProductionWeight: 0.1,
  power: Object.freeze({ offenseWeight: 0.5, defenseWeight: 0.5 }),
  opponentAdjustment: Object.freeze({ strength: 0.2, iterations: 6 }),
  recency: Object.freeze({ method: "equal" as const }),
  postseason: Object.freeze({ method: "all-equal" as const }),
  displayScale: Object.freeze({ min: 40, max: 99 }),
});

export const CFB_CALIBRATION_GRID = Object.freeze({
  strengths: Object.freeze([0, 0.2, 0.35, 0.5, 0.65, 0.8, 1]),
  iterations: Object.freeze([3, 6, 12, 20]),
  returningProductionWeights: Object.freeze([0, 0.1, 0.2, 0.25]),
  trainWeeks: Object.freeze({ min: 1, max: 8 }),
  testWeeks: Object.freeze({ min: 9, max: 14 }),
});
