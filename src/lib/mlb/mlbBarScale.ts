const SCALE_RANGES = {
  era: { min: 2, max: 7.5 },
  whip: { min: 0.9, max: 1.7 },
  k9: { min: 5, max: 12.5 },
  percent: { min: 10, max: 32 },
  bbPercent: { min: 3, max: 14 },
  hr9: { min: 0.4, max: 2.2 },
  obp: { min: 0.26, max: 0.37 },
  slg: { min: 0.3, max: 0.56 },
  ops: { min: 0.6, max: 0.92 },
  avg: { min: 0.18, max: 0.32 },
  factor: { min: 80, max: 125 },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type MlbScaleKey = keyof typeof SCALE_RANGES;

export function getBarScalePosition(value: number | null, scaleKey: MlbScaleKey) {
  if (value == null) return 50;
  const range = SCALE_RANGES[scaleKey];
  const normalized = (clamp(value, range.min, range.max) - range.min) / (range.max - range.min);
  return normalized * 100;
}

export function getLeagueTickPosition(leagueAverage: number | null, scaleKey: MlbScaleKey) {
  if (leagueAverage == null) return 50;
  return getBarScalePosition(leagueAverage, scaleKey);
}
