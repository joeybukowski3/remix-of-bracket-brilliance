import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import type { PitcherRegressionData } from "@/lib/mlb/mlbPitcherRegression";
import { cn } from "@/lib/utils";

/**
 * score < 0 = overperforming (ERA likely to rise) → blue shades
 * score > 0 = underperforming (ERA likely to fall) → green shades
 * -0.5 to 0.5 = neutral → gray
 */
export function regressionPillStyle(score: number): { bg: string; color: string; label: string } {
  if (score >= 6.5)  return { bg: "#14532d", color: "#bbf7d0", label: "Strongly Improving" };
  if (score >= 3)    return { bg: "#166534", color: "#86efac", label: "Likely Improving" };
  if (score >= 0.5)  return { bg: "#dcfce7", color: "#15803d", label: "Slight Upside" };
  if (score > -0.5)  return { bg: "#f1f5f9", color: "#64748b", label: "Neutral" };
  if (score >= -3)   return { bg: "#dbeafe", color: "#1d4ed8", label: "Slight Risk" };
  if (score >= -6.5) return { bg: "#1e3a8a", color: "#93c5fd", label: "Likely Regressing" };
  return               { bg: "#172554", color: "#60a5fa", label: "Strongly Regressing" };
}

export default function MlbPitcherRegressionTable({ pitchers }: { pitchers: PitcherRegressionData[] }) {
  if (pitchers.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">No pitcher regression data available. Data refreshes at 3 AM, 10 AM, and 1 PM ET.</p>
      </div>
    );
  }

  // Sort by biggest absolute regression candidate first
  const sorted = [...pitchers].sort((a, b) => Math.abs(b.regressionScore) - Math.abs(a.regressionScore));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">Pitcher</th>
            <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Regr Score</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">ERA</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">xFIP</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500" title="Expected ERA from Statcast (Baseball Savant)">xERA</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500" title="Strikeout% minus Walk%">K-BB%</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500" title="Left-on-base % — league avg ~73%">LOB%</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500" title="HR per fly ball — league avg ~10.5%">HR/FB%</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500" title="Batting avg on balls in play — pitcher norm ~.300">BABIP</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pitcher, i) => {
            const pill = regressionPillStyle(pitcher.regressionScore);
            const expectedEra = pitcher.xera ?? pitcher.xfip;

            return (
              <tr key={pitcher.pitcherId ?? i} className={i % 2 === 1 ? "bg-slate-50/40" : ""}>
                <td className={cn("sticky left-0 z-10 border-r border-slate-100 px-3 py-2", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                  <div className="flex items-center gap-2">
                    <MlbTeamLogo team={pitcher.team} size={22} />
                    <span className="font-semibold text-slate-900 text-[12px]">{pitcher.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tabular-nums" style={{ backgroundColor: pill.bg, color: pill.color }}>
                    {pitcher.regressionScore > 0 ? "+" : ""}{pitcher.regressionScore}
                  </span>
                  <div className="mt-0.5 text-[9px] font-semibold" style={{ color: pill.color !== "#64748b" ? pill.color : "#94a3b8" }}>{pill.label}</div>
                </td>
                {/* ERA — highlight if far from expected */}
                <td className="px-3 py-2 text-center">
                  <span className={`text-[12px] font-bold tabular-nums ${expectedEra != null && Math.abs(pitcher.era! - expectedEra) > 1.5 ? (pitcher.era! < expectedEra ? "text-blue-600" : "text-orange-600") : "text-slate-900"}`}>
                    {pitcher.era != null ? pitcher.era.toFixed(2) : "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-[12px] tabular-nums text-slate-500">
                  {pitcher.xfip != null ? pitcher.xfip.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-center text-[12px] tabular-nums text-slate-500">
                  {pitcher.xera != null ? (
                    <span className="font-semibold text-purple-700">{pitcher.xera.toFixed(2)}</span>
                  ) : (
                    <span className="text-slate-300" title="xERA requires Baseball Savant data — updates daily">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-[12px] tabular-nums text-slate-500">
                  {pitcher.kbb != null ? `${pitcher.kbb.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-center text-[12px] tabular-nums text-slate-500">
                  {pitcher.strandRate != null ? (
                    <span className={pitcher.strandRate > 80 ? "font-bold text-blue-600" : pitcher.strandRate < 65 ? "font-bold text-orange-600" : ""}>{pitcher.strandRate.toFixed(1)}%</span>
                  ) : (
                    <span className="text-slate-300" title="LOB% updates daily from MLB API">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-[12px] tabular-nums text-slate-500">
                  {pitcher.hrfb != null ? (
                    <span className={pitcher.hrfb < 7 ? "font-bold text-blue-600" : pitcher.hrfb > 14 ? "font-bold text-orange-600" : ""}>{pitcher.hrfb.toFixed(1)}%</span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 text-center text-[12px] tabular-nums text-slate-500">
                  {pitcher.babip != null ? (
                    <span className={pitcher.babip < 0.27 ? "font-bold text-blue-600" : pitcher.babip > 0.32 ? "font-bold text-orange-600" : ""}>{pitcher.babip.toFixed(3)}</span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50">
            <td colSpan={9} className="px-4 py-2 text-[9px] text-slate-500">
              <strong>Score:</strong> Negative (blue) = ERA overperforming → expect regression up · Positive (green) = ERA underperforming → expect improvement · <span className="text-blue-600 font-bold">Blue values</span> = lucky stat · <span className="text-orange-600 font-bold">Orange values</span> = unlucky stat · xERA & LOB% update daily from external sources
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
