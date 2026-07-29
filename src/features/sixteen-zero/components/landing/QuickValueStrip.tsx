import { CalendarClock, Layers, Target, Users } from "lucide-react";

const ITEMS = [
  { icon: Users, label: "12-Team Snake Draft" },
  { icon: Layers, label: "17-Round Full PPR" },
  { icon: CalendarClock, label: "Weekly Matchups" },
  { icon: Target, label: "One Goal: 16-0" },
];

export function QuickValueStrip() {
  return (
    <section className="border-b border-white/10 bg-slate-950/60">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-6 sm:px-6 md:grid-cols-4 md:gap-6">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-300 sm:text-sm">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
