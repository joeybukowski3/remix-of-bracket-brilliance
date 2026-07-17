import { useMemo, useState } from "react";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import MlbPitcherRegressionTable from "@/components/mlb/MlbPitcherRegressionTable";
import { usePageSeo } from "@/hooks/usePageSeo";
import { usePitcherRegression } from "@/hooks/usePitcherRegression";

/**
 * Dedicated page for the existing Pitcher Regression model. Reuses
 * usePitcherRegression (the same hook already powering the embedded
 * "Pitcher Regression Analysis" section on the MLB home page) and
 * MlbPitcherRegressionTable (the same table component) as-is -- this page
 * adds discoverability and a search filter only. It computes nothing new:
 * no score, tier, or threshold here is defined outside those two existing
 * modules.
 */
export default function MlbVulnerablePitchers() {
  usePageSeo({
    title: "MLB Vulnerable Pitchers Today 2026 — Regression Model | Joe Knows Ball",
    description:
      "Today's MLB starters ranked by regression risk, comparing ERA against xFIP, xERA, K-BB%, strand rate, HR/FB%, and BABIP. Free pitcher regression model updated daily from MLB Stats API and Baseball Savant.",
    path: "/mlb/vulnerable-pitchers",
  });

  const { data, loading } = usePitcherRegression();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((pitcher) => pitcher.name.toLowerCase().includes(q) || pitcher.team.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-4">
      <MlbNavHero />

      <header>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Vulnerable Pitchers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Today&apos;s starters — ERA vs expected metrics (xFIP/xERA). Negative score = overperforming (regression risk), Positive = underperforming (improvement likely). Auto-generated from MLB Stats API + Baseball Savant.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pitcher or team"
          className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none transition focus:border-sky-300"
        />
        <span className="text-xs text-slate-500">{filtered.length} pitchers shown</span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading pitcher regression data…</div>
      ) : (
        <MlbPitcherRegressionTable pitchers={filtered} />
      )}
    </div>
  );
}
