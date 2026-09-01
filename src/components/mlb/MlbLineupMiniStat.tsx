import { getGoodnessToneStyle, type MlbGoodnessTone } from "@/lib/mlb/mlbDisplayHelpers";

/**
 * These lineup rates are a goodness read, not a hot/cold read: a better AVG /
 * OBP / SLG or a lower K% is favorable. Thresholds are unchanged from the
 * original mapping; only the color direction is corrected to JKB Heat
 * (favorable = green, unfavorable = red) per DECISIONS.md KS-010.
 */
function getTone(label: string, value: string): MlbGoodnessTone {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return "neutral";

  if (label === "K%") {
    if (numeric <= 18) return "favorable";
    if (numeric >= 25) return "unfavorable";
    return "neutral";
  }

  if (label === "AVG") {
    if (numeric >= 0.270) return "favorable";
    if (numeric <= 0.220) return "unfavorable";
  }

  if (label === "OBP") {
    if (numeric >= 0.340) return "favorable";
    if (numeric <= 0.290) return "unfavorable";
  }

  if (label === "SLG") {
    if (numeric >= 0.450) return "favorable";
    if (numeric <= 0.370) return "unfavorable";
  }

  return "neutral";
}

export default function MlbLineupMiniStat({ label, value }: { label: string; value: string }) {
  const toneStyle = getGoodnessToneStyle(getTone(label, value));

  return (
    <div className="min-w-0 rounded-lg px-2 py-1 text-center" style={toneStyle}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
