import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflGuideNav from "@/components/nfl/NflGuideNav";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  COACH_OF_YEAR_ELEVATED_CANDIDATES,
  COACH_OF_YEAR_ELIMINATED,
  COACH_OF_YEAR_HISTORY,
  COACH_OF_YEAR_RATED_CANDIDATES,
  COACH_OF_YEAR_UNLIKELY,
  getCoachCandidateCounts,
  getCoachOfYearHistorySummary,
  type CoachCandidateRow,
} from "@/lib/nfl/coachOfYear2026";

export default function NFLCoachOfYear2026() {
  usePageSeo({
    title: "2026 NFL Coach of the Year Best Bets & Candidate Model | Joe Knows Ball",
    description: "A 10-year AP NFL Coach of the Year profile and a transparent 2026 candidate funnel using playoff history, schedule, coaching tenure, model improvement and division path.",
    path: "/nfl/coach-of-year",
    noindex: false,
  });

  const summary = getCoachOfYearHistorySummary();
  const counts = getCoachCandidateCounts();

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-50 pb-16">
        <section className="border-b border-slate-800 bg-slate-950 text-white">
          <div className="mx-auto max-w-[1500px] px-4 py-9 sm:px-6 lg:px-8">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">NFL awards research</div>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">2026 Coach of the Year candidate model</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
              A historical profile of the last 10 AP winners, followed by a transparent elimination funnel and preliminary score for the 2026 field.
            </p>
            <div className="mt-6"><NflGuideNav /></div>
          </div>
        </section>

        <div className="mx-auto max-w-[1500px] space-y-10 px-4 py-8 sm:px-6 lg:px-8">
          <section>
            <SectionHeading eyebrow="Historical profile" title="What the last 10 winners had in common" description="Award seasons 2016–2025. The header emphasizes the traits that drive the 2026 screening model." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryTile label="First-year coach" value={`${summary.firstYearCoachPct}%`} />
              <SummaryTile label="Missed prior playoffs" value={`${summary.missedPriorPlayoffsPct}%`} />
              <SummaryTile label="Award-year playoffs" value={`${summary.awardPlayoffsPct}%`} tone="good" />
              <SummaryTile label="Won division" value={`${summary.divisionWinnerPct}%`} />
              <SummaryTile label="Improved scoring" value={`${summary.improvedPpgPct}%`} />
              <SummaryTile label="Average win increase" value={`+${summary.averageWinIncrease.toFixed(1)}`} tone="good" />
              <SummaryTile label="Average PPG increase" value={`+${summary.averagePpgIncrease.toFixed(1)}`} tone="good" />
              <SummaryTile label="Easier award SOS" value={`${summary.easierSchedulePct}%`} />
              <SummaryTile label="Average prior SOS" value={summary.averagePriorSos.toFixed(3)} />
              <SummaryTile label="Average award SOS" value={summary.averageAwardSos.toFixed(3)} />
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-xs">
                  <thead><tr className="bg-slate-950 text-[9px] font-black uppercase tracking-wider text-white"><th className="px-3 py-3 text-left">Season</th><th className="px-3 py-3 text-left">Coach / Team</th><th>Year</th><th>Prior record</th><th>Prior playoffs</th><th>Award record</th><th>Win increase</th><th>Division</th><th>PPG increase</th><th>Award playoffs</th><th>Prior SOS</th><th>Award SOS</th></tr></thead>
                  <tbody>
                    {COACH_OF_YEAR_HISTORY.map((row) => (
                      <tr key={row.season} className="border-t border-slate-100">
                        <td className="px-3 py-3 font-black text-slate-900">{row.season}</td>
                        <td className="px-3 py-3"><div className="font-black text-slate-900">{row.coach}</div><div className="text-slate-500">{row.team}</div></td>
                        <td className="text-center font-bold">{ordinal(row.tenureYear)}</td>
                        <td className="text-center">{row.priorRecord}</td>
                        <BooleanCell value={row.priorPlayoffs} />
                        <td className="text-center font-bold">{row.awardRecord}</td>
                        <td className="text-center font-black text-emerald-700">+{row.winIncrease}</td>
                        <BooleanCell value={row.divisionWinner} />
                        <td className={`text-center font-black ${row.ppgIncrease > 0 ? "text-emerald-700" : "text-red-600"}`}>{signed(row.ppgIncrease)}</td>
                        <BooleanCell value={row.awardPlayoffs} />
                        <td className="text-center">{row.priorSos.toFixed(3)}</td>
                        <td className="text-center">{row.awardSos.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading eyebrow="2026 candidate funnel" title="Eliminate, downgrade, then rate the remaining field" description="Prior playoff teams are removed, winning non-playoff teams and verified major schedule jumps are downgraded, and the remainder receive a 100-point opportunity score." />
            <div className="grid gap-4 md:grid-cols-3">
              <FunnelTile label="Eliminated" value={counts.eliminated} detail="Made the 2025 playoffs" tone="red" />
              <FunnelTile label="Unlikely" value={counts.unlikely} detail="Winning 2025 record or major SOS jump" tone="amber" />
              <FunnelTile label="Rated field" value={counts.rated} detail="Advanced to the preliminary score" tone="green" />
            </div>
          </section>

          <section className="rounded-3xl border-2 border-emerald-300 bg-emerald-50/70 p-5 shadow-sm">
            <SectionHeading eyebrow="Elevated profile" title="Teams matching all four improvement filters" description="Requires 7+ projected wins, +3.0 or more projected improvement, an easier-half SoS (#17–32), and a top-20 offense or defense rating." />
            <CandidateTable rows={COACH_OF_YEAR_ELEVATED_CANDIDATES} showScore elevatedOnly />
          </section>

          <section>
            <SectionHeading eyebrow="Preliminary leaderboard" title="Remaining 2026 Coach of the Year candidates" description="Score weights: schedule 25, first-year coach 15, improvement/expectations 35, and division/playoff path 25. Elevated rows are highlighted." />
            <CandidateTable rows={COACH_OF_YEAR_RATED_CANDIDATES} showScore />
          </section>

          <section className="grid gap-8 xl:grid-cols-2">
            <div>
              <SectionHeading eyebrow="Secondary cut" title="Unlikely profiles" description="Missed the playoffs, but begin with a less typical winner profile because they already had a winning record or face a verified major schedule increase." />
              <CandidateTable rows={COACH_OF_YEAR_UNLIKELY} />
            </div>
            <div>
              <SectionHeading eyebrow="Automatic cut" title="Eliminated: 2025 playoff teams" description="Prior playoff teams are removed in this first version of the model." />
              <CandidateTable rows={COACH_OF_YEAR_ELIMINATED} />
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}

function CandidateTable({ rows, showScore = false, elevatedOnly = false }: { rows: CoachCandidateRow[]; showScore?: boolean; elevatedOnly?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1250px] text-xs">
          <thead>
            <tr className="bg-slate-900 text-[9px] font-black uppercase tracking-wider text-white">
              <th className="px-3 py-3 text-left">Team / Coach</th><th>2025</th><th>Playoffs</th><th>SoS</th><th>First year</th><th>Off rating</th><th>Def rating</th><th>Model Wins +/-</th><th>Division path</th>{showScore && <><th>Sched</th><th>Coach</th><th>Improve</th><th>Path</th><th>Total</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={showScore ? 14 : 9} className="px-4 py-8 text-center text-sm text-slate-500">No teams currently meet all filters.</td></tr>}
            {rows.map((row) => (
              <tr key={row.team.abbr} className={`border-t border-slate-100 align-middle ${row.elevated ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}>
                <td className="px-3 py-3">
                  <Link to={`/nfl/guide/team/${row.team.slug}`} className="flex items-center gap-3">
                    <img src={nflLogoUrl(row.team.abbr)} alt="" className="h-8 w-8 object-contain" />
                    <span><span className="flex items-center gap-2 font-black text-slate-900">{row.team.team}{row.elevated && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[8px] uppercase tracking-wider text-white">Elevated</span>}</span><span className="block text-slate-500">{row.coach}</span>{row.sosChangeNote && <span className="mt-1 block max-w-[260px] text-[10px] font-bold leading-4 text-amber-700">{row.sosChangeNote}</span>}</span>
                  </Link>
                </td>
                <td className="text-center font-bold">{row.team.record2025}</td>
                <BooleanCell value={row.made2025Playoffs} />
                <HeatCell value={`#${row.sharpSosRank}`} detail="hardest" strength={(row.sharpSosRank - 16.5) / 15.5} />
                <BooleanCell value={row.firstYearCoach} />
                <RatingCell value={row.team.offPct} rank={row.team.offRank} />
                <RatingCell value={row.team.defPct} rank={row.team.defRank} />
                <HeatCell value={row.team.projectedWins.toFixed(1)} detail={`${signed(row.team.regressionGap)} vs 2025`} strength={row.team.regressionGap / 5} greenOnly />
                <td className="px-2 text-center font-bold text-slate-600">{row.divisionPathLabel}</td>
                {showScore && row.score && <><ScoreCell value={row.score.schedule} max={25} /><ScoreCell value={row.score.firstYearCoach} max={15} /><ScoreCell value={row.score.improvement} max={35} /><ScoreCell value={row.score.path} max={25} /><td className="text-center"><span className="inline-flex min-w-10 justify-center rounded-full bg-blue-600 px-2 py-1 font-black text-white">{row.score.total}</span></td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {elevatedOnly && <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-bold text-emerald-800">This tier is a filter match, not yet a final bet recommendation.</div>}
    </div>
  );
}

function RatingCell({ value, rank }: { value: number; rank: number }) {
  return <HeatCell value={`${value > 0 ? "+" : ""}${value.toFixed(1)}%`} detail={`Rank #${rank}`} strength={value / 10} />;
}

function HeatCell({ value, detail, strength, greenOnly = false }: { value: string; detail: string; strength: number; greenOnly?: boolean }) {
  const clamped = Math.max(-1, Math.min(1, strength));
  const positive = clamped >= 0;
  const alpha = 0.05 + Math.abs(clamped) * 0.24;
  const backgroundColor = positive || greenOnly
    ? `rgba(16, 185, 129, ${Math.max(0.04, positive ? alpha : 0.04)})`
    : `rgba(239, 68, 68, ${alpha})`;
  const color = positive || greenOnly ? "#047857" : "#b91c1c";
  return <td className="px-2 py-2 text-center" style={{ backgroundColor }}><div className="font-black tabular-nums" style={{ color }}>{value}</div><div className="text-[9px] font-bold text-slate-500">{detail}</div></td>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div><h2 className="mt-1 text-2xl font-black text-slate-900">{title}</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">{description}</p></div>;
}

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "neutral" }) {
  return <div className={`rounded-2xl border p-4 shadow-sm ${tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-2xl font-black ${tone === "good" ? "text-emerald-700" : "text-slate-900"}`}>{value}</div></div>;
}

function FunnelTile({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "red" | "amber" | "green" }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-2xl border p-5 ${cls}`}><div className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</div><div className="mt-1 text-4xl font-black">{value}</div><div className="mt-1 text-xs font-bold opacity-80">{detail}</div></div>;
}

function BooleanCell({ value }: { value: boolean }) {
  return <td className="text-center"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${value ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{value ? "Yes" : "No"}</span></td>;
}

function ScoreCell({ value, max }: { value: number; max: number }) {
  const ratio = value / max;
  return <td className="px-2 py-2 text-center" style={{ backgroundColor: `rgba(16, 185, 129, ${0.04 + ratio * 0.18})` }}><span className="font-black text-emerald-800">{value}</span><span className="text-[9px] text-slate-400">/{max}</span></td>;
}

function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }
function ordinal(value: number) { const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th"; return `${value}${suffix}`; }
