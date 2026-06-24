import { Link, Navigate, useParams } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflGuideNav from "@/components/nfl/NflGuideNav";
import { usePageSeo } from "@/hooks/usePageSeo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import {
  NFL_GUIDE_DIVISIONS,
  NFL_GUIDE_TEAM_BY_SLUG,
  formatSigned,
  getScheduleDescription,
  type NflGuideTeam,
} from "@/lib/nfl/guide2026";

export default function NFLTeamGuide2026() {
  const { teamSlug = "" } = useParams();
  const team = NFL_GUIDE_TEAM_BY_SLUG.get(teamSlug);

  usePageSeo({
    title: team ? `${team.team} 2026 Preview, Win Total & Model | Joe Knows Ball` : "2026 NFL Team Preview | Joe Knows Ball",
    description: team ? `${team.team} 2026 team preview with projected wins, market edge, power ratings, schedule strength, regression outlook and three burning questions.` : "2026 NFL team preview.",
    path: `/nfl/guide/team/${teamSlug}`,
    noindex: !team,
  });

  if (!team) return <Navigate to="/nfl/guide" replace />;
  const divisionTeams = NFL_GUIDE_DIVISIONS.find((entry) => entry.division === team.division)?.teams ?? [];

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-50 pb-16">
        <section className="border-b border-slate-800 text-white" style={{ background: `linear-gradient(125deg, #020617 0%, ${team.color} 135%)` }}>
          <div className="mx-auto max-w-[1400px] px-4 py-5 sm:py-9 sm:px-6 lg:px-8">
            <Link to="/nfl/guide" className="text-xs font-black text-sky-200 hover:text-white">← Back to 2026 guide</Link>
            <div className="mt-4 flex flex-row items-center gap-4 sm:mt-5 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 p-2 sm:h-24 sm:w-24 sm:rounded-2xl sm:p-3"><img src={nflLogoUrl(team.abbr)} alt={`${team.team} logo`} className="h-full w-full object-contain" /></div>
              <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">{team.division} · 2026 Team Preview</div><h1 className="mt-0.5 text-3xl font-black tracking-tight sm:mt-1 sm:text-5xl">{team.team}</h1><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-200 sm:mt-2 sm:text-sm sm:leading-6">{team.headline}</p></div>
            </div>
            <div className="mt-5"><NflGuideNav /></div>
          </div>
        </section>

        <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:space-y-7 sm:px-6 sm:py-8 lg:px-8">
          <section className="grid grid-cols-4 gap-2 sm:gap-4 lg:grid-cols-8">
            <Metric label="2025 record" value={team.record2025} />
            <Metric label="Model wins" value={team.projectedWins.toFixed(1)} emphasis />
            <Metric label="Win total" value={team.winTotal?.toFixed(1) ?? "—"} />
            <Metric label="Model edge" value={team.modelEdge == null ? "—" : formatSigned(team.modelEdge)} tone={team.modelEdge == null ? "neutral" : team.modelEdge > 0 ? "good" : team.modelEdge < 0 ? "bad" : "neutral"} />
            <Metric label="Power rank" value={`#${team.powerRank}`} />
            <Metric label="Offense" value={`#${team.offRank}`} tone={team.offRank <= 10 ? "good" : team.offRank >= 24 ? "bad" : "neutral"} />
            <Metric label="Defense" value={`#${team.defRank}`} tone={team.defRank <= 10 ? "good" : team.defRank >= 24 ? "bad" : "neutral"} />
            <Metric label="Schedule" value={team.scheduleRank == null ? "—" : `#${team.scheduleRank}`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
            <div className="space-y-6">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge label={team.regressionSignal} tone={team.regressionSignal === "Bounce Back" ? "green" : team.regressionSignal === "Regression" ? "red" : "gray"} /><Badge label={`${team.marketLean} lean`} tone={team.marketLean === "Over" ? "green" : team.marketLean === "Under" ? "red" : "gray"} /><Badge label={`${team.marketConfidence} confidence`} tone="blue" /></div>
                <h2 className="mt-4 text-2xl font-black text-slate-900">Model overview</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{team.summary}</p>
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Projection formula</div><p className="mt-1 text-xs leading-5 text-slate-600">8.5 league-average wins + composite strength adjustment + schedule adjustment. Schedule rank uses #1 as hardest and #32 as easiest. The model is a baseline for comparison, not a replacement for injury, quarterback or price analysis.</p></div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Three burning questions</div>
                <div className="mt-4 divide-y divide-slate-100">{team.questions.map((question, index) => <div key={question.title} className="py-5 first:pt-0 last:pb-0"><div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span><div><h3 className="text-lg font-black text-slate-900">{question.title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{question.answer}</p></div></div></div>)}</div>
              </article>
            </div>

            <aside className="space-y-6">
              <ListCard title="Why the case can work" items={team.strengths} tone="green" />
              <ListCard title="What can break the case" items={team.concerns} tone="red" />
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">Schedule context</h2><p className="mt-2 text-sm leading-6 text-slate-600">{getScheduleDescription(team.scheduleRank)}</p><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${team.scheduleRank == null ? 50 : (team.scheduleRank / 32) * 100}%` }} /></div><div className="mt-2 flex justify-between text-[10px] font-bold text-slate-400"><span>Hardest</span><span>Easiest</span></div></article>
            </aside>
          </section>

          <section>
            <div className="mb-4"><h2 className="text-2xl font-black text-slate-900">{team.division} model board</h2><p className="mt-1 text-sm text-slate-500">Compare the team directly with its three division rivals.</p></div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="bg-slate-900 text-[10px] font-black uppercase tracking-wider text-white"><th className="sticky left-0 z-10 bg-slate-900 px-3 py-3 text-left sm:px-4">Team</th><th className="px-2 py-3 sm:px-3">Model W</th><th className="px-2 py-3 sm:px-3">Market</th><th className="px-2 py-3 sm:px-3">Edge</th><th className="px-2 py-3 sm:px-3">Pwr</th><th className="px-2 py-3 sm:px-3">Off</th><th className="px-2 py-3 sm:px-3">Def</th><th className="px-2 py-3 sm:px-3">Sch</th></tr></thead><tbody>{divisionTeams.map((rival) => <DivisionRow key={rival.abbr} team={rival} active={rival.abbr === team.abbr} />)}</tbody></table></div></div>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950"><div className="font-black">Preseason status</div><p className="mt-1">This page is designed to be updated as roster news, injuries, odds and weekly results change. The current version uses the site's 2025 performance model and June preseason totals as its baseline.</p></section>
        </div>
      </main>
    </SiteShell>
  );
}

function Metric({ label, value, emphasis = false, tone = "neutral" }: { label: string; value: string; emphasis?: boolean; tone?: "good" | "bad" | "neutral" }) { const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-slate-900"; return <div className={`rounded-xl border p-2 shadow-sm sm:rounded-2xl sm:p-4 ${emphasis ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="text-[7px] font-black uppercase leading-tight tracking-wider text-slate-400 sm:text-[9px]">{label}</div><div className={`mt-0.5 text-base font-black sm:mt-1 sm:text-2xl ${color}`}>{value}</div></div>; }
function Badge({ label, tone }: { label: string; tone: "green" | "red" | "blue" | "gray" }) { const cls = tone === "green" ? "bg-emerald-100 text-emerald-800" : tone === "red" ? "bg-red-100 text-red-700" : tone === "blue" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"; return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${cls}`}>{label}</span>; }
function ListCard({ title, items, tone }: { title: string; items: string[]; tone: "green" | "red" }) { return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className={`font-black ${tone === "green" ? "text-emerald-800" : "text-red-700"}`}>{title}</h2><div className="mt-3 space-y-3">{items.map((item) => <div key={item} className="flex gap-2 text-sm leading-6 text-slate-600"><span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone === "green" ? "bg-emerald-500" : "bg-red-500"}`} />{item}</div>)}</div></article>; }
function DivisionRow({ team, active }: { team: NflGuideTeam; active: boolean }) { return <tr className={`border-b border-slate-100 last:border-0 ${active ? "bg-blue-50" : "bg-white"}`}><td className={`sticky left-0 z-10 px-3 py-2 sm:px-4 sm:py-3 ${active ? "bg-blue-50" : "bg-white"}`}><Link to={`/nfl/guide/team/${team.slug}`} className="flex items-center gap-2 font-black text-slate-900 sm:gap-3"><img src={nflLogoUrl(team.abbr)} alt="" className="h-6 w-6 object-contain sm:h-8 sm:w-8" /><span className="text-xs sm:text-sm">{team.team}</span>{active && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] text-white">You</span>}</Link></td><td className="px-2 py-2 text-center font-black sm:px-3 sm:py-3">{team.projectedWins.toFixed(1)}</td><td className="px-2 py-2 text-center sm:px-3 sm:py-3">{team.winTotal?.toFixed(1) ?? "—"}</td><td className="px-2 py-2 text-center font-black sm:px-3 sm:py-3">{team.modelEdge == null ? "—" : formatSigned(team.modelEdge)}</td><td className="px-2 py-2 text-center sm:px-3 sm:py-3">#{team.powerRank}</td><td className="px-2 py-2 text-center sm:px-3 sm:py-3">#{team.offRank}</td><td className="px-2 py-2 text-center sm:px-3 sm:py-3">#{team.defRank}</td><td className="px-2 py-2 text-center sm:px-3 sm:py-3">#{team.scheduleRank ?? "—"}</td></tr>; }
