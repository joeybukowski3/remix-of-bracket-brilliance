import { NFL_RANK_TIERS } from "@/lib/nfl/rankTier";

/**
 * Compact legend for the rank-tier colour system.
 *
 * Present because colour is a secondary cue only — every badge also carries its
 * numeric rank — but a reader still benefits from knowing where the bands sit.
 *
 * Restyled to sit as a quiet single row beneath the table rather than a raised
 * card: the swatches are pill-shaped to match the rank chips they explain, and
 * the band ranges are set apart from their labels. The eight bands themselves,
 * and their bounds, come from `rankTier.ts` unchanged.
 */
export default function MatchupRankLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">
        Rank tiers
      </span>
      <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {NFL_RANK_TIERS.map((tier) => (
          <li key={tier.id} className="flex items-center gap-1">
            <span
              aria-hidden
              className={`inline-block h-2 w-4 rounded-full border ${tier.badge}`}
            />
            <span className="text-[10px] font-semibold text-slate-700">
              {tier.label}
              <span className="ml-1 font-bold tabular-nums text-slate-500">
                {tier.min}–{tier.max}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
