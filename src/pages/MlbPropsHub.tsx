import { Link } from "react-router-dom";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { ScorePill, TeamLogoBadge } from "@/pages/MlbHrProps";

const DASH = "--";
const formatPercent = (value: number | null | undefined) => Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : DASH;

function ToolCard({ title, body, to }: { title: string; body: string; to: string }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300">
      <div className="text-base font-bold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </Link>
  );
}

export default function MlbPropsHub() {
  const { batters, strikeoutRows, batterVsPitcherRows } = useMlbPropsData();
  const topBatters = batters
    .filter((b) => !(b.barrelRate != null && b.barrelRate > 25) && !(b.atBats != null && b.atBats < 50))
    .slice()
    .sort((a, b) => (b.adjustedHrScore ?? b.hrScore) - (a.adjustedHrScore ?? a.hrScore))
    .slice(0, 8);
  const topStrikeouts = strikeoutRows.slice(0, 8);
  const topMatchups = batterVsPitcherRows.slice(0, 8);

  usePageSeo({
    title: "Today's MLB Props",
    description: "MLB props today with home run props, pitcher strikeout props, batter props, and batter vs pitcher matchup context from the Joe Knows Ball prop betting model.",
    path: "/mlb/props",
  });

  return (
      <main className="site-page bg-[#edf2f7] py-5 text-slate-900">
        <div className="space-y-5">
          <section className="rounded-[28px] bg-[#0f2748] px-5 py-5 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">MLB prop betting model</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Today&apos;s MLB Props</h1>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-sky-100">
              Daily MLB props dashboard for batter props, pitcher props, home run props, strikeout props, and batter-vs-pitcher matchup context.
            </p>
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            <ToolCard title="MLB HR Props" body="Batter-focused home run model with park, power, and pitcher HR vulnerability." to="/mlb/hr-props" />
            <ToolCard title="MLB Strikeout Props" body="Pitcher K prop rankings by pitcher skill and opponent strikeout tendency." to="/mlb/strikeout-props" />
            <ToolCard title="Batter vs Pitcher" body="Table-first matchup board for batter power, pitcher attackability, and park context." to="/mlb/batter-vs-pitcher" />
          </div>

          <section className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Batters</h2>
                <Link to="/mlb/hr-props" className="text-xs font-semibold text-sky-800 hover:underline">Open HR props</Link>
              </div>
              <div className="space-y-2">
                {topBatters.map((row) => (
                  <div key={`${row.player}-${row.team}`} className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{row.player} <span className="text-xs text-slate-500">{row.position}</span></div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><TeamLogoBadge team={row.team} size={18} /> vs {row.opponent}</div>
                    </div>
                    <ScorePill value={row.hrScore} />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Pitchers</h2>
                <Link to="/mlb/strikeout-props" className="text-xs font-semibold text-sky-800 hover:underline">Open K props</Link>
              </div>
              <div className="space-y-2">
                {topStrikeouts.map((row) => (
                  <div key={`${row.pitcher}-${row.team}`} className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{row.pitcher}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><TeamLogoBadge team={row.team} size={18} /> vs {row.opponent} | Opp K {formatPercent(row.opponentTeamKRate)}</div>
                    </div>
                    <ScorePill value={row.kMatchupScore} />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Batters vs Pitchers</h2>
                <Link to="/mlb/batter-vs-pitcher" className="text-xs font-semibold text-sky-800 hover:underline">Open table</Link>
              </div>
              <div className="space-y-2">
                {topMatchups.map((row) => (
                  <div key={`${row.player}-${row.opposingPitcher}`} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="truncate text-sm font-semibold text-slate-900">{row.player} <span className="text-xs text-slate-500">{row.position}</span></div>
                    <div className="mt-1 text-xs text-slate-500">{row.team} vs {row.opposingPitcher} | HR target {row.hrTargetScore.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
  );
}
