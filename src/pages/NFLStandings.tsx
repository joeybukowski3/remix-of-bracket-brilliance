import { useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { NFL_DIVISIONS, NFL_DIVISION_ORDER, nflLogoUrl, type NflDivisionTeam } from "@/data/nflPreseason2026";
import { slugifyNflTeam } from "@/lib/nfl/guide2026";
import NflGuideNav from "@/components/nfl/NflGuideNav";

function winPct(record: string) {
  const [wins, losses] = record.split("-").map((value) => parseInt(value, 10) || 0);
  return wins + losses > 0 ? wins / (wins + losses) : 0;
}

function rankHeat(rank: number | null) {
  if (rank == null) return { background: "transparent", color: "#5a6878" };
  const t = (rank - 1) / 31;
  if (t <= 0.5) {
    const k = 1 - t * 2;
    return { background: `rgba(22,163,74,${0.12 + k * 0.30})`, color: k > 0.4 ? "#0f5132" : "#166534" };
  }
  const k = (t - 0.5) * 2;
  return { background: `rgba(220,38,38,${0.10 + k * 0.30})`, color: k > 0.4 ? "#7f1d1d" : "#991b1b" };
}

function TeamLogo({ team }: { team: NflDivisionTeam }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="flex h-7 w-7 items-center justify-center rounded-full text-[8px] font-black text-white" style={{ background: team.color }}>{team.abbr.toUpperCase()}</span>;
  return <img src={nflLogoUrl(team.abbr)} alt="" className="h-7 w-7 object-contain" loading="lazy" onError={() => setFailed(true)} />;
}

function DivisionCard({ name, teams }: { name: string; teams: NflDivisionTeam[] }) {
  const sorted = [...teams].sort((a, b) => winPct(b.record) - winPct(a.record) || (a.pwrRank ?? 99) - (b.pwrRank ?? 99));
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className={`px-4 py-3 text-xs font-black uppercase tracking-wider text-white ${name.startsWith("AFC") ? "bg-slate-950" : "bg-slate-700"}`}>{name}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[430px] text-xs">
          <thead><tr className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500"><th className="px-2 py-2 text-left">Team</th><th>W-L</th><th>Pwr</th><th>Off</th><th>Def</th></tr></thead>
          <tbody>
            {sorted.map((team) => {
              const heat = rankHeat(team.pwrRank);
              return (
                <tr key={team.abbr} className="border-t border-slate-100 hover:bg-blue-50/40">
                  <td className="p-0">
                    <Link to={`/nfl/guide/team/${slugifyNflTeam(team.team)}`} className="flex items-center gap-2 px-2 py-2 font-black text-slate-800 hover:text-blue-700 hover:underline" aria-label={`Open ${team.team} team dashboard`}>
                      <span className="h-7 w-1 rounded-full" style={{ background: team.color }} aria-hidden />
                      <TeamLogo team={team} />
                      <span className="whitespace-nowrap">{team.team}</span>
                    </Link>
                  </td>
                  <td className="text-center font-bold text-slate-800">{team.record}</td>
                  <td className="text-center font-black" style={heat}>{team.pwrRank ?? "—"}</td>
                  <td className="text-center font-semibold text-slate-500">{team.offRank ?? "—"}</td>
                  <td className="text-center font-semibold text-slate-500">{team.defRank ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function NFLStandings() {
  const seo = getSeoMeta("nfl");
  usePageSeo({
    title: "2026 NFL Standings by Division | Joe Knows Ball",
    description: "2026 NFL standings by division with clickable team dashboards, preseason power rankings and 2025 records.",
    path: "/nfl/standings",
    noindex: seo.noindex ?? false,
  });

  return (
    <SiteShell>
      <main className="site-page pb-16 pt-8">
        <div className="site-container site-stack">
          <section>
            <div className="text-[11px] font-bold uppercase tracking-[.16em] text-blue-600">NFL · Standings</div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">2026 NFL Standings by Division</h1>
            <p className="mt-2 text-sm text-slate-500">Sorted by record, then preseason power rank · Select a team for its full dashboard</p>
            <div className="mt-5"><NflGuideNav /></div>
          </section>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {NFL_DIVISION_ORDER.filter((division) => NFL_DIVISIONS[division]).map((division) => <DivisionCard key={division} name={division} teams={NFL_DIVISIONS[division]} />)}
          </div>
          <p className="mt-4 text-[11px] leading-5 text-slate-400">Pwr = preseason power rank (1–32) · Off / Def = unit rank · W-L reflects 2025 final records until the 2026 season begins.</p>
        </div>
      </main>
    </SiteShell>
  );
}
