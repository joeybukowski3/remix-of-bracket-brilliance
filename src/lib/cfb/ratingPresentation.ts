export type CfbRatingBand =
  | "strongest"
  | "strong"
  | "positive"
  | "neutral"
  | "soft"
  | "weak"
  | "unavailable";

export function getCfbRatingBand(value: number | null | undefined): CfbRatingBand {
  if (value == null || !Number.isFinite(value)) return "unavailable";
  if (value >= 90) return "strongest";
  if (value >= 80) return "strong";
  if (value >= 70) return "positive";
  if (value >= 60) return "neutral";
  if (value >= 50) return "soft";
  return "weak";
}

export function getCfbRatingHeatClass(value: number | null | undefined): string {
  switch (getCfbRatingBand(value)) {
    case "strongest":
      return "bg-emerald-200/80 text-emerald-950";
    case "strong":
      return "bg-emerald-100 text-emerald-900";
    case "positive":
      return "bg-emerald-50 text-emerald-800";
    case "neutral":
      return "bg-slate-50 text-slate-700";
    case "soft":
      return "bg-amber-50 text-amber-900";
    case "weak":
      return "bg-rose-100/80 text-rose-900";
    default:
      return "text-slate-500";
  }
}
