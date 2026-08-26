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
      <div className="rounded-sm border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">JKB Model</p>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
    <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">JKB Model</p>
        <span className="rounded-sm bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          Coming soon
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-700">Model projections coming soon</p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
        Independent projected spread, total, and win probability will appear here once the live model rollout
        gate clears.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-400 sm:grid-cols-4">
        {PLACEHOLDER_SLOTS.map((slot) => (
          <div key={slot} className="flex items-center justify-between gap-1 rounded-sm bg-white px-1.5 py-1">
            <span className="uppercase tracking-wide">{slot}</span>
            <span className="font-semibold text-slate-300">—</span>
          </div>
        ))}
      </div>
    </div>
  );
}
