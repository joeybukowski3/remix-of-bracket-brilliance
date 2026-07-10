import { formatSigned } from "@/lib/nfl/guideData";
import type { NflMatchupSpread } from "@/lib/nfl/matchups";

/**
 * Dedicated spread area. The repository intentionally ingests no betting lines,
 * so this renders "Spread: N/A" until a real line is attached. It never derives
 * a line from power ratings.
 */
export default function SpreadPlaceholder({
  spread,
  favoriteName,
  className = "",
}: {
  spread: NflMatchupSpread | null;
  favoriteName?: string;
  className?: string;
}) {
  if (!spread) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 ${className}`}>
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Spread</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-black text-slate-500">N/A</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Spread</span>
      <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-black text-white">
        {favoriteName ?? spread.favoriteSlug} {formatSigned(-Math.abs(spread.value))}
      </span>
      {spread.bookmaker && <span className="text-[10px] text-slate-400">{spread.bookmaker}</span>}
    </div>
  );
}
