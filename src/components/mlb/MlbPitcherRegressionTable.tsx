import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";

/** 
 * score < 0 = overperforming (cooling down) → blue shades
 * score > 0 = underperforming (heating up)  → green shades
 * -0.5 to 0.5 = neutral → gray
 */
export function regressionPillStyle(score: number): { bg: string; color: string; label: string } {
  if (score >= 6.5)  return { bg: "#14532d", color: "#bbf7d0", label: "Strongly Improving" };
  if (score >= 3)    return { bg: "#166534", color: "#86efac", label: "Likely Improving" };
  if (score >= 0.5)  return { bg: "#dcfce7", color: "#15803d", label: "Slight Upside" };
  if (score > -0.5)  return { bg: "#f1f5f9", color: "#64748b", label: "Neutral" };
  if (score >= -3)   return { bg: "#dbeafe", color: "#1d4ed8", label: "Slight Risk" };
  if (score >= -6.5) return { bg: "#1e3a8a", color: "#93c5fd", label: "Likely Regressing" };
  return               { bg: "#1e2a5e", color: "#60a5fa", label: "Strongly Regressing" };
}

export default function MlbPitcherRegressionTable({ pitchers }: { pitchers: PitcherRegressionData[] }) {
  if (pitchers.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">No pitcher regression data available for today.</p>
      </div>
    );
  }

  const sorted = [...pitchers].sort((a, b) => Math.abs(b.regressionScore) - Math.abs(a.regressionScore));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Pitcher</th>
            <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">ERA</th>
            <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">xFIP</th>
            <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">xERA</th>
            <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">K-BB%</th>
            <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">LOB%</th>
            <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">HR/FB%</th>
            <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">BABIP</th>
            <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">Regr Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pitcher, i) => {
            const pill = regressionPillStyle(pitcher.regressionScore);
            const colors = getMlbTeamColors(pitcher.team);

            return (
              <tr key={pitcher.pitcherId || i} className={i % 2 === 1 ? "bg-slate-50/40" : ""}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: colors.primary }}>
                      {pitcher.team.slice(0, 2)}
                    </div>
                    <span className="font-semibold text-slate-900 text-[13px]">{pitcher.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center text-[13px] font-bold text-slate-900">
                  {pitcher.era != null ? pitcher.era.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2.5 text-center text-[13px] text-slate-500">
                  {pitcher.xfip != null ? pitcher.xfip.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2.5 text-center text-[13px] text-slate-500">
                  {(pitcher as any).xera != null ? (pitcher as any).xera.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2.5 text-center text-[13px] text-slate-500">
                  {pitcher.kbb != null ? `${pitcher.kbb.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-center text-[13px] text-slate-500">
                  {pitcher.strandRate != null ? `${pitcher.strandRate.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-center text-[13px] text-slate-500">
                  {pitcher.hrfb != null ? `${pitcher.hrfb.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-center text-[13px] text-slate-500">
                  {pitcher.babip != null ? pitcher.babip.toFixed(3) : "—"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className="inline-block rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                    style={{ backgroundColor: pill.bg, color: pill.color }}
                  >
                    {pitcher.regressionScore > 0 ? "+" : ""}{pitcher.regressionScore} · {pill.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <p className="text-[10px] text-slate-500">
          <strong>Regr Score:</strong> Negative (blue) = overperforming, due to regress down · Zero = sustainable · Positive (green) = underperforming, due to improve
        </p>
      </div>
    </div>
  );
}
