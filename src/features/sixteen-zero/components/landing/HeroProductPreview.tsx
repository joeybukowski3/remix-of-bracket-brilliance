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
          Final Record
        </p>
        <p className="mt-1 text-sm font-semibold text-white">
          11-3 <span className="text-slate-500">— Eliminated in Semifinal</span>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-300/20 bg-amber-400/5 p-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
          Goal
        </span>
        <span className="text-sm font-black tracking-tight text-amber-300">
          Undefeated Fantasy Dominance
        </span>
      </div>
    </div>
  );
}
