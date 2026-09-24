import { MATRIX_RANK_TIERS } from "@/lib/nfl/matchupMatrixRankTier";

/**
 * Compact legend for the Weekly Matchups matrix's heatmap. Swatches use the
 * exact canonical JKB tier styles (matchupMatrixRankTier.ts, sourced from
 * `PERCENTILE_TIERS` — the same scale K Props / Strikeout Props render from)
 * so this legend reads as the same visual language as every other JKB
 * ranking table.
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
              className="inline-block h-2 w-4 rounded-full border border-black/10"
              style={{ backgroundColor: tier.style.backgroundColor }}
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
