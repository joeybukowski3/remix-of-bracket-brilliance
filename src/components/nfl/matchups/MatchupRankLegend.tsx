import { NFL_RANK_TIERS } from "@/lib/nfl/rankTier";

/**
 * Compact legend for the rank-tier colour system.
 *
 * Present because colour is a secondary cue only — every badge also carries its
 * numeric rank — but a reader still benefits from knowing where the bands sit.
 */
export default function MatchupRankLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
        Rank tiers
      </span>
      <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {NFL_RANK_TIERS.map((tier) => (
          <li key={tier.id} className="flex items-center gap-1">
            <span
              aria-hidden
              className={`inline-block h-2.5 w-2.5 rounded-sm border ${tier.badge}`}
            />
            <span className="text-[10px] font-bold text-slate-600">
              {tier.label}
              <span className="ml-1 tabular-nums text-slate-400">
                {tier.min}–{tier.max}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
