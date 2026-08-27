import type { ComponentType } from "react";
import { CircleDollarSign, Scale, Activity } from "lucide-react";
import type { CfbGame, CfbGameOdds } from "@/data/cfb/types";
import { formatFavoriteSpread, formatFavoriteSpreadValue, formatMoneyline, formatTotal } from "@/lib/cfb/format";
import { cn } from "@/lib/utils";

type Props = {
  odds: CfbGameOdds;
  game: Pick<CfbGame, "homeTeamId" | "awayTeamId" | "odds">;
  awayAbbreviation: string;
  homeAbbreviation: string;
  /** Team colors for the mobile card's thin top split accent. Desktop presentation does not use these. */
  awayColor?: string;
  homeColor?: string;
};

function MobileMarketColumn({
  icon: Icon,
  accentClass,
  label,
  value,
  supporting,
}: {
  icon: ComponentType<{ className?: string }>;
  accentClass: string;
  label: string;
  value: string;
  supporting?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
      <span className={cn("flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide", accentClass)}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      <span className="text-xl font-black tabular-nums text-slate-900">{value}</span>
      {supporting && <span className="text-[9px] font-semibold text-slate-400">{supporting}</span>}
    </div>
  );
}

/**
 * Three-column market summary (spread / total / moneyline). Values and
 * semantics come entirely from the shared format helpers and the game's own
 * odds — desktop and mobile are presentation-only variants of the same data.
 */
export default function CollegeFootballMarketStrip({
  odds,
  game,
  awayAbbreviation,
  homeAbbreviation,
  awayColor,
  homeColor,
}: Props) {
  const spread = formatFavoriteSpread(game, awayAbbreviation, homeAbbreviation);
  const total = formatTotal(odds.currentTotal ?? odds.openingTotal);
  const awayMl = formatMoneyline(odds.awayMoneyline);
  const homeMl = formatMoneyline(odds.homeMoneyline);
  const noOdds = odds.currentSpread == null && odds.openingSpread == null;
  const hasOpenSpreadFootnote =
    odds.openingSpread != null && odds.currentSpread != null && odds.openingSpread !== odds.currentSpread;
  const openSpreadText = formatFavoriteSpreadValue(odds.openingSpread, awayAbbreviation, homeAbbreviation);

  return (
    <>
      {/* Desktop: unchanged icon-bubble 3-column strip. */}
      <div data-testid="cfb-market-desktop" className="hidden overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm sm:block">
        <div className="grid grid-cols-3 divide-x divide-slate-200">
          <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-600 shadow-sm">
              <Scale className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Spread</span>
            <span className="text-lg font-black tabular-nums text-slate-900 sm:text-xl">{spread}</span>
            {hasOpenSpreadFootnote && (
              <span className="text-[10px] font-semibold text-slate-400">Open: {openSpreadText}</span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total</span>
            <span className="text-lg font-black tabular-nums text-slate-900 sm:text-xl">{total}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600 shadow-sm">
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
          <p className="border-t border-slate-200 px-3 py-2 text-center text-xs text-slate-500">
            No odds currently available.
          </p>
        )}
      </div>

      {/* Mobile: compact rounded-2xl card with a thin team-color split accent. */}
      <div
        data-testid="cfb-market-mobile"
        className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm sm:hidden"
      >
        <div className="flex h-1" aria-hidden="true">
          <div className="flex-1" style={{ background: awayColor ?? "#334155" }} />
          <div className="flex-1" style={{ background: homeColor ?? "#334155" }} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-200">
          <MobileMarketColumn icon={Scale} accentClass="text-indigo-600" label="Spread" value={spread} supporting={hasOpenSpreadFootnote ? `Open: ${openSpreadText}` : undefined} />
          <MobileMarketColumn icon={Activity} accentClass="text-cyan-600" label="Total" value={total} />
          <MobileMarketColumn
            icon={CircleDollarSign}
            accentClass="text-emerald-600"
            label="Moneyline"
            value={`${awayMl} / ${homeMl}`}
            supporting={`${awayAbbreviation} / ${homeAbbreviation}`}
          />
        </div>
        {noOdds && (
          <p className="border-t border-slate-200 px-3 py-2 text-center text-xs text-slate-500">
            No odds currently available.
          </p>
        )}
      </div>
    </>
  );
}
