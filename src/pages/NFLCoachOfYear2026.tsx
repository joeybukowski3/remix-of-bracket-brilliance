import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflGuideNav from "@/components/nfl/NflGuideNav";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  COACH_OF_YEAR_ELIMINATED,
  COACH_OF_YEAR_HISTORY,
  COACH_OF_YEAR_RATED_CANDIDATES,
  COACH_OF_YEAR_UNLIKELY,
  getCoachCandidateCounts,
  getCoachOfYearHistorySummary,
  type CoachCandidateRow,
} from "@/lib/nfl/coachOfYear2026";

const REMAINING_TIERS = [
  {
    key: "best",
    label: "Best complete profiles",
    description: "Closest blend of playoff viability, surprise potential, model edge and award narrative.",
    tone: "emerald",
    teams: ["no", "ind", "atl", "cle"],
  },
  {
    key: "upside",
    label: "High-upside improvement candidates",
    description: "Large projected jumps, but each still needs a stronger playoff-level finish than the model currently shows.",
    tone: "blue",
    teams: ["nyg", "ari", "nyj"],
  },
  {
    key: "push",
    label: "Need a stronger-than-model playoff push",
    description: "The award case requires a meaningful jump beyond the current projection to reach the postseason narrative.",
    tone: "amber",
    teams: ["mia", "wsh", "lv"],
  },
  {
    key: "poor",
    label: "Poor award-value profiles",
    description: "Market expectations, limited improvement, weak projected ceiling or a difficult path suppress the award case.",
    tone: "slate",
    teams: ["tb", "kc", "bal", "cin", "ten"],
  },
] as const;

const TOP_PROFILE_COPY: Record<string, { forCase: string[]; againstCase: string[] }> = {
  no: {
    forCase: [
      "9.0 projected wins and a model-implied division favorite.",
      "+3.0 wins versus 2025 and +1.5 versus the 7.5 Vegas total.",
      "#31 SoS and a top-six defensive rating create a favorable path.",
    ],
    againstCase: [
      "Not a first-year head coach, which removes one common award narrative.",
      "The offense opens 27th, so the playoff case relies heavily on defense and schedule.",
    ],
  },
  ind: {
    forCase: [
      "8.5 projected wins leaves only a half-win gap to a typical nine-win playoff range.",
      "+1.0 model edge over the 7.5 Vegas total.",
      "Top-10 offensive rating, easier-half SoS and a strong division path.",
    ],
    againstCase: [
      "Only +0.5 projected improvement from 2025, which is a weak Coach of the Year narrative.",
      "Not a first-year coach and the defense begins outside the top 20.",
    ],
  },
  atl: {
    forCase: [
      "First-year coach with an 8.2-win projection and a strong NFC South path.",
      "+1.7 model edge versus a low 6.5 Vegas total creates real surprise potential.",
      "A top-15 defense gives the roster a credible playoff floor.",
    ],
    againstCase: [
      "The model projects only +0.2 wins of year-over-year improvement.",
      "The schedule is in the tougher half and the offense opens 22nd.",
    ],
  },
  cle: {
    forCase: [
      "First-year coach, +2.8 projected improvement and +1.3 over the 6.5 Vegas total.",
      "#29 SoS and the league's fourth-rated defense create a realistic overachiever profile.",
      "Only 1.2 wins above the model are needed to reach nine wins.",
    ],
    againstCase: [
      "The model projects only 7.8 wins, so a playoff berth still requires an extra step.",
      "The offense opens 32nd and the AFC North path is less forgiving than New Orleans or Atlanta.",
    ],
  },
};

