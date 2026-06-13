import { getStatToneClasses, type MlbStatTone } from "@/lib/mlb/mlbDisplayHelpers";

function getTone(label: string, value: string): MlbStatTone {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return "neutral";

  if (label === "K%") {
    if (numeric <= 18) return "positive";
    if (numeric >= 25) return "negative";
    return "neutral";
  }

  if (label === "AVG") {
    if (numeric >= 0.270) return "positive";
    if (numeric <= 0.220) return "negative";
  }

  if (label === "OBP") {
    if (numeric >= 0.340) return "positive";
    if (numeric <= 0.290) return "negative";
  }

  if (label === "SLG") {
    if (numeric >= 0.450) return "positive";
    if (numeric <= 0.370) return "negative";
  }

  return "neutral";
}

export default function MlbLineupMiniStat({ label, value }: { label: string; value: string }) {
  const toneClass = getStatToneClasses(getTone(label, value));

  return (
    <div className={`min-w-0 rounded-lg border px-2 py-1 text-center ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
