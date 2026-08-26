import { CircleDollarSign, Scale, Activity } from "lucide-react";
import type { CfbGame, CfbGameOdds } from "@/data/cfb/types";
import { formatFavoriteSpread, formatMoneyline, formatSpread, formatTotal } from "@/lib/cfb/format";

type Props = {
  odds: CfbGameOdds;
  game: Pick<CfbGame, "homeTeamId" | "awayTeamId" | "odds">;
  awayAbbreviation: string;
  homeAbbreviation: string;
};

/**
 * Three-column market summary (spread / total / moneyline) matching the
 * approved matchup-detail mockup. Values and semantics are unchanged from
 * the shared format helpers — this is presentation only.
 */
export default function CollegeFootballMarketStrip({ odds, game, awayAbbreviation, homeAbbreviation }: Props) {
  const spread = formatFavoriteSpread(game, awayAbbreviation, homeAbbreviation);
  const total = formatTotal(odds.currentTotal ?? odds.openingTotal);
  const awayMl = formatMoneyline(odds.awayMoneyline);
  const homeMl = formatMoneyline(odds.homeMoneyline);
  const noOdds = odds.currentSpread == null && odds.openingSpread == null;

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-3 divide-x divide-slate-200">
        <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Scale className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Spread</span>
          <span className="text-lg font-black tabular-nums text-slate-900 sm:text-xl">{spread}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total</span>
          <span className="text-lg font-black tabular-nums text-slate-900 sm:text-xl">{total}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Moneyline</span>
          <span className="text-lg font-black tabular-nums text-slate-900 sm:text-xl">
            {awayMl} / {homeMl}
          </span>
          <span className="text-[10px] font-semibold text-slate-400">
            {awayAbbreviation} / {homeAbbreviation}
          </span>
        </div>
      </div>
      {noOdds && (
        <p className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-500">
          No odds currently available.
        </p>
      )}
    </div>
  );
}
