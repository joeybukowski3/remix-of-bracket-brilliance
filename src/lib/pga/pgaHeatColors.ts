/**
 * Heatmap colour treatment for PGA percentile cells.
 *
 * Thresholds are unchanged from the original inline-style treatment
 * (>=75 strong, >=50 good, <=25 low, otherwise neutral). Only the colours
 * changed: lighter emerald/rose fills with dark, heavy text so the numerals
 * stay legible instead of dark-green-on-white and saturated-red fills.
 */
export function percentileHeatClass(value: number) {
  if (value >= 75) return "pga-heat-strong bg-emerald-300 text-emerald-950";
  if (value >= 50) return "pga-heat-good bg-emerald-100 text-emerald-900";
  if (value <= 25) return "pga-heat-low bg-rose-100 text-rose-900";
  return "pga-heat-neutral bg-slate-100 text-slate-700";
}
