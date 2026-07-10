import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import {
  formatSigned,
  getNflSeasonGuide,
  type NflGuideTeamNormalized,
} from "@/lib/nfl/guideData";

const GUIDE = getNflSeasonGuide(2026)!;

export default function NFLGuide2026() {
  usePageSeo({
    title: "2026 NFL Betting Guide & Team Previews | Joe Knows Ball",
    description: "Original 2026 NFL team previews, model projections, playoff picks, win total edges, regression candidates, and data-driven burning questions for all 32 teams.",
    path: "/nfl/guide",
  });

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
        <section className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,_#1d4ed8_0,_#0f172a_42%,_#020617_100%)] text-white">
          <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Joe Knows Ball · 2026 NFL Guide</div>
            <div className="mt-3 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
              <div>
                <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">Fluke, real, or mispriced?</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
                  A data-first preseason guide built from our 2025 power ratings, offense and defense grades, schedule strength, 2026 win totals, and a transparent projected-win formula. Every team gets its own profile and three original questions to answer before Week 1.
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-200">Current model Super Bowl pick</div>
                <div className="mt-3 flex items-center gap-3">
                  <img src={nflLogoUrl(GUIDE.superBowlPick.abbr)} alt="" className="h-12 w-12 object-contain" />
                  <div>
                    <div className="text-xl font-black">{GUIDE.superBowlPick.teamName}</div>
                    <div className="text-sm text-slate-300">{GUIDE.superBowlPick.projectedWins.toFixed(1)} projected wins · Power #{GUIDE.superBowlPick.powerRank}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1500px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Teams covered" value="32" detail="One data-driven preview for every team" />
            <StatCard label="Projection inputs" value="5" detail="Power, offense, defense, schedule and market" />
            <StatCard label="Model format" value="17 games" detail="Projected wins normalized to the full season" />
            <StatCard label="Update plan" value="Weekly" detail="Designed to swap preseason inputs for live data" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <Panel title="Largest model vs market gaps" subtitle="Early leans only; price, injuries and quarterback news still matter.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead><tr className="border-b text-[10px] font-black uppercase tracking-wider text-slate-400"><th className="px-2 py-2 text-left">Team</th><th>Model wins</th><th>Market</th><th>Gap</th><th>Lean</th><th></th></tr></thead>
                  <tbody>{GUIDE.topMarketEdges.slice(0, 8).map((team) => <EdgeRow key={team.abbr} team={team} />)}</tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Fluke or real?" subtitle="The biggest differences between last year's record and this year's model baseline.">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <SignalList title="Bounce-back candidates" tone="green" teams={GUIDE.bounceBacks.slice(0, 4)} />
                <SignalList title="Regression candidates" tone="red" teams={GUIDE.regressionCandidates.slice(0, 4)} />
              </div>
              <Link to="/nfl/guide/regression" className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white">View all 32 teams →</Link>
            </Panel>
          </section>

          <section>
            <SectionHeading title="Our projected playoff field" subtitle="Division winners plus three wild cards in each conference, selected by projected wins with power rank as the tiebreaker." />
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <PlayoffCard conference="AFC" />
              <PlayoffCard conference="NFC" />
            </div>
          </section>

          <section>
            <SectionHeading title="All 32 team previews" subtitle="Each team page includes model vs market, regression profile, schedule context, unit strengths, concerns, and three burning questions written from our own data." />
            <div className="mt-5 grid gap-6 xl:grid-cols-2">
              {GUIDE.divisions.map(({ division, teams }) => (
                <div key={division} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className={`px-4 py-3 text-sm font-black text-white ${division.startsWith("AFC") ? "bg-slate-900" : "bg-blue-900"}`}>{division}</div>
                  <div className="divide-y divide-slate-100">
                    {teams.map((team) => (
                      <Link key={team.abbr} to={`/nfl/guide/team/${team.slug}`} className="grid grid-cols-[minmax(0,1fr)_70px_70px] items-center gap-2 px-4 py-3 transition hover:bg-slate-50">
                        <div className="flex min-w-0 items-center gap-3">
                          <img src={nflLogoUrl(team.abbr)} alt="" className="h-8 w-8 shrink-0 object-contain" />
                          <div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{team.teamName}</div><div className="truncate text-[11px] text-slate-500">{team.headline}</div></div>
                        </div>
                        <div className="text-center"><div className="text-[9px] font-black uppercase text-slate-400">Model</div><div className="font-black text-slate-900">{team.projectedWins.toFixed(1)}</div></div>
                        <div className="text-center"><div className="text-[9px] font-black uppercase text-slate-400">Lean</div><div className={`font-black ${team.recommendationLabel === "Over" ? "text-emerald-700" : team.recommendationLabel === "Under" ? "text-red-600" : "text-slate-500"}`}>{team.recommendationLabel}</div></div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <div className="font-black">Methodology and editorial note</div>
            <p className="mt-1">These pages use Joe Knows Ball's existing preseason ratings and an original projection formula. They do not reproduce third-party written analysis. The guide structure inspired the idea of combining predictions, regression indicators, market comparisons and team questions, but all copy and calculations on these pages are independently generated.</p>
          </section>
        </div>
    </main>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p><div className="mt-4">{children}</div></div>;
}
function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-3xl font-black text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>; }
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-2xl font-black text-slate-900">{title}</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p></div>; }
function EdgeRow({ team }: { team: NflGuideTeamNormalized }) { return <tr className="border-b border-slate-100 last:border-0"><td className="px-2 py-3"><div className="flex items-center gap-2"><img src={nflLogoUrl(team.abbr)} alt="" className="h-7 w-7 object-contain" /><span className="font-bold">{team.teamName}</span></div></td><td className="text-center font-black">{team.projectedWins.toFixed(1)}</td><td className="text-center">{team.marketWinTotal?.toFixed(1) ?? "—"}</td><td className="text-center font-black">{team.modelVsMarketGap == null ? "—" : formatSigned(team.modelVsMarketGap)}</td><td className={`text-center font-black ${team.recommendationLabel === "Over" ? "text-emerald-700" : team.recommendationLabel === "Under" ? "text-red-600" : "text-slate-500"}`}>{team.recommendationLabel}</td><td className="text-right"><Link to={`/nfl/guide/team/${team.slug}`} className="text-xs font-black text-blue-700">Preview →</Link></td></tr>; }
function SignalList({ title, tone, teams }: { title: string; tone: "green" | "red"; teams: NflGuideTeamNormalized[] }) { return <div><div className={`mb-2 text-xs font-black uppercase tracking-wider ${tone === "green" ? "text-emerald-700" : "text-red-600"}`}>{title}</div><div className="space-y-2">{teams.map((team) => <Link key={team.abbr} to={`/nfl/guide/team/${team.slug}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"><span className="text-xs font-bold text-slate-800">{team.teamName}</span><span className={`text-xs font-black ${tone === "green" ? "text-emerald-700" : "text-red-600"}`}>{formatSigned(team.regressionGap)}</span></Link>)}</div></div>; }
function PlayoffCard({ conference }: { conference: "AFC" | "NFC" }) { const projection = GUIDE.playoffProjection[conference]; const teams = [...projection.divisionWinners, ...projection.wildCards]; return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-end justify-between"><div><div className="text-[10px] font-black uppercase tracking-widest text-blue-600">{conference}</div><h3 className="text-xl font-black">Projected field</h3></div><div className="text-right text-xs text-slate-500">Champion<br/><span className="font-black text-slate-900">{projection.conferenceChampion.teamName}</span></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{teams.map((team, index) => <Link key={team.abbr} to={`/nfl/guide/team/${team.slug}`} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span><img src={nflLogoUrl(team.abbr)} alt="" className="h-7 w-7 object-contain"/><div><div className="text-xs font-black">{team.teamName}</div><div className="text-[10px] text-slate-500">{index < 4 ? "Division winner" : "Wild card"} · {team.projectedWins.toFixed(1)} wins</div></div></Link>)}</div></div>; }
