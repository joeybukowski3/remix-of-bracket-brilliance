export function numOrDash(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return digits > 0 ? value.toFixed(digits) : String(value);
}

export function textOrDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "—";
}

export function pctOrDash(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}
