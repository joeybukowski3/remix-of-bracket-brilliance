import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";

function tierBadge(tier: PitcherRegressionData["regressionTier"]) {
  const config: Record<PitcherRegressionData["regressionTier"], { bg: string; text: string; label: string }> = {
    extreme_positive: { bg: "bg-green-50", text: "text-green-700", label: "Regressing" },
    strong_positive: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Likely Regress" },
    slight_positive: { bg: "bg-lime-50", text: "text-lime-700", label: "Slight Risk" },
    neutral: { bg: "bg-slate-50", text: "text-slate-600", label: "Neutral" },
    slight_negative: { bg: "bg-amber-50", text: "text-amber-700", label: "Slight Edge" },
    strong_negative: { bg: "bg-orange-50", text: "text-orange-700", label: "Improving" },
    extreme_negative: { bg: "bg-red-50", text: "text-red-700", label: "Massively Improving" },
  };
  const c = config[tier];
  return { bg: c.bg, text: c.text, label: c.label };
}

export default function MlbPitcherRegressionTable({ pitchers }: { pitchers: PitcherRegressionData[] }) {
  if (pitchers.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">No pitcher regression data available for today.</p>
      </div>
    );
  }

  // Sort by |regression score| descending — most interesting first
  const sorted = [...pitchers].sort((a, b) => Math.abs(b.regressionScore) - Math.abs(a.regressionScore));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-bold text-slate-700">Pitcher</th>
            <th className="px-3 py-3 text-center font-bold text-slate-700">ERA</th>
            <th className="px-3 py-3 text-center font-bold text-slate-700">xFIP</th>
            <th className="px-3 py-3 text-center font-bold text-slate-700">SIERA</th>
            <th className="px-3 py-3 text-center font-bold text-slate-700">K-BB%</th>
            <th className="px-3 py-3 text-center font-bold text-slate-700">LOB%</th>
            <th className="px-3 py-3 text-center font-bold text-slate-700">HR/FB%</th>
            <th className="px-3 py-3 text-center font-bold text-slate-700">BABIP</th>
            <th className="px-4 py-3 text-center font-bold text-slate-700">Regression</th>
            <th className="px-4 py-3 text-left font-bold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pitcher, i) => {
            const badge = tierBadge(pitcher.regressionTier);
            const colors = getMlbTeamColors(pitcher.team);

            return (
              <tr key={pitcher.pitcherId || i} className={i % 2 === 1 ? "bg-slate-50/40" : ""}>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: colors.primary }}>
                      {pitcher.team.slice(0, 2)}
                    </div>
                    {pitcher.name}
                  </div>
                </td>
                <td className="px-3 py-3 text-center font-semibold text-slate-900">
                  {pitcher.era != null ? pitcher.era.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-3 text-center text-slate-600">
                  {pitcher.xfip != null ? pitcher.xfip.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-3 text-center text-slate-600">
                  {pitcher.siera != null ? pitcher.siera.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-3 text-center text-slate-600">
                  {pitcher.kbb != null ? `${pitcher.kbb.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-3 text-center text-slate-600">
                  {pitcher.strandRate != null ? `${pitcher.strandRate.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-3 text-center text-slate-600">
                  {pitcher.hrfb != null ? `${pitcher.hrfb.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-3 text-center text-slate-600">
                  {pitcher.babip != null ? pitcher.babip.toFixed(3) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`font-extrabold text-lg ${pitcher.regressionScore < 0 ? "text-green-600" : pitcher.regressionScore > 0 ? "text-red-600" : "text-slate-600"}`}>
                      {pitcher.regressionScore > 0 ? "+" : ""}{pitcher.regressionScore}
                    </span>
                    <span className="text-[10px] text-slate-500">({pitcher.regressionScore < 0 ? "overperforming" : pitcher.regressionScore > 0 ? "underperforming" : "neutral"})</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-md px-2.5 py-1 text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] text-slate-600">
          <strong>Regression Score:</strong> -10 = massively outperforming (due to regress down) • 0 = sustainable • +10 = massively underperforming (due to improve)
        </p>
      </div>
    </div>
  );
}
