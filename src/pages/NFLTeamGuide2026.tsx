import { Link, Navigate, useParams } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflGuideNav from "@/components/nfl/NflGuideNav";
import NflTeamDashboardExtras from "@/components/nfl/NflTeamDashboardExtras";
import NflCoachOfYearCase from "@/components/nfl/NflCoachOfYearCase";
import {
  NflTeamHeaderOdds,
  NflTeamStatsSidebar,
} from "@/components/nfl/NflTeamVsinPanels";
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
    title: team ? `${team.team} 2026 Schedule, Stats, Odds & Roster Changes | Joe Knows Ball` : "2026 NFL Team Dashboard | Joe Knows Ball",
    description: team ? `${team.team} 2026 schedule, power rating, 2025 statistics, futures odds, value, coaching changes and notable player movement.` : "2026 NFL team schedule, ratings, odds and roster changes.",
    path: `/nfl/guide/team/${teamSlug}`,
    noindex: !team,
  });

  if (!team) return <Navigate to="/nfl/guide" replace />;
  const divisionTeams = NFL_GUIDE_DIVISIONS.find((entry) => entry.division === team.division)?.teams ?? [];

  return (
    <SiteShell>
      <main id="top" className="min-h-screen bg-slate-50 pb-16">
        <section className="border-b border-slate-800 text-white" style={{ background: `linear-gradient(125deg, #020617 0%, ${team.color} 135%)` }}>
          <div className="mx-auto max-w-[1400px] px-4 py-9 sm:px-6 lg:px-8">
            <Link to="/nfl/power-ratings" className="text-xs font-black text-sky-200 hover:text-white">← Back to NFL power ratings</Link>

            <div className="mt-5 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 p-3">
                  <img src={nflLogoUrl(team.abbr)} alt={`${team.team} logo`} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">{team.division} · 2026 Team Dashboard</div>
                  <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{team.team}</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">{team.headline}</p>
                </div>
              </div>

              <NflTeamHeaderOdds team={team} />
            </div>

            <div className="mt-7"><NflGuideNav /></div>
          </div>
        </section>

        <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Metric label="2025 record" value={team.record2025} />
            <Metric label="Model wins" value={team.projectedWins.toFixed(1)} emphasis />
            <Metric label="Win total" value={team.winTotal?.toFixed(1) ?? "—"} />
            <Metric label="Model edge" value={team.modelEdge == null ? "—" : formatSigned(team.modelEdge)} tone={team.modelEdge == null ? "neutral" : team.modelEdge > 0 ? "good" : team.modelEdge < 0 ? "bad" : "neutral"} />
            <Metric label="Power rank" value={`#${team.powerRank}`} />
            <Metric label="Offense" value={`#${team.offRank}`} tone={team.offRank <= 10 ? "good" : team.offRank >= 24 ? "bad" : "neutral"} />
            <Metric label="Defense" value={`#${team.defRank}`} tone={team.defRank <= 10 ? "good" : team.defRank >= 24 ? "bad" : "neutral"} />
            <Metric label="Schedule" value={team.scheduleRank == null ? "—" : `#${team.scheduleRank}`} />
          </section>

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
            <div className="min-w-0 space-y-8">
              <NflTeamDashboardExtras team={team} />
              <NflCoachOfYearCase team={team} />

              <section className="space-y-6">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Team outlook</div>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">Model analysis</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">The model overview and key questions are positioned below the schedule so the week-by-week matchup view remains the primary team-page content.</p>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
                  <div className="space-y-6">
                    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge label={team.regressionSignal} tone={team.regressionSignal === "Bounce Back" ? "green" : team.regressionSignal === "Regression" ? "red" : "gray"} />
                        <Badge label={`${team.marketLean} lean`} tone={team.marketLean === "Over" ? "green" : team.marketLean === "Under" ? "red" : "gray"} />
                        <Badge label={`${team.marketConfidence} confidence`} tone="blue" />
                      </div>
                      <h3 className="mt-4 text-2xl font-black text-slate-900">Model overview</h3>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{team.summary}</p>
                      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Projection formula</div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">8.5 league-average wins + composite strength adjustment + schedule adjustment. Schedule rank uses #1 as hardest and #32 as easiest. The model is a baseline for comparison, not a replacement for injury, quarterback or price analysis.</p>
                      </div>
                    </article>

                    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Three burning questions</div>
                      <div className="mt-4 divide-y divide-slate-100">
                        {team.questions.map((question, index) => (
                          <div key={question.title} className="py-5 first:pt-0 last:pb-0">
                            <div className="flex gap-3">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span>
                              <div>
                                <h3 className="text-lg font-black text-slate-900">{question.title}</h3>
                                <p className="mt-2 text-sm leading-7 text-slate-600">{question.answer}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>

                  <aside className="space-y-6">
                    <ListCard title="Why the case can work" items={team.strengths} tone="green" />
                    <ListCard title="What can break the case" items={team.concerns} tone="red" />
                    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="font-black text-slate-900">Schedule context</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{getScheduleDescription(team.scheduleRank)}</p>
                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${team.scheduleRank == null ? 50 : (team.scheduleRank / 32) * 100}%` }} />
                      </div>
                      <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-400"><span>Hardest</span><span>Easiest</span></div>
                    </article>
                  </aside>
                </div>
              </section>

              <section>
                <div className="mb-4">
                  <h2 className="text-2xl font-black text-slate-900">{team.division} model board</h2>
                  <p className="mt-1 text-sm text-slate-500">Compare the team directly with its three division rivals.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead><tr className="bg-slate-900 text-[10px] font-black uppercase tracking-wider text-white"><th className="px-4 py-3 text-left">Team</th><th>Model wins</th><th>Market</th><th>Edge</th><th>Power</th><th>Off</th><th>Def</th><th>Schedule</th></tr></thead>
                      <tbody>{divisionTeams.map((rival) => <DivisionRow key={rival.abbr} team={rival} active={rival.abbr === team.abbr} />)}</tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
                <div className="font-black">Preseason status</div>
                <p className="mt-1">Ratings use the site's 2025 performance model and June preseason totals as the baseline. The VSiN statistics and listed futures odds are displayed as source material and do not overwrite the Joe Knows Ball model.</p>
              </section>
            </div>

            <NflTeamStatsSidebar team={team} />
          </div>
        </div>
      </main>
    </SiteShell>
  );
}

function Metric({ label, value, emphasis = false, tone = "neutral" }: { label: string; value: string; emphasis?: boolean; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-slate-900";
  return <div className={`rounded-2xl border p-4 shadow-sm ${emphasis ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-2xl font-black ${color}`}>{value}</div></div>;
}

function Badge({ label, tone }: { label: string; tone: "green" | "red" | "blue" | "gray" }) {
  const cls = tone === "green" ? "bg-emerald-100 text-emerald-800" : tone === "red" ? "bg-red-100 text-red-700" : tone === "blue" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${cls}`}>{label}</span>;
}

function ListCard({ title, items, tone }: { title: string; items: string[]; tone: "green" | "red" }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className={`font-black ${tone === "green" ? "text-emerald-800" : "text-red-700"}`}>{title}</h3><div className="mt-3 space-y-3">{items.map((item) => <div key={item} className="flex gap-2 text-sm leading-6 text-slate-600"><span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone === "green" ? "bg-emerald-500" : "bg-red-500"}`} />{item}</div>)}</div></article>;
}

function DivisionRow({ team, active }: { team: NflGuideTeam; active: boolean }) {
  return <tr className={`border-b border-slate-100 last:border-0 ${active ? "bg-blue-50" : ""}`}><td className="px-4 py-3"><Link to={`/nfl/guide/team/${team.slug}`} className="flex items-center gap-3 font-black text-slate-900"><img src={nflLogoUrl(team.abbr)} alt="" className="h-8 w-8 object-contain" />{team.team}{active && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] text-white">Current</span>}</Link></td><td className="text-center font-black">{team.projectedWins.toFixed(1)}</td><td className="text-center">{team.winTotal?.toFixed(1) ?? "—"}</td><td className="text-center font-black">{team.modelEdge == null ? "—" : formatSigned(team.modelEdge)}</td><td className="text-center">#{team.powerRank}</td><td className="text-center">#{team.offRank}</td><td className="text-center">#{team.defRank}</td><td className="text-center">#{team.scheduleRank ?? "—"}</td></tr>;
}
