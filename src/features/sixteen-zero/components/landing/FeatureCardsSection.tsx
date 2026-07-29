import { LineChart, Share2, ShieldCheck, Sparkles } from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Strategic CPU Drafting",
    text: "CPU teams use different roster-building and positional strategies.",
  },
  {
    icon: Sparkles,
    title: "Weekly Optimized Lineups",
    text: "The strongest legal lineup is selected for each matchup automatically.",
  },
  {
    icon: LineChart,
    title: "Matchup-Adjusted Scoring",
    text: "Player projections are adjusted using weekly NFL matchup context.",
  },
  {
    icon: Share2,
    title: "Shareable Season Results",
    text: "Get a branded final record, roster summary, and shareable result.",
  },
];

export function FeatureCardsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="text-center text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
        Built for Realistic Fantasy Football
      </p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <Icon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
            <h2 className="mt-4 text-base font-black text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
