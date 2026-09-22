import { MATRIX_RANK_TIERS } from "@/lib/nfl/matchupMatrixRankTier";

/**
 * Compact legend for the Weekly Matchups matrix's JKB gold -> red heatmap.
 *
 * Deliberately separate from MatchupRankLegend (Team Comparison's
 * green -> red legend) since this matrix uses its own dedicated palette —
 * see matchupMatrixRankTier.ts. Elite (rank 1-4) is gold, not green.
 */
export default function MatchupMatrixRankLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">
        Rank tiers
      </span>
      <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {MATRIX_RANK_TIERS.map((tier) => (
          <li key={tier.id} className="flex items-center gap-1">
            <span
              aria-hidden
              className={`inline-block h-2 w-4 rounded-full border border-black/10 ${tier.cell}`}
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
