import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, Trophy, XCircle } from "lucide-react";
import type { SeasonResult } from "../types";
import { SixteenZeroHeader } from "./SixteenZeroHeader";

export const SEASON_ROW_DELAY_MS = 1800;
export const REDUCED_MOTION_ROW_DELAY_MS = 140;

export function SeasonSimulation({
  result,
  onComplete,
}: {
  result: SeasonResult;
  onComplete: () => void;
}) {
  const [revealed, setRevealed] = useState(0);
  const newestRowRef = useRef<HTMLTableRowElement | null>(null);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    [],
  );

  useEffect(() => {
    if (revealed >= result.schedule.length) {
      const completeTimer = window.setTimeout(onComplete, reducedMotion ? 100 : 900);
      return () => window.clearTimeout(completeTimer);
    }
    const timer = window.setTimeout(
      () => setRevealed((current) => current + 1),
      reducedMotion ? REDUCED_MOTION_ROW_DELAY_MS : SEASON_ROW_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [onComplete, reducedMotion, result.schedule.length, revealed]);

  useEffect(() => {
    newestRowRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [reducedMotion, revealed]);

  const resolved = result.schedule.slice(0, revealed);
  const currentWins = resolved.filter((game) => game.result === "W").length;
  const currentLosses = resolved.filter((game) => game.result === "L").length;
  const regularResolved = Math.min(revealed, 14);

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <SixteenZeroHeader />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <div className="text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Season simulation
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            {revealed <= 14 ? "The road to 14-0" : "Fantasy playoffs"}
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Best expected lineup selected automatically before every matchup.
          </p>
        </div>

        <div className="mx-auto mt-8 flex max-w-sm items-center justify-center gap-7 rounded-2xl border border-white/10 bg-slate-950/70 px-6 py-5">
          <div className="text-center">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Current record
            </span>
            <strong className="mt-1 block text-4xl font-black text-cyan-300">
              {currentWins}-{currentLosses}
            </strong>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="text-center">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Regular season
            </span>
            <strong className="mt-1 block font-mono text-lg text-white">
              {regularResolved}/14
            </strong>
          </div>
        </div>

        <div className="mt-8 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/70">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-3 sm:px-5">Week</th>
                <th scope="col" className="px-3 py-3 sm:px-5">Opponent</th>
                <th scope="col" className="px-2 py-3 text-right">You</th>
                <th scope="col" className="px-2 py-3 text-right">Opp.</th>
                <th scope="col" className="px-3 py-3 text-center sm:px-5">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {result.schedule.map((game, index) => {
                const isResolved = index < revealed;
                const isNewest = index === revealed - 1;
                return (
                  <tr
                    key={game.fantasyWeek}
                    ref={isNewest ? newestRowRef : null}
                    className={isNewest ? "bg-cyan-400/[0.055]" : ""}
                  >
                    <td className="px-3 py-3.5 font-mono text-slate-400 sm:px-5">
                      {game.fantasyWeek}
                    </td>
                    <td className="max-w-32 truncate px-3 py-3.5 font-semibold text-slate-200 sm:max-w-none sm:px-5">
                      {isResolved ? game.opponentName : "—"}
                    </td>
                    <td className="px-2 py-3.5 text-right font-mono font-bold text-white">
                      {isResolved ? (game.isBye ? "BYE" : game.userScore?.toFixed(1)) : "—"}
                    </td>
                    <td className="px-2 py-3.5 text-right font-mono text-slate-400">
                      {isResolved ? (game.isBye ? "—" : game.opponentScore?.toFixed(1)) : "—"}
                    </td>
                    <td className="px-3 py-3.5 text-center sm:px-5">
                      {!isResolved ? (
                        <CircleDashed className="mx-auto h-4 w-4 text-slate-700" aria-label="Unresolved" />
                      ) : game.isBye ? (
                        <span className="text-xs font-black text-amber-300">BYE</span>
                      ) : game.result === "W" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" /> WIN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-rose-300">
                          <XCircle className="h-4 w-4" /> LOSS
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500" role="status" aria-live="polite">
          {revealed < result.schedule.length ? (
            <>
              <CircleDashed className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Resolving Week {result.schedule[revealed]?.fantasyWeek}…
            </>
          ) : (
            <>
              <Trophy className="h-4 w-4 text-amber-300" />
              Season complete
            </>
          )}
        </div>
      </div>
    </div>
  );
}
