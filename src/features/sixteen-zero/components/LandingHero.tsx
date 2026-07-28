import { ArrowRight, Clock3, DraftingCompass, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAYER_DATA_META } from "../data";
import { SixteenZeroHeader } from "./SixteenZeroHeader";

export function LandingHero({
  onStart,
  initializing,
}: {
  onStart: () => void;
  initializing: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#06101d] text-white">
      <SixteenZeroHeader
        eyebrow={
          <span className="hidden text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-black uppercase tracking-[0.2em] text-cyan-300 sm:inline">
            Fantasy Football
          </span>
        }
      />

      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,211,238,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.08) 1px, transparent 1px), radial-gradient(circle at 70% 30%, rgba(14,165,233,.3), transparent 36%)",
              backgroundSize: "72px 72px, 72px 72px, auto",
            }}
          />
          <div className="mx-auto grid min-h-[620px] max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_420px] lg:py-28">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
                A fantasy football survival game
              </p>
              <h1 className="mt-5 text-[clamp(5rem,18vw,11rem)] font-black leading-[0.78] tracking-[-0.08em] text-white">
                16-0
              </h1>
              <p className="mt-8 max-w-2xl text-xl font-semibold leading-8 text-slate-200 sm:text-2xl">
                Draft the perfect fantasy football season.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
                Draw a random draft position, build a 17-player team, and simulate a full season.
                Can your roster go 14-0, earn a playoff bye, and win the championship?
              </p>
              <Button
                size="lg"
                onClick={onStart}
                disabled={initializing}
                className="mt-8 h-14 min-w-48 bg-cyan-400 px-8 text-base font-black text-slate-950 shadow-lg shadow-cyan-400/20 hover:bg-cyan-300"
              >
                {initializing ? "Opening draft…" : "Start Draft"}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="mt-3 text-xs text-slate-500">No pick clock · Full PPR · No sign-in required</p>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-slate-950/75 p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur sm:p-8">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">The target</span>
                <Trophy className="h-6 w-6 text-amber-300" />
              </div>
              <div className="mt-8 space-y-4">
                {[
                  ["Regular season", "14-0"],
                  ["NFL Week 15", "Playoff bye"],
                  ["NFL Week 16", "Semifinal win"],
                  ["NFL Week 17", "Championship win"],
                ].map(([label, value], index) => (
                  <div key={label} className="flex items-center gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 font-mono text-xs font-black text-cyan-300">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm text-slate-400">{label}</span>
                    <strong className="text-sm text-white">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-8 border-t border-white/10 pt-6 text-center">
                <span className="block text-5xl font-black tracking-tight text-amber-300">16-0</span>
                <span className="mt-1 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  Perfect season
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="text-center text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            How it works
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [DraftingCompass, "Draw your slot", "Get a random pick from 1–12 in a seeded 12-team snake draft."],
              [Clock3, "Draft at your own pace", "Make 17 selections whenever you're ready while 11 CPU managers shape the board around you."],
              [Trophy, "Watch the season", "Your best lineup is set each week, then all 14 games and the playoffs resolve."],
            ].map(([Icon, title, text], index) => {
              const FeatureIcon = Icon as typeof DraftingCompass;
              return (
                <article key={String(title)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                  <FeatureIcon className="h-6 w-6 text-cyan-300" />
                  <h2 className="mt-5 text-xl font-black">{String(title)}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{String(text)}</p>
                </article>
              );
            })}
          </div>
        </section>

      </main>

      <footer className="mx-auto max-w-7xl px-4 py-10 text-xs leading-5 text-slate-500 sm:px-6">
        <p>Rankings data updated {PLAYER_DATA_META.publishedAt}. Simulation outcomes are for entertainment and research use only.</p>
        <p className="mt-2">16-0 does not offer prizes, wagering, or guarantees of real-world fantasy performance.</p>
      </footer>
    </div>
  );
}
