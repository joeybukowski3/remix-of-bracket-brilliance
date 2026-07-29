import { XCircle } from "lucide-react";
import Logo from "@/components/ui/Logo";

export function HeroProductPreview() {
  return (
    <div
      aria-hidden="true"
      data-hero-preview
      className="hidden rounded-3xl border border-cyan-300/20 bg-slate-950/75 p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur lg:block"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
          Season Results Preview
        </span>
        <div className="flex items-center gap-1.5">
          <Logo width={16} className="brightness-0 invert" />
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            JoeKnowsBall
          </span>
        </div>
      </div>

      <p className="mt-1 text-[10px] text-slate-600">Example season · not an actual result</p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
          Final Record
        </p>
        <p className="mt-1 text-4xl font-black tracking-[-0.04em] text-white">11-3</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm font-black text-rose-300">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Eliminated in Semifinal
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
