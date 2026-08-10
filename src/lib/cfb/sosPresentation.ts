export type SosRemainingBand =
  | "strong-difficult"
  | "moderate-difficult"
  | "neutral"
  | "moderate-easy"
  | "strong-easy"
  | "unavailable";

export function getSosRemainingBand(rank: number | null | undefined): SosRemainingBand {
  if (rank == null || !Number.isFinite(rank)) return "unavailable";
  if (rank <= 25) return "strong-difficult";
  if (rank <= 50) return "moderate-difficult";
  if (rank <= 88) return "neutral";
  if (rank <= 113) return "moderate-easy";
  return "strong-easy";
}

export function getSosRemainingHeatClass(rank: number | null | undefined): string {
  switch (getSosRemainingBand(rank)) {
    case "strong-difficult":
      return "bg-rose-100/80 text-rose-900";
    case "moderate-difficult":
      return "bg-orange-50 text-orange-900";
    case "neutral":
      return "bg-slate-50 text-slate-600";
    case "moderate-easy":
      return "bg-emerald-50 text-emerald-800";
    case "strong-easy":
      return "bg-emerald-100/80 text-emerald-900";
    default:
      return "text-slate-500";
  }
}
