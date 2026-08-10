/** Safe display helpers — never render NaN/undefined/null as fake zeros. */

export function formatNullableNumber(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function formatNullableInteger(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return String(Math.trunc(value));
}

export function formatRank(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `#${Math.trunc(value)}`;
}

export function formatRecord(
  wins: number,
  losses: number,
  ties = 0,
): string {
  if (ties > 0) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

export function formatMoneyline(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

export function formatSpread(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "PK";
  return value > 0 ? `+${value}` : String(value);
}

export function formatTotal(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

export function formatBooleanYesNo(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

/**
 * Rank heat styling: lower rank (closer to 1) = greener.
 * teamCount defaults to ~FBS size for normalization.
 */
export function rankHeatStyle(
  rank: number | null | undefined,
  teamCount = 138,
): { background: string; color: string } {
  if (rank == null || Number.isNaN(rank)) {
    return { background: "transparent", color: "#64748b" };
  }
  const t = (rank - 1) / Math.max(1, teamCount - 1);
  if (t <= 0.5) {
    const k = 1 - t * 2;
    return {
      background: `rgba(22,163,74,${0.10 + k * 0.28})`,
      color: k > 0.4 ? "#0f5132" : "#166534",
    };
  }
  const k = (t - 0.5) * 2;
  return {
    background: `rgba(220,38,38,${0.08 + k * 0.26})`,
    color: k > 0.4 ? "#7f1d1d" : "#991b1b",
  };
}

export function formatRankChange(
  previousRank: number | null | undefined,
  currentRank: number | null | undefined,
): { text: string; direction: "up" | "down" | "same" | "none" } {
  if (previousRank == null || currentRank == null) {
    return { text: "", direction: "none" };
  }
  const delta = previousRank - currentRank;
  if (delta > 0) return { text: `↑${delta}`, direction: "up" };
  if (delta < 0) return { text: `↓${Math.abs(delta)}`, direction: "down" };
  return { text: "—", direction: "same" };
}
