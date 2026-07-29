import { Clock3, DraftingCompass, Trophy } from "lucide-react";

const STEPS = [
  {
    icon: DraftingCompass,
    title: "Choose Your Draft Slot",
    text: "Pick a position from 1-12, or let the app randomize one for you.",
  },
  {
    icon: Clock3,
    title: "Draft Against 11 CPU Teams",
    text: "Make 17 picks at your own pace while CPU managers fill out their rosters around you.",
  },
  {
    icon: Trophy,
    title: "Simulate the Season",
    text: "Your best lineup is set each week, then the full 14-game season and playoffs play out.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="text-center text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
        How It Works
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 font-mono text-xs font-black text-cyan-300">
                {index + 1}
              </span>
              <Icon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-lg font-black text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
