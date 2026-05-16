import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { ScorePill, TeamLogoBadge } from "@/pages/MlbHrProps";

const DASH = "--";
const formatPercent = (value: number | null | undefined) => Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : DASH;

export default function MlbStrikeoutProps() {
  const { strikeoutRows } = useMlbPropsData();

  usePageSeo({
    title: "MLB Strikeout Props Today",
    description: "MLB strikeout props and pitcher strikeout prop rankings using pitcher K ability, opponent team strikeout tendency, park context, and confidence tags.",
    path: "/mlb/strikeout-props",
  });

  return (
    <SiteShell>
      <main className="site-page bg-[#edf2f7] py-5 text-slate-900">
        <div className="site-container space-y-5" style={{ maxWidth: "none" }}>
          <section className="rounded-[28px] bg-[#0f2748] px-5 py-5 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Pitcher prop model</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">MLB Strikeout Props Today</h1>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-sky-100">
              Pitcher K Matchup ranks today&apos;s probable pitchers by strikeout ability and opponent team strikeout tendency using the current page data.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/mlb/props" className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">Props Hub</Link>
              <Link to="/mlb/hr-props" className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">HR Props</Link>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {strikeoutRows.slice(0, 8).map((row) => (
              <article key={`${row.pitcher}-${row.team}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">{row.pitcher}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><TeamLogoBadge team={row.team} size={18} /> vs {row.opponent}</div>
                  </div>
                  <ScorePill value={row.kMatchupScore} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] uppercase text-slate-400">Opp K%</div><div className="font-semibold">{formatPercent(row.opponentTeamKRate)}</div></div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] uppercase text-slate-400">K Ability</div><div className="font-semibold">{row.pitcherKAbilityScore.toFixed(1)}</div></div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] uppercase text-slate-400">K%</div><div className="font-semibold">{formatPercent(row.kRate)}</div></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.reasonTags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>)}
                </div>
              </article>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm text-slate-500">
              Opponent Team K% is derived from the projected/listed hitters in the current MLB props data when no team-level K% field is present.
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    {["Rank", "Pitcher", "Team", "Opponent", "Opponent Team K%", "Pitcher K Score", "Pitcher K%", "Whiff%", "Matchup Score", "Park", "Lean"].map((label) => (
                      <th key={label} className="border-b border-slate-200 px-4 py-3 text-left font-semibold whitespace-nowrap">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strikeoutRows.map((row) => (
                    <tr key={`${row.rank}-${row.pitcher}-${row.opponent}`} className="odd:bg-white even:bg-slate-50/60">
                      <td className="border-b border-slate-100 px-4 py-3">{row.rank}</td>
                      <td className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">{row.pitcher}</td>
                      <td className="border-b border-slate-100 px-4 py-3"><TeamLogoBadge team={row.team} size={20} /></td>
                      <td className="border-b border-slate-100 px-4 py-3"><TeamLogoBadge team={row.opponent} size={20} /></td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.opponentTeamKRate)}</td>
                      <td className="border-b border-slate-100 px-4 py-3"><ScorePill value={row.pitcherKAbilityScore} /></td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.kRate)}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.whiffRate)}</td>
                      <td className="border-b border-slate-100 px-4 py-3"><ScorePill value={row.kMatchupScore} /></td>
                      <td className="border-b border-slate-100 px-4 py-3">{row.park}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="flex flex-wrap gap-1">{row.reasonTags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