export default function NFLCoachOfYear2026() {
  usePageSeo({
    title: "2026 NFL Coach of the Year Best Bets & Candidate Model | Joe Knows Ball",
    description: "A 10-year AP NFL Coach of the Year profile and a transparent 2026 candidate funnel using playoff history, schedule, coaching tenure, model improvement and division path.",
    path: "/nfl/coach-of-year",
    noindex: false,
  });

  const summary = getCoachOfYearHistorySummary();
  const counts = getCoachCandidateCounts();
  const candidateByAbbr = new Map(COACH_OF_YEAR_RATED_CANDIDATES.map((row) => [row.team.abbr, row]));
  const topProfiles = ["no", "ind", "atl", "cle"]
    .map((abbr) => candidateByAbbr.get(abbr))
    .filter((row): row is CoachCandidateRow => Boolean(row));

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-50 pb-16">
        <section className="border-b border-slate-800 bg-slate-950 text-white">
          <div className="mx-auto max-w-[1500px] px-4 py-9 sm:px-6 lg:px-8">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">NFL awards research</div>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">2026 Coach of the Year candidate model</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
              Historical winner traits, a transparent elimination funnel and a tiered 2026 candidate board built around playoff viability, model improvement and market expectations.
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
            <SectionHeading eyebrow="2026 candidate funnel" title="Eliminate, downgrade, then tier the remaining field" description="Prior playoff teams are removed, winning non-playoff teams and verified major schedule jumps are downgraded, and the remaining candidates are grouped by award viability." />
            <div className="grid gap-4 md:grid-cols-3">
              <FunnelTile label="Eliminated" value={counts.eliminated} detail="Made the 2025 playoffs" tone="red" />
              <FunnelTile label="Unlikely" value={counts.unlikely} detail="Winning 2025 record or major SOS jump" tone="amber" />
              <FunnelTile label="Remaining field" value={counts.rated} detail="Advanced to the tiered board" tone="green" />
            </div>
          </section>

          <section>
            <SectionHeading eyebrow="Top four profiles" title="The case for and against the leading candidates" description="These four currently offer the best mix of playoff viability, market value, team quality and award narrative." />
            <div className="grid gap-5 lg:grid-cols-2">
              {topProfiles.map((row, index) => <TopCandidateCard key={row.team.abbr} row={row} rank={index + 1} />)}
            </div>
          </section>

          <section>
            <SectionHeading eyebrow="Tiered candidate board" title="Remaining 2026 Coach of the Year candidates" description="All existing model columns remain visible, with Vegas O/U added for context. The tiers reflect the ranking logic agreed during review rather than only the raw 100-point score." />
            <TieredCandidateTable candidateByAbbr={candidateByAbbr} />
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

function TopCandidateCard({ row, rank }: { row: CoachCandidateRow; rank: number }) {
  const copy = TOP_PROFILE_COPY[row.team.abbr];
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-950 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-black">#{rank}</span>
          <img src={nflLogoUrl(row.team.abbr)} alt="" className="h-10 w-10 object-contain" />
          <div><div className="text-lg font-black">{row.team.team}</div><div className="text-xs text-slate-300">{row.coach}</div></div>
        </div>
        <div className="text-right text-xs"><div className="font-black text-emerald-300">{row.team.projectedWins.toFixed(1)} model wins</div><div className="text-slate-300">Vegas {row.team.winTotal?.toFixed(1) ?? "—"}</div></div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <CaseBlock title="Case for" tone="good" items={copy.forCase} />
        <CaseBlock title="Case against" tone="bad" items={copy.againstCase} />
      </div>
    </article>
  );
}

function CaseBlock({ title, tone, items }: { title: string; tone: "good" | "bad"; items: string[] }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      <div className={`text-[10px] font-black uppercase tracking-wider ${tone === "good" ? "text-emerald-700" : "text-red-700"}`}>{title}</div>
      <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-700">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="font-black">•</span><span>{item}</span></li>)}
      </ul>
    </div>
  );
}

