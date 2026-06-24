import { useState } from "react";
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
  { key: "best", label: "Best complete profiles", description: "Closest blend of playoff viability, surprise potential, model edge and award narrative.", tone: "emerald", teams: ["no", "ind", "atl", "cle"] },
  { key: "upside", label: "High-upside improvement candidates", description: "Large projected jumps, but each still needs a stronger playoff-level finish than the model currently shows.", tone: "blue", teams: ["nyg", "ari", "nyj"] },
  { key: "push", label: "Need a stronger-than-model playoff push", description: "The award case requires a meaningful jump beyond the current projection to reach the postseason narrative.", tone: "amber", teams: ["mia", "wsh", "lv"] },
  { key: "poor", label: "Poor award-value profiles", description: "Market expectations, limited improvement, weak projected ceiling or a difficult path suppress the award case.", tone: "slate", teams: ["tb", "kc", "bal", "cin", "ten"] },
] as const;

const COY_ODDS: Record<string, string> = {
  no: "+1267",
  ind: "+2500",
  atl: "+1400",
  nyg: "+717",
  bal: "+717",
  ten: "+1233",
};

const TOP_PROFILE_COPY: Record<string, { headline: string; metrics: { label: string; value: string }[]; support: string[]; against: string[] }> = {
  no: {
    headline: "The cleanest schedule-and-turnaround profile in the group.",
    metrics: [
      { label: "Customized SOS", value: "#2 easiest" },
      { label: "Model vs Vegas", value: "+1.5 wins" },
      { label: "2025 defense", value: "7th in yards/drive" },
      { label: "Projected path", value: "Division favorite" },
    ],
    support: [
      "The defense allowed only 27.9 yards per drive and finished seventh in red-zone defense.",
      "The customized opponent slate is especially favorable for the defense, with one of the weakest projected groups of opposing passing and rushing offenses.",
      "Tyler Shough went 5-4 over his final nine starts, and the offense added Travis Etienne, Jordyn Tyson, Noah Fant, Oscar Delp and David Edwards.",
      "No short-week road game, no post-road-primetime follow-up and no negated bye reduce schedule volatility.",
    ],
    against: [
      "Kellen Moore is in his second year, so the first-year-coach narrative is absent.",
      "The offense still opens 27th in the model, leaving the case dependent on quarterback growth and defensive consistency.",
    ],
  },
  ind: {
    headline: "The strongest evidence that a playoff-level ceiling already exists.",
    metrics: [
      { label: "Model wins", value: "8.5" },
      { label: "Vegas O/U", value: "7.5" },
      { label: "First 10 games", value: "#1 EPA/play" },
      { label: "Offensive rating", value: "#9" },
    ],
    support: [
      "Through the first 10 games of 2025, Indianapolis ranked first in EPA per play, success rate, yards per play, points per drive and points per game.",
      "The offense averaged 3.17 points per drive and 31.7 points per game during that opening stretch.",
      "The customized defensive-opponent slate is favorable, especially against the run, where the blended schedule ranking lands near the bottom of the league in difficulty.",
      "Six one-score losses and the late collapse after Daniel Jones' Achilles injury create a credible rebound case.",
    ],
    against: [
      "The model shows only +0.5 wins of year-over-year improvement, which is a weaker award narrative than the other leading teams.",
      "Shane Steichen is entering his fourth year, and the defense begins outside the top 20.",
    ],
  },
  atl: {
    headline: "The strongest coaching-change and skill-position upside case.",
    metrics: [
      { label: "COY odds", value: "+1400" },
      { label: "Model vs Vegas", value: "+1.7 wins" },
      { label: "RB unit", value: "#1" },
      { label: "Division path", value: "Strong" },
    ],
    support: [
      "Bijan Robinson produced 2,298 yards from scrimmage and ranked near the top of the league in yards after contact, explosive-run rate and missed-tackle avoidance.",
      "Drake London ranked seventh in yards per route run and sixth in target share, while Kyle Pitts remained a productive middle-of-field option.",
      "Atlanta ranked 31st in fumble luck, led during 14 of 17 games and finished the season on a four-game winning streak.",
      "Kevin Stefanski inherits a concentrated offensive core and a wide-open NFC South.",
    ],
    against: [
      "The model projects only +0.2 wins of year-over-year improvement.",
      "Quarterback consistency remains the swing factor, and the schedule is in the tougher half.",
    ],
  },
  cle: {
    headline: "The strongest defense-and-easy-schedule turnaround case.",
    metrics: [
      { label: "Customized SOS", value: "#4 easiest" },
      { label: "Model vs Vegas", value: "+1.3 wins" },
      { label: "Defensive efficiency", value: "#2" },
      { label: "Yards/drive allowed", value: "#1" },
    ],
    support: [
      "Cleveland finished second in total defensive efficiency and EPA allowed per play, second against the pass and fourth against the run.",
      "The defense ranked first in yards allowed per drive, third in punts forced per drive, fifth on third down and sixth in the red zone.",
      "The 2025 unit generated 53 sacks and 117 tackles for loss, giving Todd Monken a playoff-caliber defensive foundation.",
      "The customized schedule is among the league's easiest, and the team avoids short-week road games and other major rest disadvantages.",
    ],
    against: [
      "The model projects only 7.8 wins, so the Browns still need to outperform the baseline to reach the playoffs.",
      "The offense opens 32nd, quarterback uncertainty is substantial and the defense has experienced meaningful personnel turnover.",
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
  const topProfiles = ["no", "ind", "atl", "cle"].map((abbr) => candidateByAbbr.get(abbr)).filter((row): row is CoachCandidateRow => Boolean(row));

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-50 pb-16">
        <section className="border-b border-slate-800 bg-slate-950 text-white">
          <div className="mx-auto max-w-[1500px] px-4 py-9 sm:px-6 lg:px-8">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">NFL awards research</div>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">2026 Coach of the Year candidate model</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">Historical winner traits, a transparent elimination funnel and a tiered 2026 candidate board built around playoff viability, model improvement and market expectations.</p>
            <div className="mt-6"><NflGuideNav /></div>
          </div>
        </section>

        <div className="mx-auto max-w-[1500px] space-y-10 px-4 py-8 sm:px-6 lg:px-8">
          <section>
            <SectionHeading eyebrow="Historical profile" title="What the last 10 winners had in common" description="Award seasons 2016–2025. Team logos and color-coded cells make the common winner traits easier to scan." />
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
            <HistoryTable />
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
            <SectionHeading eyebrow="Top four profiles" title="The case for and against the leading candidates" description="Each team has a full-width expandable profile. New Orleans is open by default." />
            <TopCandidateAccordions rows={topProfiles} />
            <p className="mt-3 text-[10px] leading-5 text-slate-400">Coach of the Year odds are consensus or featured prices published by SportsBettingDime on June 9, 2026. Exact prices were not exposed in the article text for every coach.</p>
          </section>

          <section>
            <SectionHeading eyebrow="Tiered candidate board" title="Remaining 2026 Coach of the Year candidates" description="Vegas O/U, Coach of the Year odds, unit ratings, coach tenure and model projection remain visible. First-year coaches are highlighted in green." />
            <TieredCandidateTable candidateByAbbr={candidateByAbbr} />
          </section>

          <section className="grid gap-8 xl:grid-cols-2">
            <div><SectionHeading eyebrow="Secondary cut" title="Unlikely profiles" description="Missed the playoffs, but begin with a less typical winner profile because they already had a winning record or face a verified major schedule increase." /><CandidateTable rows={COACH_OF_YEAR_UNLIKELY} /></div>
            <div><SectionHeading eyebrow="Automatic cut" title="Eliminated: 2025 playoff teams" description="Prior playoff teams are removed in this first version of the model." /><CandidateTable rows={COACH_OF_YEAR_ELIMINATED} /></div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}

function HistoryTable() {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[1220px] text-xs"><thead><tr className="bg-slate-950 text-[9px] font-black uppercase tracking-wider text-white"><th className="px-3 py-3 text-left">Season</th><th className="px-3 py-3 text-left">Coach / Team</th><th>Years with team</th><th>Prior record</th><th>Prior playoffs</th><th>Award record</th><th>Win increase</th><th>Division</th><th>PPG increase</th><th>Award playoffs</th><th>Prior SOS</th><th>Award SOS</th></tr></thead><tbody>
        {COACH_OF_YEAR_HISTORY.map((row) => { const easier = row.awardSos < row.priorSos; return <tr key={row.season} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-3 py-3 font-black">{row.season}</td><td className="px-3 py-3"><div className="flex items-center gap-3"><img src={nflLogoUrl(row.teamAbbr)} alt="" className="h-9 w-9 object-contain" /><div><div className="font-black">{row.coach}</div><div className="text-slate-500">{row.team}</div></div></div></td><td className="text-center"><TenureBadge years={row.tenureYear} /></td><td className="text-center font-bold">{row.priorRecord}</td><BooleanCell value={row.priorPlayoffs} /><td className="bg-blue-50 text-center font-black text-blue-800">{row.awardRecord}</td><HistoricalHeatCell value={`+${row.winIncrease}`} strength={row.winIncrease / 10} positive /><BooleanCell value={row.divisionWinner} /><HistoricalHeatCell value={signed(row.ppgIncrease)} strength={row.ppgIncrease / 12} positive={row.ppgIncrease >= 0} /><BooleanCell value={row.awardPlayoffs} /><td className="text-center">{row.priorSos.toFixed(3)}</td><td className={`text-center font-black ${easier ? "bg-emerald-100 text-emerald-800" : row.awardSos > row.priorSos ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>{row.awardSos.toFixed(3)}<div className="text-[8px] uppercase tracking-wider">{easier ? "easier" : row.awardSos > row.priorSos ? "harder" : "same"}</div></td></tr>; })}
      </tbody></table></div>
    </div>
  );
}

function TopCandidateAccordions({ rows }: { rows: CoachCandidateRow[] }) {
  const [openAbbr, setOpenAbbr] = useState(rows[0]?.team.abbr ?? "no");
  return <div className="space-y-4">{rows.map((row, index) => <TopCandidateAccordion key={row.team.abbr} row={row} rank={index + 1} open={openAbbr === row.team.abbr} onToggle={() => setOpenAbbr(openAbbr === row.team.abbr ? "" : row.team.abbr)} />)}</div>;
}

function TopCandidateAccordion({ row, rank, open, onToggle }: { row: CoachCandidateRow; rank: number; open: boolean; onToggle: () => void }) {
  const copy = TOP_PROFILE_COPY[row.team.abbr];
  const odds = COY_ODDS[row.team.abbr] ?? "—";
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 bg-slate-950 px-5 py-4 text-left text-white">
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black">#{rank}</span><img src={nflLogoUrl(row.team.abbr)} alt="" className="h-10 w-10 object-contain" /><div className="min-w-0"><div className="truncate text-lg font-black">{row.team.team}</div><div className="text-xs text-slate-300">{row.coach} · {tenureLabel(row.yearsWithTeam)}</div></div></div>
      <div className="flex shrink-0 items-center gap-5"><div className="hidden text-right text-xs sm:block"><div className="font-black text-emerald-300">{row.team.projectedWins.toFixed(1)} model wins</div><div className="text-slate-300">Vegas {row.team.winTotal?.toFixed(1) ?? "—"}</div></div><div className="text-right"><div className="text-[9px] font-black uppercase tracking-wider text-sky-300">COY odds</div><div className="text-lg font-black">{odds}</div></div><span className={`text-xl transition-transform ${open ? "rotate-180" : ""}`}>⌄</span></div>
    </button>
    {open && <div className="p-5 sm:p-6"><p className="text-base font-black text-slate-900">{copy.headline}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{copy.metrics.map((metric) => <div key={metric.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{metric.label}</div><div className="mt-1 text-lg font-black text-slate-900">{metric.value}</div></div>)}</div><div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Why the case works</div><ul className="mt-3 grid gap-3 text-sm leading-6 text-slate-700 lg:grid-cols-2">{copy.support.map((item) => <li key={item} className="flex gap-2"><span className="font-black text-emerald-700">•</span><span>{item}</span></li>)}</ul></div><div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5"><div className="text-[10px] font-black uppercase tracking-wider text-red-700">Case against</div><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">{copy.against.map((item) => <li key={item} className="flex gap-2"><span className="font-black text-red-700">•</span><span>{item}</span></li>)}</ul></div></div>}
  </article>;
}

function TieredCandidateTable({ candidateByAbbr }: { candidateByAbbr: Map<string, CoachCandidateRow> }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1420px] text-xs"><CandidateHeader showScore /><tbody>{REMAINING_TIERS.map((tier) => { const rows = tier.teams.map((abbr) => candidateByAbbr.get(abbr)).filter((row): row is CoachCandidateRow => Boolean(row)); return [<TierRow key={`${tier.key}-heading`} label={tier.label} description={tier.description} tone={tier.tone} />, ...rows.map((row, index) => <CandidateRow key={row.team.abbr} row={row} showScore rankLabel={`${index + 1}`} />)]; })}</tbody></table></div></div>;
}

function CandidateTable({ rows }: { rows: CoachCandidateRow[] }) { return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-xs"><CandidateHeader /><tbody>{rows.map((row) => <CandidateRow key={row.team.abbr} row={row} />)}</tbody></table></div></div>; }

function CandidateHeader({ showScore = false }: { showScore?: boolean }) { return <thead><tr className="bg-slate-900 text-[9px] font-black uppercase tracking-wider text-white"><th className="px-3 py-3 text-left">Team / Coach</th><th>2025</th><th>Playoffs</th><th>SoS</th><th>Years w/ team</th><th>Off rating</th><th>Def rating</th><th>Vegas O/U</th><th>COY odds</th><th>Model Wins +/-</th><th>Division path</th>{showScore && <><th>Sched</th><th>Improve</th><th>Path</th><th>Total</th></>}</tr></thead>; }

function CandidateRow({ row, showScore = false, rankLabel }: { row: CoachCandidateRow; showScore?: boolean; rankLabel?: string }) {
  return <tr className="border-t border-slate-100 align-middle hover:bg-slate-50"><td className="px-3 py-3"><Link to={`/nfl/guide/team/${row.team.slug}`} className="flex items-center gap-3">{rankLabel && <span className="w-5 text-center text-[10px] font-black text-slate-400">{rankLabel}</span>}<img src={nflLogoUrl(row.team.abbr)} alt="" className="h-8 w-8 object-contain" /><span><span className="block font-black">{row.team.team}</span><span className="block text-slate-500">{row.coach}</span></span></Link></td><td className="text-center font-bold">{row.team.record2025}</td><BooleanCell value={row.made2025Playoffs} /><HeatCell value={`#${row.sharpSosRank}`} detail="hardest" strength={(row.sharpSosRank - 16.5) / 15.5} /><td className="text-center"><TenureBadge years={row.yearsWithTeam} /></td><RatingCell value={row.team.offPct} rank={row.team.offRank} /><RatingCell value={row.team.defPct} rank={row.team.defRank} /><td className="text-center"><div className="font-black">{row.team.winTotal?.toFixed(1) ?? "—"}</div><div className="text-[9px] text-slate-400">market total</div></td><td className="text-center"><div className="font-black text-blue-700">{COY_ODDS[row.team.abbr] ?? "—"}</div><div className="text-[9px] text-slate-400">consensus/featured</div></td><HeatCell value={row.team.projectedWins.toFixed(1)} detail={`${signed(row.team.regressionGap)} vs 2025 · ${signed(row.team.modelEdge ?? 0)} vs Vegas`} strength={Math.max(row.team.regressionGap, row.team.modelEdge ?? 0) / 5} greenOnly /><td className="px-2 text-center font-bold text-slate-600">{row.divisionPathLabel}</td>{showScore && row.score && <><ScoreCell value={row.score.schedule} max={25} /><ScoreCell value={row.score.improvement} max={35} /><ScoreCell value={row.score.path} max={25} /><td className="text-center"><span className="inline-flex min-w-10 justify-center rounded-full bg-blue-600 px-2 py-1 font-black text-white">{row.score.total}</span></td></>}</tr>;
}

function TierRow({ label, description, tone }: { label: string; description: string; tone: string }) { const classes = tone === "emerald" ? "bg-emerald-100 text-emerald-900" : tone === "blue" ? "bg-blue-100 text-blue-900" : tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"; return <tr className={classes}><td colSpan={15} className="px-4 py-3"><span className="font-black uppercase tracking-wider">{label}</span><span className="ml-3 text-[10px] font-bold opacity-75">{description}</span></td></tr>; }
function TenureBadge({ years }: { years: number }) { const first = years === 1; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${first ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" : "bg-slate-100 text-slate-600"}`}>{tenureLabel(years)}</span>; }
function HistoricalHeatCell({ value, strength, positive }: { value: string; strength: number; positive: boolean }) { const alpha = 0.08 + Math.min(1, Math.abs(strength)) * 0.24; return <td className="text-center font-black" style={{ backgroundColor: positive ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`, color: positive ? "#047857" : "#b91c1c" }}>{value}</td>; }
function RatingCell({ value, rank }: { value: number; rank: number }) { return <HeatCell value={`${value > 0 ? "+" : ""}${value.toFixed(1)}%`} detail={`Rank #${rank}`} strength={value / 10} />; }
function HeatCell({ value, detail, strength, greenOnly = false }: { value: string; detail: string; strength: number; greenOnly?: boolean }) { const clamped = Math.max(-1, Math.min(1, strength)); const positive = clamped >= 0; const alpha = 0.05 + Math.abs(clamped) * 0.24; return <td className="px-2 py-2 text-center" style={{ backgroundColor: positive || greenOnly ? `rgba(16,185,129,${Math.max(0.04, positive ? alpha : 0.04)})` : `rgba(239,68,68,${alpha})` }}><div className="font-black" style={{ color: positive || greenOnly ? "#047857" : "#b91c1c" }}>{value}</div><div className="text-[9px] font-bold text-slate-500">{detail}</div></td>; }
function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="mb-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div><h2 className="mt-1 text-2xl font-black text-slate-900">{title}</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">{description}</p></div>; }
function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "neutral" }) { return <div className={`rounded-2xl border p-4 shadow-sm ${tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-2xl font-black ${tone === "good" ? "text-emerald-700" : "text-slate-900"}`}>{value}</div></div>; }
function FunnelTile({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "red" | "amber" | "green" }) { const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"; return <div className={`rounded-2xl border p-5 ${cls}`}><div className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</div><div className="mt-1 text-4xl font-black">{value}</div><div className="mt-1 text-xs font-bold opacity-80">{detail}</div></div>; }
function BooleanCell({ value }: { value: boolean }) { return <td className="text-center"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${value ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{value ? "Yes" : "No"}</span></td>; }
function ScoreCell({ value, max }: { value: number; max: number }) { const ratio = value / max; return <td className="px-2 py-2 text-center" style={{ backgroundColor: `rgba(16,185,129,${0.04 + ratio * 0.18})` }}><span className="font-black text-emerald-800">{value}</span><span className="text-[9px] text-slate-400">/{max}</span></td>; }
function tenureLabel(years: number) { return years === 1 ? "1st year" : years === 2 ? "2nd year" : years === 3 ? "3rd year" : `${years}th year`; }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }
