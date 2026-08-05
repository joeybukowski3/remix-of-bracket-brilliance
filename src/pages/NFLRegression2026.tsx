import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { formatSigned, getNflSeasonGuide } from "@/lib/nfl/guideData";
import type { NflRegressionSignal } from "@/lib/nfl/guideLabels";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflSection from "@/components/nfl/ui/NflSection";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";

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
    <>
        <NflPageHeader
          eyebrow="2026 NFL Guide"
          title="Fluke or for real?"
          description="This dashboard compares each team's 2025 wins with a fresh 2026 baseline built from underlying strength and schedule. Large positive gaps flag bounce-back potential; large negative gaps flag teams that may have won above their current profile."
        />

        <NflSection
          title="Regression board"
          subtitle="All 32 teams, filtered and sorted."
          headerExtra={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <NflFilterChips label="Filter by signal" options={filters} value={filter} onChange={setFilter} />
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                Sort
                <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                  <option value="gap">Largest record correction</option>
                  <option value="edge">Largest market edge</option>
                  <option value="power">Power rank</option>
                </select>
              </label>
            </div>
          }
          bodyClassName="!px-0"
        >
          <NflTableScroller label="Regression board for all 32 teams">
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr className={NFL_TABLE_HEAD_ROW}><th scope="col" className="px-3 py-2 text-left">Team</th><th scope="col" className="px-2 py-2">2025</th><th scope="col" className="px-2 py-2">2026 model</th><th scope="col" className="px-2 py-2">Record gap</th><th scope="col" className="px-2 py-2">Signal</th><th scope="col" className="px-2 py-2">Power</th><th scope="col" className="px-2 py-2">Off</th><th scope="col" className="px-2 py-2">Def</th><th scope="col" className="px-2 py-2">Schedule</th><th scope="col" className="px-2 py-2">Market</th><th scope="col" className="px-2 py-2">Edge</th><th scope="col" className="px-2 py-2">Lean</th></tr></thead>
              <tbody>{rows.map((team) => <tr key={team.abbr} className={NFL_TABLE_ROW}><td className="px-3 py-2"><Link to={`/nfl/guide/team/${team.slug}`} className="flex items-center gap-2.5 font-semibold text-slate-900 hover:text-sky-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"><img src={nflLogoUrl(team.abbr)} alt="" className="h-7 w-7 object-contain" />{team.teamName}</Link></td><td className="text-center tabular-nums text-slate-700">{team.record2025}</td><td className="text-center font-semibold tabular-nums">{team.projectedWins.toFixed(1)}</td><td className={`text-center font-semibold tabular-nums ${team.regressionGap > 0 ? "text-emerald-700" : team.regressionGap < 0 ? "text-red-700" : "text-slate-500"}`}>{formatSigned(team.regressionGap)}</td><td className="text-center"><SignalBadge signal={team.regressionSignal} /></td><td className="text-center tabular-nums text-slate-700">#{team.powerRank}</td><td className="text-center tabular-nums text-slate-700">#{team.offenseRank}</td><td className="text-center tabular-nums text-slate-700">#{team.defenseRank}</td><td className="text-center tabular-nums text-slate-700">#{team.scheduleRank ?? "—"}</td><td className="text-center tabular-nums text-slate-700">{team.marketWinTotal?.toFixed(1) ?? "—"}</td><td className="text-center font-semibold tabular-nums">{team.modelVsMarketGap == null ? "—" : formatSigned(team.modelVsMarketGap)}</td><td className={`text-center font-semibold ${team.recommendationLabel === "Over" ? "text-emerald-700" : team.recommendationLabel === "Under" ? "text-red-700" : "text-slate-500"}`}>{team.recommendationLabel}</td></tr>)}</tbody>
            </table>
          </NflTableScroller>
        </NflSection>

        <NflSection title="How to read the signals" collapse="mobile">
          <div className="grid gap-4 lg:grid-cols-3">
            <Explainer title="Bounce Back" body="The projected-win baseline is at least 1.5 wins above the team's 2025 result. These teams may have room to improve through better health, normal close-game variance, an easier schedule or improvement from a weak unit." tone="green" />
            <Explainer title="Regression" body="The baseline is at least 1.5 wins below the 2025 result. That does not automatically mean an Under, but it asks whether the team can sustain its record when power rating and schedule are less favorable." tone="red" />
            <Explainer title="Stable" body="The 2025 result and 2026 baseline are within 1.5 wins. For these teams, injuries, quarterback changes, coaching and the actual price matter more than broad regression theory." tone="neutral" />
          </div>
        </NflSection>

        <NflSection title="How our version differs" collapse="always" defaultOpen={false}>
          <p className="text-[13px] leading-6 text-slate-600">Instead of importing historical betting systems as fixed rules, this page uses a repeatable team-level comparison: 2025 wins versus a transparent 2026 projection. The projection starts at 8.5 wins, adjusts for composite team strength, then applies a smaller schedule adjustment where #1 is hardest and #32 is easiest. It is intended as a screening tool, not a final bet.</p>
        </NflSection>
    </>
  );
}

function SignalBadge({ signal }: { signal: NflRegressionSignal }) {
  // Colour is paired with the signal's own word, never carrying the meaning alone.
  const cls = signal === "Bounce Back" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : signal === "Regression" ? "border-red-300 bg-red-50 text-red-800" : "border-slate-300 bg-slate-50 text-slate-600";
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{signal}</span>;
}
function Explainer({ title, body, tone }: { title: string; body: string; tone: "green" | "red" | "neutral" }) {
  const rule = tone === "green" ? "border-l-emerald-500" : tone === "red" ? "border-l-red-500" : "border-l-slate-300";
  return <div className={`border-l-2 pl-3 ${rule}`}><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-[13px] leading-6 text-slate-600">{body}</p></div>;
}
