import { ChevronRight } from "lucide-react";

const STEPS = ["Regular Season 14-0", "First-Round Bye", "Semifinal Win", "Championship Win"];

export function SeasonProgressionSection() {
  return (
    <section className="border-y border-white/10 bg-slate-950/60">
      <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
          The Perfect Season
        </p>
        <p className="mt-3 text-xl font-black text-white sm:text-2xl">
          Going 14-0 is only the beginning.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Earn a top seed, survive the playoffs, and win the championship to complete the perfect
          16-0 season.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {STEPS.map((step) => (
            <div key={step} className="flex items-center gap-2.5">
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-bold text-slate-300 sm:text-sm">
                {step}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-600" aria-hidden="true" />
            </div>
          ))}
          <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-5 py-2 text-sm font-black text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.25)] sm:text-base">
            Perfect 16-0
          </span>
        </div>
      </div>
    </section>
  );
}
