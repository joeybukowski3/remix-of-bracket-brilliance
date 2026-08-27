import { LineChart } from "lucide-react";
import type { CfbGame } from "@/data/cfb/types";
import { formatNullableNumber, formatSpread, formatTotal } from "@/lib/cfb/format";

type Props = {
  game: Pick<CfbGame, "model" | "odds">;
};

const PLACEHOLDER_SLOTS = ["Projected Spread", "Projected Total", "Win Probability", "Market vs JKB"] as const;

type MobileStatCell = { label: string; value: string };

function MobileModelHeader({ comingSoon }: { comingSoon: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-slate-900 px-3 py-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
        <LineChart className="h-3.5 w-3.5" />
      </span>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">JKB Model</p>
      {comingSoon && (
        <span className="ml-auto shrink-0 rounded-full bg-violet-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-200">
          Coming soon
        </span>
      )}
    </div>
  );
}

function MobileModelStatGrid({ cells }: { cells: MobileStatCell[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-3 py-3">
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{cell.label}</div>
          <div className="text-xl font-black tabular-nums text-slate-900">{cell.value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Mobile-only model panel — same rounded-2xl/slate-300/shadow-sm card and
 * dark-navy header language as Phase 1-3's mobile Power/Season
 * Stats/Market cards. Renders the exact same real model fields (or the
 * exact same honest "coming soon" placeholder state) as desktop; only the
 * layout/typography differs.
 */
function MobileModelPanel({ game }: Props) {
  const modelReady = game.model.jkbPowerLine != null || game.model.jkbProjectedSpread != null;

  if (modelReady) {
    const cells: MobileStatCell[] = [
      { label: "Neutral Diff", value: formatNullableNumber(game.model.neutralPowerDifference) },
      { label: "HFA", value: formatNullableNumber(game.model.homeFieldAdjustment) },
      { label: "JKB Line", value: formatSpread(game.model.jkbPowerLine) },
      { label: "Market", value: formatSpread(game.odds.currentSpread) },
    ];
    return (
      <div
        data-testid="cfb-model-mobile"
        className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm sm:hidden"
      >
        <MobileModelHeader comingSoon={false} />
        <MobileModelStatGrid cells={cells} />
      </div>
    );
  }

  return (
    <div
      data-testid="cfb-model-mobile"
      className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm sm:hidden"
    >
      <MobileModelHeader comingSoon />
      <div className="px-3 py-3">
        <p className="text-sm font-black text-slate-900">Model projections coming soon</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          Independent projected spread, total, and win probability will appear here once the live model rollout gate
          clears.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 px-3 py-2.5 text-[10px] text-slate-400">
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

export default function CollegeFootballModelPanel({ game }: Props) {
  const modelReady = game.model.jkbPowerLine != null || game.model.jkbProjectedSpread != null;

  return (
    <>
      <div data-testid="cfb-model-desktop" className="hidden sm:block">
        {modelReady ? (
          <div className="overflow-hidden rounded-sm border border-slate-300 bg-white">
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
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
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
        )}
      </div>

      <MobileModelPanel game={game} />
    </>
  );
}
