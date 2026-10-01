const RED = [227, 72, 72] as const;
const GRAY = [148, 163, 184] as const;
const GREEN = [24, 182, 84] as const;

/** Interpolate the filled ranking bar from red through neutral gray to green. */
export function percentageBarColor(percentage: number): string {
  const value = Math.min(100, Math.max(0, percentage));
  const start = value <= 50 ? RED : GRAY;
  const end = value <= 50 ? GRAY : GREEN;
  const fraction = value <= 50 ? value / 50 : (value - 50) / 50;
  return `rgb(${start.map((channel, index) => Math.round(channel + (end[index] - channel) * fraction)).join(", ")})`;
}
