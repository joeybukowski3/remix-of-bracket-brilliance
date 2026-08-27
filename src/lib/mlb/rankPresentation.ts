import { cn } from "@/lib/utils";

export function formatRankOrdinal(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return "N/A";
  const whole = Math.trunc(rank);
  const mod100 = Math.abs(whole) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${whole}th`;
  if (Math.abs(whole) % 10 === 1) return `${whole}st`;
  if (Math.abs(whole) % 10 === 2) return `${whole}nd`;
  if (Math.abs(whole) % 10 === 3) return `${whole}rd`;
  return `${whole}th`;
}

/** MLB's restrained best-to-worst rank heat ramp; the ordinal remains visible so color is supporting evidence only. */
export function mlbRankHeatClass(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank) || rank < 1) return "bg-slate-100 text-slate-500";
  if (rank <= 5) return "bg-emerald-100 text-emerald-900";
  if (rank <= 10) return "bg-teal-50 text-teal-900";
  if (rank <= 15) return "bg-lime-50 text-lime-900";
  if (rank <= 20) return "bg-amber-50 text-amber-900";
  if (rank <= 25) return "bg-orange-100 text-orange-900";
  return "bg-rose-100 text-rose-900";
}

export function rankHeatValueClass(rank: number | null | undefined, className?: string) {
  return cn("inline-flex min-w-10 items-center justify-center rounded px-1.5 py-0.5 font-black tabular-nums", mlbRankHeatClass(rank), className);
}
