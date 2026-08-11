import { useEffect, useRef, useState } from "react";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import MatchupMetricRow from "@/components/nfl/matchups/MatchupMetricRow";
import MatchupRankLegend from "@/components/nfl/matchups/MatchupRankLegend";
import { prefersReducedMotion } from "@/components/nfl/matchups/matchupNavigation";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import {
  MATCHUP_CATEGORIES,
  getMatchupCategory,
  matchupCategoryTriggerId,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";
import type { NflMatchup } from "@/lib/nfl/matchups";

/** How long the arrival highlight stays on the destination group. */
const JUMP_HIGHLIGHT_MS = 1100;

/** Column header naming each side of the comparison. Table-width only. */
function ComparisonColumnHeader({ matchup }: { matchup: NflMatchup }) {
  return (
    <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 border-b border-slate-200 pb-1.5 sm:grid">
      <span className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-600">
        {matchup.away.abbr.toUpperCase()}
      </span>
      <span className="text-center text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">
        Metric · Advantage
      </span>
      <span className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
        {matchup.home.abbr.toUpperCase()}
      </span>
    </div>
  );
}

/**
 * Team Comparison: every category the Overview table counts, in the same order,
 * reading the same registry.
 *
 * Arriving at a category — by selecting an Overview row, by a direct visit to
 * `#comparison-{id}`, or by Back — expands that group, positions its heading
 * clear of both sticky layers, applies a brief restrained highlight and moves
 * focus onto the accordion trigger, so keyboard and screen-reader users land
 * exactly where a pointer user does.
 *
 * The focus call is deferred to the next frame. Doing it synchronously worked
 * on click and silently failed on a direct hash load, because the destination
 * had not been laid out yet — a real defect found in the prototype.
 */
export default function MatchupComparisonPanel({
  matchup,
  categoryMetrics,
  pendingCategory,
  navigationToken,
  children,
}: {
  matchup: NflMatchup;
  categoryMetrics: Record<MatchupCategoryId, MatchupDisplayMetric[]>;
  /** Category addressed by the current fragment, if any. */
  pendingCategory: MatchupCategoryId | null;
  /** Changes on every navigation so a repeat jump re-runs the sequence. */
  navigationToken: number;
  /** Sections rendered beneath the statistical comparison. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState<Partial<Record<MatchupCategoryId, boolean>>>(() => ({
    [MATCHUP_CATEGORIES[0].id]: true,
  }));
  const [highlighted, setHighlighted] = useState<MatchupCategoryId | null>(null);
  const triggerRefs = useRef(new Map<MatchupCategoryId, HTMLButtonElement>());

  useEffect(() => {
    if (!pendingCategory) return;
    setOpen((current) => ({ ...current, [pendingCategory]: true }));
    setHighlighted(pendingCategory);

    const destination = document.getElementById(getMatchupCategory(pendingCategory).hash);
    destination?.scrollIntoView({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    // Deferred so focus also lands on a direct hash load, not only on click.
    const frame = window.requestAnimationFrame(() => {
      triggerRefs.current.get(pendingCategory)?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setHighlighted(null), JUMP_HIGHLIGHT_MS);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pendingCategory, navigationToken]);

  return (
    <div className="space-y-3">
      <section
        aria-labelledby="statistical-comparison-heading"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
          <h2
            id="statistical-comparison-heading"
            className="text-sm font-semibold text-slate-900"
          >
            Statistical Comparison
          </h2>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
            League rank out of 32 — 1 is best. Every row states its advantage in words.
          </p>
        </div>

        {MATCHUP_CATEGORIES.map((category) => {
          const rows = categoryMetrics[category.id] ?? [];
          return (
            <MatchupCollapsibleGroup
              key={category.id}
              id={category.hash}
              triggerId={matchupCategoryTriggerId(category.id)}
              title={category.label}
              meta={`${rows.length} metric${rows.length === 1 ? "" : "s"}`}
              open={open[category.id] === true}
              highlighted={highlighted === category.id}
              triggerRef={(node) => {
                if (node) triggerRefs.current.set(category.id, node);
                else triggerRefs.current.delete(category.id);
              }}
              onToggle={() =>
                setOpen((current) => ({ ...current, [category.id]: !current[category.id] }))
              }
            >
              <ComparisonColumnHeader matchup={matchup} />
              {rows.map((metric) => (
                <MatchupMetricRow
                  key={metric.key}
                  metric={metric}
                  awayAbbr={matchup.away.abbr}
                  homeAbbr={matchup.home.abbr}
                  awayTeamName={matchup.away.teamName}
                  homeTeamName={matchup.home.teamName}
                />
              ))}
            </MatchupCollapsibleGroup>
          );
        })}

        {/* Rendered once per page, at the foot of the section it describes. */}
        <div className="border-t border-slate-200 p-3 sm:p-4">
          <MatchupRankLegend />
          <p className="mt-2 text-[11px] leading-4 text-slate-600">
            Colour is secondary — every value carries its numeric rank and every row states the
            advantage in words.
          </p>
        </div>
      </section>

      {children}
    </div>
  );
}
