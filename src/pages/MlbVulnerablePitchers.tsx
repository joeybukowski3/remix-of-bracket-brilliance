import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import MlbPitcherRegressionTable, { regressionPillStyle } from "@/components/mlb/MlbPitcherRegressionTable";
import { formatModelTimestamp } from "@/components/mlb/MlbPropModelComponents";
import { usePageSeo } from "@/hooks/usePageSeo";
import { usePitcherRegression } from "@/hooks/usePitcherRegression";

/**
 * Dedicated page for the existing Pitcher Regression model. Reuses
 * usePitcherRegression (the same hook already powering the embedded
 * "Pitcher Regression Analysis" section on the MLB home page) and
 * MlbPitcherRegressionTable (the same table component) as-is -- this page
 * adds discoverability, a summary row, an explanatory card, and a search
 * filter only. It computes nothing new: no score, tier, or threshold here
 * is defined outside those two existing modules, and the table's own sort
 * order (biggest |regressionScore| first) is untouched.
 *
 * Score direction (see mlbPitcherRegression.ts / MlbPitcherRegressionTable.tsx):
 * negative score = overperforming -> due for regression (ERA likely to rise,
 * i.e. get worse) -- this is the "vulnerable" direction. Positive score =
 * underperforming -> due for improvement (ERA likely to fall). The most
 * vulnerable pitcher on the slate is therefore the one with the LOWEST
 * (most negative) regressionScore, not the highest.
 */
export default function MlbVulnerablePitchers() {
  usePageSeo({
    title: "MLB Vulnerable Pitchers Today 2026 — Regression Model | Joe Knows Ball",
    description:
      "Today's MLB starters ranked by regression risk, comparing ERA against xFIP, xERA, K-BB%, strand rate, HR/FB%, and BABIP. Free pitcher regression model updated daily from MLB Stats API and Baseball Savant.",
    path: "/mlb/vulnerable-pitchers",
  });

  const { data, loading, generatedAt } = usePitcherRegression();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((pitcher) => pitcher.name.toLowerCase().includes(q) || pitcher.team.toLowerCase().includes(q));
  }, [data, search]);

  // Most vulnerable = lowest (most negative) regressionScore -- see the
  // score-direction note above. Not the same pitcher MlbPitcherRegressionTable
  // sorts to the top (it sorts by |regressionScore|, biggest mover either way).
  const mostVulnerable = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((worst, pitcher) => (pitcher.regressionScore < worst.regressionScore ? pitcher : worst));
  }, [data]);

  const summaryCells: Array<[string, string]> = [
    ["Pitchers analyzed", String(data.length)],
    [
      "Highest regression risk",
      mostVulnerable
        ? `${mostVulnerable.name} (${mostVulnerable.regressionScore > 0 ? "+" : ""}${mostVulnerable.regressionScore.toFixed(1)})`
        : "—",
    ],
    ["Last updated", formatModelTimestamp(generatedAt)],
  ];

  const hasSearch = search.trim().length > 0;
  const searchHasNoMatches = !loading && data.length > 0 && filtered.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-4">
      <MlbNavHero />

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#10243f] px-4 py-4 text-white sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-200">Pitcher Vulnerability Model</div>
              <h1 className="mt-1 text-2xl font-black tracking-normal sm:text-3xl">MLB Vulnerable Pitchers</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100">
                Identifies today&apos;s starting pitchers whose results may be vulnerable based on ERA, expected metrics, contact quality, and regression signals.
              </p>
            </div>
            <Link to="/mlb" className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/15">
              Back to MLB
            </Link>
          </div>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          {summaryCells.map(([label, value]) => (
            <div key={label} className="bg-white px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
              <div className="mt-1 text-sm font-black text-slate-950">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="vulnerable-pitchers-guide-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h2 id="vulnerable-pitchers-guide-title" className="text-base font-black text-slate-900">How to read this page</h2>
        <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
          <p>
            A <strong>negative</strong> regression score means a pitcher is currently overperforming their expected metrics (xFIP/xERA) -- their ERA is lower than the underlying numbers support, which is the vulnerable, due-for-regression direction. The largest negative scores (labeled <strong>Strongly Regressing</strong> or <strong>Likely Regressing</strong>) are the pitchers most at risk of their results getting worse.
          </p>
          <p>
            A <strong>positive</strong> score means the opposite: a pitcher is currently underperforming their expected metrics, which points toward possible improvement rather than vulnerability.
          </p>
          <p>
            The table below is sorted by the size of that gap in either direction, since both extremes are meaningful -- look for the most negative scores and the &quot;Regressing&quot; tier label for genuine vulnerability signals.
          </p>
        </div>
      </section>

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
      ) : searchHasNoMatches ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-500">
            No pitchers match {hasSearch ? `"${search.trim()}"` : "your search"}. Try a different pitcher name or team.
          </p>
        </div>
      ) : (
        <MlbPitcherRegressionTable pitchers={filtered} />
      )}
    </div>
  );
}
