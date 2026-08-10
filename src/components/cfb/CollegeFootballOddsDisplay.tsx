import {
  formatMoneyline,
  formatSpread,
  formatTotal,
} from "@/lib/cfb/format";
import type { CfbGameOdds } from "@/data/cfb/types";

type Props = {
  odds: CfbGameOdds;
  compact?: boolean;
  className?: string;
};

export default function CollegeFootballOddsDisplay({
  odds,
  compact = false,
  className = "",
}: Props) {
  const spread = formatSpread(odds.currentSpread ?? odds.openingSpread);
  const total = formatTotal(odds.currentTotal ?? odds.openingTotal);
  const awayMl = formatMoneyline(odds.awayMoneyline);
  const homeMl = formatMoneyline(odds.homeMoneyline);

  if (compact) {
    return (
      <span className={`tabular-nums text-slate-600 ${className}`}>
        {spread} · O/U {total}
      </span>
    );
  }

  return (
    <div className={`grid grid-cols-3 gap-2 text-center text-xs ${className}`}>
      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Spread</div>
        <div className="mt-0.5 font-semibold tabular-nums text-slate-900">{spread}</div>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
        <div className="mt-0.5 font-semibold tabular-nums text-slate-900">{total}</div>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">ML</div>
        <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
          {awayMl} / {homeMl}
        </div>
      </div>
    </div>
  );
}
