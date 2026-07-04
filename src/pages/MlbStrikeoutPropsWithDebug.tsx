import { useEffect, useState } from "react";
import MlbStrikeoutProps from "./MlbStrikeoutProps";

type WorkloadDebugRow = {
  pitcher: string;
  team: string;
  opponent: string;
  projection?: {
    expectedBF?: number | null;
    workloadOnlyProjectedKs?: number | null;
    teamAdjustedKRate?: number | null;
    fullShadowProjectedKs?: number | null;
    teamAdjustmentKsDelta?: number | null;
  };
  confidence?: { grade?: string | null };
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
    fetch("/data/mlb/k-workload-shadow.json", { cache: "no-store" })
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
          <h2 className="text-base font-black text-slate-950">Workload + Team K Shadow</h2>
        </div>
        <p className="text-xs text-slate-600">{payload?.date ?? "Loading"} · {rows.length} pitchers</p>
      </div>
      {error ? (
        <p className="px-4 py-4 text-sm font-semibold text-red-700">Unable to load shadow data: {error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Pitcher</th>
                <th className="px-3 py-2 text-center">Expected BF</th>
                <th className="px-3 py-2 text-center">Workload Ks</th>
                <th className="px-3 py-2 text-center">Team K%</th>
                <th className="px-3 py-2 text-center">Full Ks</th>
                <th className="px-3 py-2 text-center">Δ Ks</th>
                <th className="px-3 py-2 text-center">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.pitcher}|${row.team}`} className="border-t border-sky-100 bg-white/70">
                  <td className="px-3 py-2 font-semibold text-slate-900">{row.pitcher} <span className="text-xs font-normal text-slate-500">{row.team} vs {row.opponent}</span></td>
                  <td className="px-3 py-2 text-center">{format(row.projection?.expectedBF, 1)}</td>
                  <td className="px-3 py-2 text-center">{format(row.projection?.workloadOnlyProjectedKs)}</td>
                  <td className="px-3 py-2 text-center">{Number.isFinite(row.projection?.teamAdjustedKRate) ? `${(Number(row.projection?.teamAdjustedKRate) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="px-3 py-2 text-center font-bold text-sky-900">{format(row.projection?.fullShadowProjectedKs)}</td>
                  <td className="px-3 py-2 text-center">{Number.isFinite(row.projection?.teamAdjustmentKsDelta) ? `${Number(row.projection?.teamAdjustmentKsDelta) >= 0 ? "+" : ""}${Number(row.projection?.teamAdjustmentKsDelta).toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-2 text-center">{row.confidence?.grade ?? "—"}</td>
                </tr>
              ))}
              {!rows.length && !error ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading workload shadow data…</td></tr>
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
