import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  /** Optional subtle tinted surface (section accent) instead of the plain white card. */
  surfaceClassName?: string;
}

const TONE_CLASSES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  neutral: "text-slate-900",
  positive: "text-emerald-700",
  negative: "text-rose-700",
};

export default function StatTile({ label, value, tone = "neutral", surfaceClassName }: StatTileProps) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 shadow-sm", surfaceClassName ?? "border-slate-200 bg-white")}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cn("mt-1 text-lg font-black tabular-nums", TONE_CLASSES[tone])}>{value}</div>
    </div>
  );
}
