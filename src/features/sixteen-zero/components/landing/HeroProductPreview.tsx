import { Trophy } from "lucide-react";

const ROSTER_CHIPS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DST", "K"];

export function HeroProductPreview() {
  return (
    <div
      aria-hidden="true"
      className="hidden rounded-3xl border border-cyan-300/20 bg-slate-950/75 p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur lg:block"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
          Draft Room Preview
        </span>
        <Trophy className="h-5 w-5 text-amber-300" />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {ROSTER_CHIPS.map((position, index) => (
          <span
            key={`${position}-${index}`}
            className="rounded-md border border-cyan-300/20 bg-cyan-400/5 px-2 py-1 text-[11px] font-bold text-cyan-200"
          >
            {position}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
          Recent pick
        </p>
        <p className="mt-1 text-sm font-semibold text-white">
          Round 4, Pick 41 → CeeDee Lamb <span className="text-slate-500">WR</span>
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
          Week 8 matchup
        </p>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-black text-white">Your Team</span>
          <span className="font-mono font-black text-cyan-300">142.6</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[55%] rounded-full bg-cyan-400" />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm text-slate-400">
          <span>Opponent</span>
          <span className="font-mono">118.3</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-300/20 bg-amber-400/5 p-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
          Final record
        </span>
        <span className="text-2xl font-black tracking-tight text-amber-300">16-0</span>
      </div>
    </div>
  );
}
