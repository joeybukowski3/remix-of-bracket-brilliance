import type { NflGuideTeam } from "@/lib/nfl/guide2026";
import {
  NFL_VSIN_GUIDE_SOURCE,
  getNflVsinGuideTeam,
  type NflVsinGuideStat,
} from "@/lib/nfl/vsinGuide2026";

export function NflTeamHeaderOdds({ team }: { team: NflGuideTeam }) {
  const guideTeam = getNflVsinGuideTeam(team.abbr);
  if (!guideTeam) return null;

  const odds = [
    guideTeam.odds.superBowl,
    guideTeam.odds.conference,
    guideTeam.odds.division,
  ];

  return (
    <section className="w-full lg:max-w-[520px]" aria-label={`${team.team} futures odds from the VSiN guide`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">Odds to win</div>
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">VSiN guide · page {guideTeam.sourcePage}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {odds.map((odd) => (
          <div key={odd.label} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-3 sm:flex-col sm:items-start">
              <div className="flex h-14 min-w-14 items-center justify-center rounded-full border-2 border-white/90 bg-rose-600 px-2 text-base font-black text-white shadow-lg">
                {odd.displayValue}
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-300">To win</div>
                <div className="mt-0.5 truncate text-sm font-black uppercase text-white">{odd.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NflTeamStatsSidebar({ team }: { team: NflGuideTeam }) {
  const guideTeam = getNflVsinGuideTeam(team.abbr);
  if (!guideTeam) return null;

  return (
    <aside className="xl:sticky xl:top-24 xl:self-start" aria-label={`${team.team} 2025 statistics`}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Last season</div>
          <h2 className="mt-1 text-xl font-black">2025 team statistics</h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">Values and NFL ranks from the team page in the {NFL_VSIN_GUIDE_SOURCE.title}.</p>
        </div>

        <StatsGroup title="Offensive statistics" rows={guideTeam.statistics.offense} />
        <StatsGroup title="Defensive statistics" rows={guideTeam.statistics.defense} />

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] leading-4 text-slate-500">
          Source: {NFL_VSIN_GUIDE_SOURCE.title}, page {guideTeam.sourcePage}. Rank 1 is best. Values are displayed exactly as listed in the guide.
        </div>
      </div>
    </aside>
  );
}

function StatsGroup({ title, rows }: { title: string; rows: NflVsinGuideStat[] }) {
  return (
    <section>
      <div className="grid grid-cols-[minmax(0,1fr)_64px_44px] items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-slate-600">
        <span>{title}</span>
        <span className="text-right">Value</span>
        <span className="text-right">Rank</span>
      </div>
      <div className="divide-y divide-slate-100 px-4">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_64px_44px] items-center gap-2 py-2.5 text-xs">
            <span className="min-w-0 font-bold leading-4 text-slate-700">{row.label}</span>
            <span className="text-right font-black tabular-nums text-slate-950">{row.displayValue}</span>
            <RankValue rank={row.rank} />
          </div>
        ))}
      </div>
    </section>
  );
}

function RankValue({ rank }: { rank: number }) {
  const className = rank <= 10
    ? "text-emerald-700"
    : rank >= 24
      ? "text-red-600"
      : "text-slate-600";

  return <span className={`text-right font-black tabular-nums ${className}`}>#{rank}</span>;
}
