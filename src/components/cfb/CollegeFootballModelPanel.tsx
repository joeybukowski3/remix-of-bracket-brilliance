import { LineChart } from "lucide-react";
import type { CfbGame } from "@/data/cfb/types";
import { formatNullableNumber, formatSpread, formatTotal } from "@/lib/cfb/format";

type Props = {
  game: Pick<CfbGame, "model" | "odds">;
};

const PLACEHOLDER_SLOTS = ["Projected Spread", "Projected Total", "Win Probability", "Market vs JKB"] as const;

export default function CollegeFootballModelPanel({ game }: Props) {
  const modelReady = game.model.jkbPowerLine != null || game.model.jkbProjectedSpread != null;

  if (modelReady) {
    return (
      <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
            <LineChart className="h-3.5 w-3.5" />
          </span>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">JKB Model</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase text-slate-400">Neutral Diff</div>
            <div className="font-semibold tabular-nums text-slate-900">
              {formatNullableNumber(game.model.neutralPowerDifference)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400">HFA</div>
            <div className="font-semibold tabular-nums text-slate-900">
              {formatNullableNumber(game.model.homeFieldAdjustment)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400">JKB Line</div>
            <div className="font-semibold tabular-nums text-slate-900">{formatSpread(game.model.jkbPowerLine)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400">Market</div>
            <div className="font-semibold tabular-nums text-slate-900">{formatSpread(game.odds.currentSpread)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
            <LineChart className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">JKB Model</p>
            <p className="text-sm font-black text-slate-900">Model projections coming soon</p>
            <p className="mt-0.5 max-w-md text-[11px] leading-4 text-slate-500">
              Independent projected spread, total, and win probability will appear here once the live model
              rollout gate clears.
            </p>
          </div>
        </div>
        <span className="shrink-0 self-start rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-900">
          Coming soon
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 px-3.5 py-2.5 text-[10px] text-slate-400 sm:grid-cols-4">
        {PLACEHOLDER_SLOTS.map((slot) => (
          <div key={slot} className="flex items-center justify-between gap-1">
            <span className="font-semibold uppercase tracking-wide">{slot}</span>
            <span className="font-black text-slate-300">—</span>
          </div>
        ))}
      </div>
    </div>
  );
}
