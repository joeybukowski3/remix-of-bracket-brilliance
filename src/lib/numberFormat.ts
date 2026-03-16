export function roundToTenth(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

export function formatRoundedNumber(value: number | null | undefined): string {
  const rounded = roundToTenth(value);
  return rounded === null ? "--" : rounded.toFixed(1);
}

export function formatRoundedPercent(value: number | null | undefined): string {
  const rounded = roundToTenth(value);
  return rounded === null ? "--" : `${rounded.toFixed(1)}%`;
}
