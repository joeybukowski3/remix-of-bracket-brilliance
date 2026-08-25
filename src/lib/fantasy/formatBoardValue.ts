/** Shared number formatting for the fantasy research boards. */

export function formatRank(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : "—";
}

/** Raw consensus average draft position, shown to one decimal. */
export function formatAdp(value: number | undefined): string {
  return Number.isFinite(value) ? (value as number).toFixed(1) : "N/A";
}

/** Signed to `digits` decimals; positive values always carry a leading "+". */
export function formatSigned(value: number | undefined, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  const numeric = value as number;
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(digits)}`;
}
