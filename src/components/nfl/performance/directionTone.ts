import type { StarterPropDirection } from "@/types/nfl/performance";

export const directionTone: Record<StarterPropDirection, { row: string; badge: string; detail: string }> = {
  OVER: { row: "border-l border-l-emerald-300 bg-emerald-50/30", badge: "border-emerald-200 bg-emerald-50 text-emerald-800", detail: "border-emerald-200 bg-emerald-50/50" },
  UNDER: { row: "border-l border-l-rose-300 bg-rose-50/30", badge: "border-rose-200 bg-rose-50 text-rose-800", detail: "border-rose-200 bg-rose-50/50" },
  NEUTRAL: { row: "border-l border-l-slate-200 bg-slate-50/30", badge: "border-slate-200 bg-slate-50 text-slate-600", detail: "border-slate-200 bg-slate-50" },
};
