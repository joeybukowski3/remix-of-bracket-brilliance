interface StatTileProps {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}

const TONE_CLASSES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  neutral: "text-slate-900",
  positive: "text-emerald-700",
  negative: "text-rose-700",
};

export default function StatTile({ label, value, tone = "neutral" }: StatTileProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-black tabular-nums ${TONE_CLASSES[tone]}`}>{value}</div>
    </div>
  );
}
