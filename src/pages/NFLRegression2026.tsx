import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { formatSigned, getNflSeasonGuide } from "@/lib/nfl/guideData";
import type { NflRegressionSignal } from "@/lib/nfl/guideLabels";

const GUIDE_TEAMS = getNflSeasonGuide(2026)!.teams;

const filters: Array<"All" | NflRegressionSignal> = ["All", "Bounce Back", "Regression", "Stable"];

export default function NFLRegression2026() {
  usePageSeo({
    title: "2026 NFL Fluke or Real Regression Dashboard | Joe Knows Ball",
    description: "Compare every NFL team's 2025 record with the Joe Knows Ball 2026 projected-win baseline, schedule rank, power rating and win total.",
    path: "/nfl/guide/regression",
  });
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [sort, setSort] = useState<"gap" | "edge" | "power">("gap");

  const rows = useMemo(() => {
    const selected = filter === "All" ? GUIDE_TEAMS : GUIDE_TEAMS.filter((team) => team.regressionSignal === filter);
    return [...selected].sort((a, b) => {
      if (sort === "edge") return Math.abs(b.modelVsMarketGap ?? 0) - Math.abs(a.modelVsMarketGap ?? 0);
      if (sort === "power") return a.powerRank - b.powerRank;
      return Math.abs(b.regressionGap) - Math.abs(a.regressionGap);
    });
  }, [filter, sort]);

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
        <section className="border-b border-slate-800 bg-slate-950 text-white">
          <div className="mx-auto max-w-[1500px] px-4 py-9 sm:px-6 lg:px-8">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">2026 NFL Guide</div>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Fluke or for real?</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">This dashboard compares each team's 2025 wins with a fresh 2026 baseline built from underlying strength and schedule. Large positive gaps flag bounce-back potential; large negative gaps flag teams that may have won above their current profile.</p>
          </div>
        </section>

        <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">{filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-black ${filter === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>{item}</button>)}</div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"><option value="gap">Largest record correction</option><option value="edge">Largest market edge</option><option value="power">Power rank</option></select></label>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><th className="px-3 py-3 text-left">Team</th><th>2025</th><th>2026 model</th><th>Record gap</th><th>Signal</th><th>Power</th><th>Off</th><th>Def</th><th>Schedule</th><th>Market</th><th>Edge</th><th>Lean</th></tr></thead>
                <tbody>{rows.map((team) => <tr key={team.abbr} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-3 py-3"><Link to={`/nfl/guide/team/${team.slug}`} className="flex items-center gap-3 font-black text-slate-900"><img src={nflLogoUrl(team.abbr)} alt="" className="h-8 w-8 object-contain" />{team.teamName}</Link></td><td className="text-center font-bold">{team.record2025}</td><td className="text-center font-black">{team.projectedWins.toFixed(1)}</td><td className={`text-center font-black ${team.regressionGap > 0 ? "text-emerald-700" : team.regressionGap < 0 ? "text-red-600" : "text-slate-500"}`}>{formatSigned(team.regressionGap)}</td><td className="text-center"><SignalBadge signal={team.regressionSignal} /></td><td className="text-center">#{team.powerRank}</td><td className="text-center">#{team.offenseRank}</td><td className="text-center">#{team.defenseRank}</td><td className="text-center">#{team.scheduleRank ?? "—"}</td><td className="text-center">{team.marketWinTotal?.toFixed(1) ?? "—"}</td><td className="text-center font-black">{team.modelVsMarketGap == null ? "—" : formatSigned(team.modelVsMarketGap)}</td><td className={`text-center font-black ${team.recommendationLabel === "Over" ? "text-emerald-700" : team.recommendationLabel === "Under" ? "text-red-600" : "text-slate-500"}`}>{team.recommendationLabel}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="mt-7 grid gap-5 lg:grid-cols-3">
            <Explainer title="Bounce Back" body="The projected-win baseline is at least 1.5 wins above the team's 2025 result. These teams may have room to improve through better health, normal close-game variance, an easier schedule or improvement from a weak unit." tone="green" />
            <Explainer title="Regression" body="The baseline is at least 1.5 wins below the 2025 result. That does not automatically mean an Under, but it asks whether the team can sustain its record when power rating and schedule are less favorable." tone="red" />
            <Explainer title="Stable" body="The 2025 result and 2026 baseline are within 1.5 wins. For these teams, injuries, quarterback changes, coaching and the actual price matter more than broad regression theory." tone="blue" />
          </section>

          <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">How our version differs</h2>
            <p className="mt-2">Instead of importing historical betting systems as fixed rules, this page uses a repeatable team-level comparison: 2025 wins versus a transparent 2026 projection. The projection starts at 8.5 wins, adjusts for composite team strength, then applies a smaller schedule adjustment where #1 is hardest and #32 is easiest. It is intended as a screening tool, not a final bet.</p>
          </section>
        </div>
    </main>
  );
}

function SignalBadge({ signal }: { signal: NflRegressionSignal }) { const cls = signal === "Bounce Back" ? "bg-emerald-100 text-emerald-800" : signal === "Regression" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"; return <span className={`rounded-full px-2 py-1 text-[10px] font-black ${cls}`}>{signal}</span>; }
function Explainer({ title, body, tone }: { title: string; body: string; tone: "green" | "red" | "blue" }) { const cls = tone === "green" ? "border-emerald-200 bg-emerald-50" : tone === "red" ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"; return <div className={`rounded-2xl border p-5 ${cls}`}><h3 className="font-black text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-700">{body}</p></div>; }
