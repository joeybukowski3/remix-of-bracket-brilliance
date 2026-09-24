import { ArrowDown, ArrowUp } from "lucide-react";
import { FantasyPlayerIdentity, FANTASY_TABLE_SHELL } from "./FantasyTable";
import type { PlayerMatch } from "@/lib/fantasy/startSit/sleeper";
import type { LineupSwap } from "@/lib/fantasy/startSit/lineupComparison";
import { cn } from "@/lib/utils";

export function StartSitRosterPanel({ kind, slots, ids, players, total, swaps }: {
  kind: "current" | "optimal";
  slots: readonly string[];
  ids: readonly (string | null)[];
  players: ReadonlyMap<string, PlayerMatch>;
  total: number;
  swaps: readonly LineupSwap[];
}) {
  const current = kind === "current";
  const indicators = new Map(swaps.filter((swap) => swap.meaningfulUpgrade).map((swap) => [current ? swap.currentId : swap.optimalId, swap]));
  return <section className={cn(FANTASY_TABLE_SHELL, "min-w-0 border-2", current ? "border-sky-300" : "border-emerald-300")}>
    <div className={cn("border-b px-4 py-3", current ? "border-sky-200 bg-sky-950 text-white" : "border-emerald-200 bg-emerald-950 text-white")}>
      <h2 className="text-sm font-bold uppercase tracking-wide">{current ? "Current Starting Roster" : "Optimal Starting Roster"}</h2>
      <p className="mt-0.5 text-xs font-semibold">Total Projected Points: <strong className="tabular-nums">{total.toFixed(1)}</strong></p>
      {!current && <p className="text-[11px] opacity-80">Highest JKB projection</p>}
    </div>
    <div className="grid grid-cols-[68px_minmax(0,1fr)_38px_65px] gap-1 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase text-slate-600">
      <span>Slot</span><span>Player</span><span>Opp</span><span className="text-right">JKB Proj</span>
    </div>
    {slots.map((slot, index) => {
      const id = ids[index];
      const player = id ? players.get(id) : null;
      const row = player?.jkb;
      const indicator = id ? indicators.get(id) : null;
      return <div key={`${slot}-${index}`} className={cn("grid min-h-11 grid-cols-[68px_minmax(0,1fr)_38px_65px] items-center gap-1 border-b border-slate-100 px-3 py-1.5 last:border-0", indicator && (current ? "bg-rose-50" : "bg-emerald-50"))}>
        <span className="break-words text-[9px] font-black leading-tight text-slate-600">{slot}</span>
        <div className="min-w-0">
          {row ? <FantasyPlayerIdentity player={row.playerName} team={row.team} compact /> : <span className="block truncate text-xs text-slate-600">{player?.sleeper?.full_name ?? (id && id !== "0" ? `Unmatched ${id}` : "Empty")}</span>}
          {player?.sleeper?.injury_status && <span className="text-[10px] font-bold text-amber-700">{player.sleeper.injury_status}</span>}
        </div>
        <span className="text-[10px] font-bold text-slate-600">{row ? `${row.homeAway === "away" ? "@" : "vs"}${row.opponent}` : "—"}</span>
        <span className="flex items-center justify-end gap-1 text-right text-xs font-black tabular-nums text-slate-950">
          {indicator && (current ? <ArrowDown aria-label={`Upgrade available: ${indicator.optimalPoints.toFixed(1)} vs ${indicator.currentPoints.toFixed(1)}`} className="h-3.5 w-3.5 shrink-0 text-rose-600" /> : <ArrowUp aria-label={`Upgrade: ${indicator.optimalPoints.toFixed(1)} vs ${indicator.currentPoints.toFixed(1)}`} className="h-3.5 w-3.5 shrink-0 text-emerald-700" />)}
          {row ? row.projectedFantasyPoints.toFixed(1) : "N/A"}
        </span>
      </div>;
    })}
  </section>;
}
