import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { ScorePill, TeamLogoBadge } from "@/pages/MlbHrProps";

const DASH = "--";
const formatPercent = (value: number | null | undefined) => Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : DASH;

export default function MlbBatterVsPitcher() {
  const { batterVsPitcherRows, pitchers } = useMlbPropsData();
  const pitcherTeamByName = new Map(pitchers.map((pitcher) => [`${pitcher.gameKey}|${pitcher.pitcher}`, pitcher.team]));

  usePageSeo({
    title: "MLB Batter vs Pitcher Matchups Today",
    description: "MLB batter vs pitcher matchups today with batter positions, team logos, pitcher attackability, HR scores, park factors, and matchup model scores.",
    path: "/mlb/batter-vs-pitcher",
  });

  return (
    <SiteShell>
      <main className="site-page bg-[#edf2f7] py-5 text-slate-900">
        <div className="site-container space-y-5" style={{ maxWidth: "none" }}>
          <section className="rounded-[28px] bg-[#0f2748] px-5 py-5 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Matchup table</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">MLB Batter vs Pitcher Matchups</h1>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-sky-100">
              Compact table for MLB batter vs pitcher matchups, park context, batter HR quality, pitcher vulnerability, and model scores.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/mlb/props" className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">Props Hub</Link>
              <Link to="/mlb/hr-props" className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">HR Props</Link>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    {["Rank", "Batter", "Pos", "Team", "Pitcher", "P Team", "Game", "Park", "Batter HR", "Pitcher HR VS", "HR Target", "Composite", "K%", "Barrel%"].map((label) => (
                      <th key={label} className="border-b border-slate-200 px-4 py-3 text-left font-semibold whitespace-nowrap">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batterVsPitcherRows.map((row) => {
                    const pitcherTeam = pitcherTeamByName.get(`${row.gameKey}|${row.opposingPitcher}`);
                    return (
                      <tr key={`${row.rank}-${row.player}-${row.opposingPitcher}`} className="odd:bg-white even:bg-slate-50/60">
                        <td className="border-b border-slate-100 px-4 py-3">{row.rank}</td>
                        <td className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">{row.player}</td>
                        <td className="border-b border-slate-100 px-4 py-3">{row.position}</td>
                        <td className="border-b border-slate-100 px-4 py-3"><TeamLogoBadge team={row.team} size={20} /></td>
                        <td className="border-b border-slate-100 px-4 py-3">{row.opposingPitcher}</td>
                        <td className="border-b border-slate-100 px-4 py-3">{pitcherTeam ? <TeamLogoBadge team={pitcherTeam} size={20} /> : DASH}</td>
                        <td className="border-b border-slate-100 px-4 py-3">{row.gameKey}</td>
                        <td className="border-b border-slate-100 px-4 py-3">{row.park}</td>
                        <td className="border-b border-slate-100 px-4 py-3"><ScorePill value={row.hrScore} /></td>
                        <td className="border-b border-slate-100 px-4 py-3"><ScorePill value={row.opposingPitcherHrVs} /></td>
                        <td className="border-b border-slate-100 px-4 py-3"><ScorePill value={row.hrTargetScore} /></td>
                        <td className="border-b border-slate-100 px-4 py-3"><ScorePill value={row.bestMatchupScore} /></td>
                        <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.kRate)}</td>
                        <td className="border-b border-slate-100 px-4 py-3">{formatPercent(row.barrelRate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
