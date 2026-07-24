import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PgaScheduleFeedEntry } from "./PgaHubShared";

type Props = {
  schedule: PgaScheduleFeedEntry[];
  activeEventId?: string | null;
  /** Injectable for deterministic tests; defaults to today in ISO date form. */
  today?: string;
  maxEntries?: number;
};

const DEFAULT_MAX_ENTRIES = 12;

/**
 * Sidebar schedule that collapses to the current-week and following-week
 * tournaments by default. Expansion is presentation-only -- no schedule entry
 * is removed from the underlying data.
 */
export default function PgaScheduleSidebarCard({
  schedule,
  activeEventId = null,
  today,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  const referenceDate = today ?? new Date().toISOString().slice(0, 10);
  // Compare on endDate so a tournament already underway still counts as the
  // current week rather than dropping off the moment it tees off.
  const upcoming = useMemo(
    () => schedule.filter((entry) => (entry.endDate || entry.startDate) >= referenceDate).slice(0, maxEntries),
    [schedule, referenceDate, maxEntries],
  );

  // "Current week" and "following week" are the first two distinct start dates,
  // so alternate-field events in the same week stay grouped with their week.
  const highlightedWeeks = useMemo(() => {
    const weeks: string[] = [];
    for (const entry of upcoming) {
      if (!weeks.includes(entry.startDate)) weeks.push(entry.startDate);
      if (weeks.length === 2) break;
    }
    return weeks;
  }, [upcoming]);

  const collapsedEntries = useMemo(
    () => upcoming.filter((entry) => highlightedWeeks.includes(entry.startDate)),
    [upcoming, highlightedWeeks],
  );

  const visibleEntries = expanded ? upcoming : collapsedEntries;
  const hasMore = upcoming.length > collapsedEntries.length;

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm" aria-labelledby={`${panelId}-heading`}>
      <h2 id={`${panelId}-heading`} className="bg-slate-900 px-4 py-3 text-sm font-black text-white">
        2026 PGA Tour
      </h2>

      <div id={panelId} className={`divide-y ${expanded ? "max-h-[62vh] overflow-y-auto" : ""}`}>
        {visibleEntries.map((entry) => {
          const isHighlighted = highlightedWeeks.includes(entry.startDate);
          return (
            <div
              key={entry.id}
              className={`px-3 py-2 ${entry.id === activeEventId ? "bg-emerald-50" : isHighlighted ? "bg-emerald-50/40" : ""}`}
            >
              <div className={`text-xs ${isHighlighted ? "font-black text-slate-900" : "font-bold text-slate-700"}`}>
                {entry.shortName || entry.name}
              </div>
              <div className="text-[11px] tabular-nums text-slate-500">{entry.dateLabel}</div>
              {entry.dataFile && (
                <Link to={`/pga/${entry.slug}/model`} className="mt-1 inline-block text-[11px] font-bold text-emerald-700 hover:underline">
                  View model →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="w-full border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          {expanded ? "Hide full schedule" : "View full schedule"}
        </button>
      ) : null}
    </section>
  );
}
