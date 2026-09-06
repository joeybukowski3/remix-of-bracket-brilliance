import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export const NFL_PERFORMANCE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "sides", label: "Sides" },
  { id: "totals", label: "Totals" },
  { id: "props", label: "Props" },
  { id: "game-log", label: "Game Log" },
  { id: "health", label: "Model Health" },
] as const;

export type NflPerformanceTabId = (typeof NFL_PERFORMANCE_TABS)[number]["id"];

export function isNflPerformanceTabId(value: string | undefined): value is NflPerformanceTabId {
  return NFL_PERFORMANCE_TABS.some((tab) => tab.id === value);
}

/**
 * Compact horizontal tab bar for the /nfl/performance/:tab route family.
 * Real links (not buttons that call setState) so tab state lives in the URL
 * and is shareable/back-button-safe -- consistent with the rest of the NFL
 * platform's subroute pattern (e.g. /nfl/guide/team/:teamSlug).
 *
 * Scrolls horizontally on narrow viewports rather than wrapping or shrinking
 * to icons, so every tab stays a real tappable target with no overflow.
 */
export default function NflPerformanceTabs({ active }: { active: NflPerformanceTabId }) {
  return (
    <nav aria-label="Performance sections" className="border-b border-slate-200">
      <div className="-mb-px flex gap-1 overflow-x-auto pb-px" role="tablist">
        {NFL_PERFORMANCE_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              to={`/nfl/performance/${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500",
                isActive
                  ? "border-sky-600 text-slate-900"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
