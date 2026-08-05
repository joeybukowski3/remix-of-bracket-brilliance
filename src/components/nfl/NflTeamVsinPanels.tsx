import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import NflProvenanceDetails from "@/components/nfl/provenance/NflProvenanceDetails";
import {
  NFL_VSIN_GUIDE_SOURCE,
  getNflVsinGuideTeam,
  type NflVsinGuideStat,
} from "@/lib/nfl/vsinGuide2026";

export function NflTeamHeaderOdds({ team }: { team: NflGuideTeamNormalized }) {
  const guideTeam = getNflVsinGuideTeam(team.abbr);
  if (!guideTeam) return null;

  const odds = [
    guideTeam.odds.superBowl,
    guideTeam.odds.conference,
    guideTeam.odds.division,
  ];

  return (
    <section className="w-full lg:max-w-[420px]" aria-label={`${team.teamName} futures odds from the VSiN guide`}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">Odds to win</div>
        <div className="text-[9px] uppercase tracking-wider text-slate-400">VSiN guide · p.{guideTeam.sourcePage}</div>
      </div>
      {/* Three plain figures on the dark surface. The previous treatment put
          each price inside a white-ringed rose-600 disc, which read as an alert
          rather than a price — and gave a source-quoted number more visual
          weight than the site's own model figures further down the page. */}
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded border border-white/20 bg-white/20">
        {odds.map((odd) => (
          <div key={odd.label} className="bg-slate-950/70 px-2.5 py-2">
            <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{odd.label}</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums text-white">{odd.displayValue}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function NflTeamStatsSidebar({ team }: { team: NflGuideTeamNormalized }) {
  const guideTeam = getNflVsinGuideTeam(team.abbr);
  if (!guideTeam) return null;

  return (
    <aside className="xl:sticky xl:top-24 xl:self-start" aria-label={`${team.teamName} 2025 statistics`}>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Last season</div>
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">2025 team statistics</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Values and NFL ranks from the source team page.</p>
        </div>

        <StatsGroup title="Offensive statistics" rows={guideTeam.statistics.offense} />
        <StatsGroup title="Defensive statistics" rows={guideTeam.statistics.defense} />

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] leading-4 text-slate-500">
          <NflProvenanceDetails
            provenance={{
              sourceKind: "external",
              sourceLabel: `${NFL_VSIN_GUIDE_SOURCE.title}, page ${guideTeam.sourcePage}`,
              season: NFL_VSIN_GUIDE_SOURCE.statsSeason,
            }}
          />
          <p className="mt-1">Rank 1 is best. Values are displayed exactly as listed in the guide.</p>
        </div>
      </div>
    </aside>
  );
}

function StatsGroup({ title, rows }: { title: string; rows: NflVsinGuideStat[] }) {
  return (
    <section>
      <div className="grid grid-cols-[minmax(0,1fr)_64px_44px] items-center gap-2 border-y border-slate-200 bg-slate-100 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
        <span>{title}</span>
        <span className="text-right">Value</span>
        <span className="text-right">Rank</span>
      </div>
      <div className="divide-y divide-slate-100 px-3">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_64px_44px] items-center gap-2 py-2 text-xs">
            <span className="min-w-0 leading-4 text-slate-600">{row.label}</span>
            <span className="text-right font-semibold tabular-nums text-slate-900">{row.displayValue}</span>
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
      ? "text-red-700"
      : "text-slate-500";

  return <span className={`text-right font-semibold tabular-nums ${className}`}>#{rank}</span>;
}
