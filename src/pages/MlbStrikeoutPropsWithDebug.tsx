import { useEffect, useState } from "react";
import MlbStrikeoutProps from "./MlbStrikeoutProps";
import { cn } from "@/lib/utils";
import { evaluateKPropOverRecommendation } from "@/lib/mlb/kPropRecommendationEligibility";

type WorkloadDebugRow = {
  pitcher: string;
  team: string;
  opponent: string;
  workloadRole?: string | null;
  legacyProjectedIP?: number | null;
  candidateProjectedIP?: number | null;
  effectiveProjectedIP?: number | null;
  legacyProjectedKs?: number | null;
  candidateProjectedKs?: number | null;
  effectiveProjectedKs?: number | null;
  projectionSource?: string | null;
  projectionFallbackReason?: string | null;
  publicRecommendationEligible?: boolean;
  kLine?: number | null;
  workloadExpectedBF?: number | null;
  workloadConfidenceGrade?: string | null;
  workloadConfidenceScore?: number | null;
  teamAdjustedKRate?: number | null;
  workloadFlags?: string[] | null;
};

type WorkloadDebugPayload = {
  date?: string;
  pitchers?: WorkloadDebugRow[];
};

function WorkloadDebugPanel() {
  const enabled = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("workloadDebug") === "1";
  const [payload, setPayload] = useState<WorkloadDebugPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // hr-props-raw.json (not k-workload-shadow.json) is the source here --
    // it carries the already-blended legacy/candidate/effective fields the
    // wrapper writes per pitcher, which is what the live site actually uses.
    fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => { if (active) setPayload(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [enabled]);

  if (!enabled) return null;

  const rows = payload?.pitchers ?? [];
  const format = (value: number | null | undefined, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : "—";

  return (
    <section className="mx-auto my-4 max-w-[1600px] overflow-hidden rounded-xl border border-sky-300 bg-sky-50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Workload Debug</p>
          <h2 className="text-base font-black text-slate-950">Workload Role Safety + Effective Projection</h2>
        </div>
        <p className="text-xs text-slate-600">{payload?.date ?? "Loading"} · {rows.length} pitchers</p>
      </div>
      {error ? (
        <p className="px-4 py-4 text-sm font-semibold text-red-700">Unable to load raw data: {error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Pitcher</th>
                <th className="px-3 py-2 text-center">Role</th>
                <th className="px-3 py-2 text-center">Legacy IP</th>
                <th className="px-3 py-2 text-center">Candidate IP</th>
                <th className="px-3 py-2 text-center">Effective IP</th>
                <th className="px-3 py-2 text-center">Legacy Ks</th>
                <th className="px-3 py-2 text-center">Candidate Ks</th>
                <th className="px-3 py-2 text-center">Effective Ks</th>
                <th className="px-3 py-2 text-center">Source</th>
                <th className="px-3 py-2 text-center">Fallback Reason</th>
                <th className="px-3 py-2 text-center">Eligible</th>
                <th className="px-3 py-2 text-center">Raw Edge</th>
                <th className="px-3 py-2 text-center">Adj Edge</th>
                <th className="px-3 py-2 text-center">Workload Rel.</th>
                <th className="px-3 py-2 text-center">Rec. Eligible</th>
                <th className="px-3 py-2 text-center">Rec. Tier</th>
                <th className="px-3 py-2 text-center">Exclusion Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // Recommendation-quality evaluation for Top Over eligibility.
                // Matchup-signal inputs (strikeoutMatchupScore/opponentTeamKRate)
                // aren't present on the raw pitcher record itself -- they're
                // computed client-side against batters data -- so the
                // exceptional-low-workload tier is conservatively approximated
                // here (it may show "excluded" in this table even when the
                // live page, which has that context, grants the exception).
                const evaluation = evaluateKPropOverRecommendation({
                  workloadRole: row.workloadRole ?? null,
                  expectedIP: row.effectiveProjectedIP ?? null,
                  expectedBF: row.workloadExpectedBF ?? null,
                  projectedKs: row.effectiveProjectedKs ?? null,
                  kLine: row.kLine ?? null,
                  publicRecommendationEligible: row.publicRecommendationEligible,
                  workloadConfidenceGrade: row.workloadConfidenceGrade ?? null,
                  workloadConfidenceScore: row.workloadConfidenceScore ?? null,
                  teamAdjustedKRate: row.teamAdjustedKRate ?? null,
                  workloadFlags: row.workloadFlags ?? null,
                  strikeoutMatchupScore: null,
                  opponentTeamKRate: null,
                });
                return (
                  <tr key={`${row.pitcher}|${row.team}`} className={cn("border-t border-sky-100", row.publicRecommendationEligible === false ? "bg-red-50" : "bg-white/70")}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.pitcher} <span className="text-xs font-normal text-slate-500">{row.team} vs {row.opponent}</span></td>
                    <td className="px-3 py-2 text-center">{row.workloadRole ?? "—"}</td>
                    <td className="px-3 py-2 text-center">{format(row.legacyProjectedIP, 1)}</td>
                    <td className="px-3 py-2 text-center">{format(row.candidateProjectedIP, 1)}</td>
                    <td className="px-3 py-2 text-center font-bold text-sky-900">{format(row.effectiveProjectedIP, 1)}</td>
                    <td className="px-3 py-2 text-center">{format(row.legacyProjectedKs, 1)}</td>
                    <td className="px-3 py-2 text-center">{format(row.candidateProjectedKs, 1)}</td>
                    <td className="px-3 py-2 text-center font-bold text-sky-900">{format(row.effectiveProjectedKs, 1)}</td>
                    <td className="px-3 py-2 text-center">{row.projectionSource ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-[11px]">{row.projectionFallbackReason ?? "—"}</td>
                    <td className="px-3 py-2 text-center">{row.publicRecommendationEligible === false ? "❌" : "✅"}</td>
                    <td className="px-3 py-2 text-center">{format(evaluation.rawEdge, 2)}</td>
                    <td className="px-3 py-2 text-center font-bold text-sky-900">{format(evaluation.adjustedRecommendationEdge, 2)}</td>
                    <td className="px-3 py-2 text-center">{format(evaluation.workloadScore, 2)}</td>
                    <td className="px-3 py-2 text-center">{evaluation.eligible ? "✅" : "❌"}</td>
                    <td className="px-3 py-2 text-center">{evaluation.tier}</td>
                    <td className="px-3 py-2 text-center text-[11px]">{evaluation.reason ?? "—"}</td>
                  </tr>
                );
              })}
              {!rows.length && !error ? (
                <tr><td colSpan={17} className="px-4 py-6 text-center text-slate-500">Loading raw pitcher data…</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function MlbStrikeoutPropsWithDebug() {
  return (
    <>
      <WorkloadDebugPanel />
      <MlbStrikeoutProps />
    </>
  );
}