function TieredCandidateTable({ candidateByAbbr }: { candidateByAbbr: Map<string, CoachCandidateRow> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1360px] text-xs">
          <CandidateHeader showScore />
          <tbody>
            {REMAINING_TIERS.map((tier) => {
              const rows = tier.teams.map((abbr) => candidateByAbbr.get(abbr)).filter((row): row is CoachCandidateRow => Boolean(row));
              return [
                <TierRow key={`${tier.key}-heading`} label={tier.label} description={tier.description} tone={tier.tone} />,
                ...rows.map((row, index) => <CandidateRow key={row.team.abbr} row={row} showScore rankLabel={`${index + 1}`} />),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CandidateTable({ rows }: { rows: CoachCandidateRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <CandidateHeader />
          <tbody>{rows.map((row) => <CandidateRow key={row.team.abbr} row={row} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

function CandidateHeader({ showScore = false }: { showScore?: boolean }) {
  return <thead><tr className="bg-slate-900 text-[9px] font-black uppercase tracking-wider text-white"><th className="px-3 py-3 text-left">Team / Coach</th><th>2025</th><th>Playoffs</th><th>SoS</th><th>First year</th><th>Off rating</th><th>Def rating</th><th>Vegas O/U</th><th>Model Wins +/-</th><th>Division path</th>{showScore && <><th>Sched</th><th>Coach</th><th>Improve</th><th>Path</th><th>Total</th></>}</tr></thead>;
}

function CandidateRow({ row, showScore = false, rankLabel }: { row: CoachCandidateRow; showScore?: boolean; rankLabel?: string }) {
  return (
    <tr className="border-t border-slate-100 align-middle hover:bg-slate-50">
      <td className="px-3 py-3">
        <Link to={`/nfl/guide/team/${row.team.slug}`} className="flex items-center gap-3">
          {rankLabel && <span className="w-5 text-center text-[10px] font-black text-slate-400">{rankLabel}</span>}
          <img src={nflLogoUrl(row.team.abbr)} alt="" className="h-8 w-8 object-contain" />
          <span><span className="block font-black text-slate-900">{row.team.team}</span><span className="block text-slate-500">{row.coach}</span>{row.sosChangeNote && <span className="mt-1 block max-w-[260px] text-[10px] font-bold leading-4 text-amber-700">{row.sosChangeNote}</span>}</span>
        </Link>
      </td>
      <td className="text-center font-bold">{row.team.record2025}</td>
      <BooleanCell value={row.made2025Playoffs} />
      <HeatCell value={`#${row.sharpSosRank}`} detail="hardest" strength={(row.sharpSosRank - 16.5) / 15.5} />
      <BooleanCell value={row.firstYearCoach} />
      <RatingCell value={row.team.offPct} rank={row.team.offRank} />
      <RatingCell value={row.team.defPct} rank={row.team.defRank} />
      <td className="text-center"><div className="font-black tabular-nums text-slate-900">{row.team.winTotal?.toFixed(1) ?? "—"}</div><div className="text-[9px] text-slate-400">market total</div></td>
      <HeatCell value={row.team.projectedWins.toFixed(1)} detail={`${signed(row.team.regressionGap)} vs 2025 · ${signed(row.team.modelEdge ?? 0)} vs Vegas`} strength={Math.max(row.team.regressionGap, row.team.modelEdge ?? 0) / 5} greenOnly />
      <td className="px-2 text-center font-bold text-slate-600">{row.divisionPathLabel}</td>
      {showScore && row.score && <><ScoreCell value={row.score.schedule} max={25} /><ScoreCell value={row.score.firstYearCoach} max={15} /><ScoreCell value={row.score.improvement} max={35} /><ScoreCell value={row.score.path} max={25} /><td className="text-center"><span className="inline-flex min-w-10 justify-center rounded-full bg-blue-600 px-2 py-1 font-black text-white">{row.score.total}</span></td></>}
    </tr>
  );
}

function TierRow({ label, description, tone }: { label: string; description: string; tone: string }) {
  const classes = tone === "emerald" ? "bg-emerald-100 text-emerald-900" : tone === "blue" ? "bg-blue-100 text-blue-900" : tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800";
  return <tr className={classes}><td colSpan={15} className="px-4 py-3"><span className="font-black uppercase tracking-wider">{label}</span><span className="ml-3 text-[10px] font-bold opacity-75">{description}</span></td></tr>;
}

function RatingCell({ value, rank }: { value: number; rank: number }) {
  return <HeatCell value={`${value > 0 ? "+" : ""}${value.toFixed(1)}%`} detail={`Rank #${rank}`} strength={value / 10} />;
}

function HeatCell({ value, detail, strength, greenOnly = false }: { value: string; detail: string; strength: number; greenOnly?: boolean }) {
  const clamped = Math.max(-1, Math.min(1, strength));
  const positive = clamped >= 0;
  const alpha = 0.05 + Math.abs(clamped) * 0.24;
  const backgroundColor = positive || greenOnly ? `rgba(16, 185, 129, ${Math.max(0.04, positive ? alpha : 0.04)})` : `rgba(239, 68, 68, ${alpha})`;
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
