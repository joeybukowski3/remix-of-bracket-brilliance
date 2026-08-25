import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { WEEKLY_STAT_GLOSSARY_GROUPS } from "@/lib/fantasy/weeklyPresentationMetadata";
import { cn } from "@/lib/utils";

export default function WeeklyStatsGlossary() {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return (
    <section aria-label="Weekly Rankings stat glossary" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-9 w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        <span>What do these stats mean?</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      <div id={contentId} hidden={!expanded} className="border-t border-slate-200 px-2 py-2 sm:px-3">
        <div className="mb-2 grid grid-cols-[3.25rem_minmax(5.75rem,0.8fr)_minmax(0,1.7fr)] gap-x-2 border-b border-slate-200 px-1 pb-1 text-[9px] font-black uppercase tracking-[0.05em] text-slate-500 sm:grid-cols-[4rem_minmax(8rem,0.8fr)_minmax(0,1.7fr)]">
          <span className="break-all leading-none">Abbreviation</span>
          <span>Stat name</span>
          <span>Brief meaning</span>
        </div>

        <div className="space-y-2">
          {WEEKLY_STAT_GLOSSARY_GROUPS.map((group) => {
            const headingId = `${contentId}-${group.label.replace(/\W+/g, "-")}`;
            return (
              <section key={group.label} aria-labelledby={headingId}>
                <h3 id={headingId} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-700">
                  {group.label}
                </h3>
                <dl className="divide-y divide-slate-100">
                  {group.definitions.map((definition) => (
                    <div key={definition.key} className="grid grid-cols-[3.25rem_minmax(5.75rem,0.8fr)_minmax(0,1.7fr)] gap-x-2 px-1 py-1 text-[10px] leading-snug text-slate-600 sm:grid-cols-[4rem_minmax(8rem,0.8fr)_minmax(0,1.7fr)] sm:text-[11px]">
                      <dt className="font-black text-slate-950">{definition.abbreviation}</dt>
                      <dd className="font-bold text-slate-800">{definition.name}</dd>
                      <dd>{definition.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>

        <div className="mt-2 grid gap-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] leading-snug text-slate-700 sm:grid-cols-2 sm:text-[11px]">
          <p><strong className="text-slate-950">Rank View:</strong> #1 is best or most favorable within the metric's comparison pool.</p>
          <p><strong className="text-slate-950">Stat View:</strong> Shows the underlying raw statistic while retaining the same heat color.</p>
          <p className="sm:col-span-2"><strong className="text-slate-950">Heat colors:</strong> Gold = elite · Green = favorable · Neutral = middle · Red = unfavorable.</p>
          <p className="sm:col-span-2"><strong className="text-slate-950">Matchup grade bands:</strong> Great 85–100 · Good 70–84.99 · Neutral 45–69.99 · Tough 30–44.99 · Very Tough 0–29.99.</p>
          <p><strong className="text-slate-950">QB / WR / TE weights:</strong> 30% FPA Season · 15% FPA L5 · 20% Trenches · 20% EPA · 15% Success.</p>
          <p><strong className="text-slate-950">RB weights:</strong> 30% FPA Season · 15% FPA L5 · 25% Trenches · 15% EPA · 15% Success.</p>
          <p className="sm:col-span-2"><strong className="text-slate-950">Projection safety:</strong> Matchup is research context and does not independently change the displayed JKB projection.</p>
        </div>
      </div>
    </section>
  );
}
