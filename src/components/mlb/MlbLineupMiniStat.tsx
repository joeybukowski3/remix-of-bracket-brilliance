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
    <div className={`min-w-0 rounded-xl border px-2.5 py-1.5 text-center ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}
