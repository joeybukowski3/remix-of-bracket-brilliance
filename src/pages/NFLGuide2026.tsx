import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflSection from "@/components/nfl/ui/NflSection";
import NflMetricStrip from "@/components/nfl/ui/NflMetricStrip";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
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
    <>
        <NflPageHeader
          eyebrow="Joe Knows Ball · 2026 NFL Guide"
          title="Fluke, real, or mispriced?"
          description="A data-first preseason guide built from our 2025 power ratings, offense and defense grades, schedule strength, 2026 win totals, and a transparent projected-win formula. Every team gets its own profile and three original questions to answer before Week 1."
          actions={
            <Link
              to={`/nfl/guide/team/${GUIDE.superBowlPick.slug}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <img src={nflLogoUrl(GUIDE.superBowlPick.abbr)} alt="" className="h-9 w-9 object-contain" />
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Model Super Bowl pick</span>
                <span className="block text-sm font-bold text-slate-900">{GUIDE.superBowlPick.teamName}</span>
                <span className="block text-[11px] text-slate-500">{GUIDE.superBowlPick.projectedWins.toFixed(1)} projected wins · Power #{GUIDE.superBowlPick.powerRank}</span>
              </span>
            </Link>
          }
        />

        <div className="space-y-5">
          <NflMetricStrip
            ariaLabel="Guide summary"
            columns={4}
            metrics={[
              { label: "Teams covered", value: "32", detail: "One preview per team" },
              { label: "Projection inputs", value: "5", detail: "Power, off, def, schedule, market" },
              { label: "Model format", value: "17 games", detail: "Wins normalized to a full season" },
              { label: "Update plan", value: "Weekly", detail: "Preseason inputs swap for live data" },
            ]}
          />

          {/* The explicit `minmax(0,1fr)` track matters: a default `grid` track
              is `auto`, which sizes to the widest child's max-content. That let
              the 600px-wide market-edges table push the whole page wider than
              390px even though the table sits inside its own scroll container. */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_.85fr]">
            <NflSection
              title="Largest model vs market gaps"
              subtitle="Early leans only; price, injuries and quarterback news still matter."
              className="min-w-0"
            >
              <NflTableScroller label="Largest model versus market gaps">
                <table className="w-full min-w-[600px] text-sm">
                  <thead><tr className={NFL_TABLE_HEAD_ROW}><th scope="col" className="px-2 py-2 text-left">Team</th><th scope="col" className="px-2 py-2">Model wins</th><th scope="col" className="px-2 py-2">Market</th><th scope="col" className="px-2 py-2">Gap</th><th scope="col" className="px-2 py-2">Lean</th><th scope="col" className="px-2 py-2"><span className="sr-only">Open preview</span></th></tr></thead>
                  <tbody>{GUIDE.topMarketEdges.slice(0, 8).map((team) => <EdgeRow key={team.abbr} team={team} />)}</tbody>
                </table>
              </NflTableScroller>
            </NflSection>

            <NflSection
              title="Fluke or real?"
              subtitle="The biggest differences between last year's record and this year's model baseline."
              className="min-w-0"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <SignalList title="Bounce-back candidates" tone="green" teams={GUIDE.bounceBacks.slice(0, 4)} />
                <SignalList title="Regression candidates" tone="red" teams={GUIDE.regressionCandidates.slice(0, 4)} />
              </div>
              <Link to="/nfl/guide/regression" className="mt-4 inline-flex rounded border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1">View all 32 teams →</Link>
            </NflSection>
          </section>

          <NflSection
            title="Our projected playoff field"
            subtitle="Division winners plus three wild cards in each conference, selected by projected wins with power rank as the tiebreaker."
            collapse="mobile"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <PlayoffCard conference="AFC" />
              <PlayoffCard conference="NFC" />
            </div>
          </NflSection>

          <NflSection
            title="All 32 team previews"
            subtitle="Each team page includes model vs market, regression profile, schedule context, unit strengths, concerns, and three burning questions written from our own data."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              {GUIDE.divisions.map(({ division, teams }) => (
                <div key={division} className="overflow-hidden rounded-lg border border-slate-200">
                  <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{division}</h3>
                  <div className="divide-y divide-slate-100">
                    {teams.map((team) => (
                      <Link key={team.abbr} to={`/nfl/guide/team/${team.slug}`} className="grid grid-cols-[minmax(0,1fr)_60px_60px] items-center gap-2 px-3 py-2 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <img src={nflLogoUrl(team.abbr)} alt="" className="h-7 w-7 shrink-0 object-contain" />
                          <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{team.teamName}</div><div className="truncate text-[11px] text-slate-500">{team.headline}</div></div>
                        </div>
                        <div className="text-center"><div className="text-[9px] font-semibold uppercase text-slate-400">Model</div><div className="font-semibold tabular-nums text-slate-900">{team.projectedWins.toFixed(1)}</div></div>
                        <div className="text-center"><div className="text-[9px] font-semibold uppercase text-slate-400">Lean</div><div className={`font-semibold ${team.recommendationLabel === "Over" ? "text-emerald-700" : team.recommendationLabel === "Under" ? "text-red-700" : "text-slate-500"}`}>{team.recommendationLabel}</div></div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </NflSection>

          <NflSection title="Methodology and editorial note" collapse="always" defaultOpen={false}>
            <p className="text-[13px] leading-6 text-slate-600">These pages use Joe Knows Ball's existing preseason ratings and an original projection formula. They do not reproduce third-party written analysis. The guide structure inspired the idea of combining predictions, regression indicators, market comparisons and team questions, but all copy and calculations on these pages are independently generated.</p>
          </NflSection>
        </div>
    </>
  );
}
function EdgeRow({ team }: { team: NflGuideTeamNormalized }) { return <tr className={NFL_TABLE_ROW}><td className="px-2 py-2"><div className="flex items-center gap-2"><img src={nflLogoUrl(team.abbr)} alt="" className="h-6 w-6 object-contain" /><span className="font-semibold">{team.teamName}</span></div></td><td className="text-center font-semibold tabular-nums">{team.projectedWins.toFixed(1)}</td><td className="text-center tabular-nums text-slate-600">{team.marketWinTotal?.toFixed(1) ?? "—"}</td><td className="text-center font-semibold tabular-nums">{team.modelVsMarketGap == null ? "—" : formatSigned(team.modelVsMarketGap)}</td><td className={`text-center font-semibold ${team.recommendationLabel === "Over" ? "text-emerald-700" : team.recommendationLabel === "Under" ? "text-red-700" : "text-slate-500"}`}>{team.recommendationLabel}</td><td className="px-2 text-right"><Link to={`/nfl/guide/team/${team.slug}`} className="text-xs font-semibold text-sky-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Preview →</Link></td></tr>; }
function SignalList({ title, tone, teams }: { title: string; tone: "green" | "red"; teams: NflGuideTeamNormalized[] }) { return <div><h3 className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${tone === "green" ? "text-emerald-700" : "text-red-700"}`}>{title}</h3><div className="divide-y divide-slate-100 rounded border border-slate-200">{teams.map((team) => <Link key={team.abbr} to={`/nfl/guide/team/${team.slug}`} className="flex items-center justify-between px-2.5 py-1.5 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"><span className="text-xs font-medium text-slate-800">{team.teamName}</span><span className={`text-xs font-semibold tabular-nums ${tone === "green" ? "text-emerald-700" : "text-red-700"}`}>{formatSigned(team.regressionGap)}</span></Link>)}</div></div>; }
function PlayoffCard({ conference }: { conference: "AFC" | "NFC" }) { const projection = GUIDE.playoffProjection[conference]; const teams = [...projection.divisionWinners, ...projection.wildCards]; return <div className="rounded-lg border border-slate-200"><div className="flex items-baseline justify-between border-b border-slate-200 bg-slate-50 px-3 py-2"><h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{conference} projected field</h3><div className="text-[11px] text-slate-500">Champion <span className="font-semibold text-slate-900">{projection.conferenceChampion.teamName}</span></div></div><div className="grid sm:grid-cols-2">{teams.map((team, index) => <Link key={team.abbr} to={`/nfl/guide/team/${team.slug}`} className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"><span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">{index + 1}</span><img src={nflLogoUrl(team.abbr)} alt="" className="h-6 w-6 shrink-0 object-contain"/><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-900">{team.teamName}</div><div className="text-[10px] text-slate-500">{index < 4 ? "Division winner" : "Wild card"} · {team.projectedWins.toFixed(1)} wins</div></div></Link>)}</div></div>; }
