export type SosRemainingBand =
  | "strong-difficult"
  | "moderate-difficult"
  | "neutral"
  | "moderate-easy"
  | "strong-easy"
  | "unavailable";

export function getSosBand(rank: number | null | undefined): SosRemainingBand {
  if (rank == null || !Number.isFinite(rank)) return "unavailable";
  if (rank <= 25) return "strong-difficult";
  if (rank <= 50) return "moderate-difficult";
  if (rank <= 88) return "neutral";
  if (rank <= 113) return "moderate-easy";
  return "strong-easy";
}

/**
 * SOS is a rank-band scale over the ~133-team FBS population, not a favorable
 * percentile. It stays a band scale (its 25/50/88/113 rank cutoffs and the
 * red-difficult / green-easy palette are unchanged), but the band -> visual
 * mapping and the legend are now driven from one place — `SOS_BAND_STYLES` —
 * so the legend can never drift from the cells (docs/TABLE_CONVENTIONS.md
 * section H). Direction: a favorable (easy) remaining schedule reads green,
 * an unfavorable (difficult) one reads red — consistent with JKB Heat
 * (gold/green favorable, red unfavorable; docs/DECISIONS.md KS-010).
 *
 * Full re-expression onto the shared JKB Heat tones is deferred: it is a
 * visual change across four CFB components that needs browser sign-off, not a
 * mechanical swap.
 */
const SOS_BAND_STYLES: Record<SosRemainingBand, { className: string; label: string }> = {
  "strong-difficult": { className: "bg-rose-100/80 text-rose-900", label: "Toughest (1-25)" },
  "moderate-difficult": { className: "bg-orange-50 text-orange-900", label: "Tough (26-50)" },
  neutral: { className: "bg-slate-50 text-slate-600", label: "Neutral (51-88)" },
  "moderate-easy": { className: "bg-emerald-50 text-emerald-800", label: "Easy (89-113)" },
  "strong-easy": { className: "bg-emerald-100/80 text-emerald-900", label: "Easiest (114+)" },
  unavailable: { className: "text-slate-500", label: "No data" },
};

export function getSosHeatClass(rank: number | null | undefined): string {
  return SOS_BAND_STYLES[getSosBand(rank)].className;
}

/** Legend rows, difficult -> easy, generated from the same band styles the cells use. */
export const SOS_HEAT_LEGEND = (
  [
    "strong-difficult",
    "moderate-difficult",
    "neutral",
    "moderate-easy",
    "strong-easy",
  ] as const
).map((band) => ({ band, ...SOS_BAND_STYLES[band] }));

/** Backward-compatible aliases for existing consumers. */
export const getSosRemainingBand = getSosBand;
export const getSosRemainingHeatClass = getSosHeatClass;
