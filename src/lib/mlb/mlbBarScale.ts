const SCALE_RANGES = {
  era:       { min: 2,    max: 7.5,  lowerIsBetter: true  },
  whip:      { min: 0.9,  max: 1.7,  lowerIsBetter: true  },
  k9:        { min: 5,    max: 12.5, lowerIsBetter: false },
  percent:   { min: 10,   max: 32,   lowerIsBetter: false },
  bbPercent: { min: 3,    max: 14,   lowerIsBetter: true  },
  hr9:       { min: 0.4,  max: 2.2,  lowerIsBetter: true  },
  obp:       { min: 0.26, max: 0.37, lowerIsBetter: false },
  slg:       { min: 0.3,  max: 0.56, lowerIsBetter: false },
  ops:       { min: 0.6,  max: 0.92, lowerIsBetter: false },
  avg:       { min: 0.18, max: 0.32, lowerIsBetter: false },
  factor:    { min: 80,   max: 125,  lowerIsBetter: false },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type MlbScaleKey = keyof typeof SCALE_RANGES;

export function getBarScalePosition(value: number | null, scaleKey: MlbScaleKey) {
  if (value == null) return 50;
  const range = SCALE_RANGES[scaleKey];
  const normalized = (clamp(value, range.min, range.max) - range.min) / (range.max - range.min);
  // For lower-is-better stats, invert so a better (lower) value shows a longer bar
  return range.lowerIsBetter ? (1 - normalized) * 100 : normalized * 100;
}

export function getLeagueTickPosition(leagueAverage: number | null, scaleKey: MlbScaleKey) {
  if (leagueAverage == null) return 50;
  return getBarScalePosition(leagueAverage, scaleKey);
}
