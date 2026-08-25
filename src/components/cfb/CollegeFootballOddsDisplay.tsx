import {
  formatFavoriteSpread,
  formatMoneyline,
  formatSpread,
  formatTotal,
} from "@/lib/cfb/format";
import type { CfbGame, CfbGameOdds } from "@/data/cfb/types";

type Props = {
  odds: CfbGameOdds;
  /** Provide the full game + team abbreviations to show the spread relative to the favorite (e.g. "TCU -7.5"). */
  game?: Pick<CfbGame, "homeTeamId" | "awayTeamId" | "odds">;
  awayAbbreviation?: string;
  homeAbbreviation?: string;
  compact?: boolean;
  className?: string;
};

export default function CollegeFootballOddsDisplay({
  odds,
  game,
  awayAbbreviation,
  homeAbbreviation,
  compact = false,
  className = "",
}: Props) {
  const spread =
    game && awayAbbreviation && homeAbbreviation
      ? formatFavoriteSpread(game, awayAbbreviation, homeAbbreviation)
      : formatSpread(odds.currentSpread ?? odds.openingSpread);
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
    <div
      className={`grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-sm border border-slate-200 bg-slate-50 text-center text-xs ${className}`}
    >
      <div className="px-2 py-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Spread</div>
        <div className="mt-0.5 font-semibold tabular-nums text-slate-900">{spread}</div>
      </div>
      <div className="px-2 py-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
        <div className="mt-0.5 font-semibold tabular-nums text-slate-900">{total}</div>
      </div>
      <div className="px-2 py-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">ML</div>
        <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
          {awayMl} / {homeMl}
        </div>
      </div>
    </div>
  );
}
