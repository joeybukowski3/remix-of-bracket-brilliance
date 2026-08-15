import { useEffect, useRef, useState } from "react";
import MatchupCategoryAdvantageChip, {
  categoryAdvantageLeadText,
} from "@/components/nfl/matchups/MatchupCategoryAdvantageChip";
import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import MatchupCategorySnapshot from "@/components/nfl/matchups/MatchupCategorySnapshot";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import MatchupMetricRow from "@/components/nfl/matchups/MatchupMetricRow";
import MatchupRankLegend from "@/components/nfl/matchups/MatchupRankLegend";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { prefersReducedMotion } from "@/components/nfl/matchups/matchupNavigation";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import {
  MATCHUP_CATEGORIES,
  describeCategoryAdvantage,
  getMatchupCategory,
  matchupCategoryTriggerId,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";
import { summariseCategoryAdvantages } from "@/lib/nfl/matchupCategorySummary";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

/** How long the arrival highlight stays on the destination group. */
const JUMP_HIGHLIGHT_MS = 1100;

/** Column header naming each side of the comparison. Table-width only. */
function ComparisonColumnHeader({ matchup }: { matchup: NflMatchup }) {
  return (
    <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 border-b border-slate-200 pb-1.5 sm:grid">
      <span className="flex items-center justify-end gap-1.5">
        <NflTeamCrest team={matchup.away} side="away" size={18} />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {matchup.away.abbr.toUpperCase()}
        </span>
      </span>
      <span className="text-center text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">
        Metric · Advantage
      </span>
      <span className="flex items-center justify-start gap-1.5">
        <NflTeamCrest team={matchup.home} side="home" size={18} />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {matchup.home.abbr.toUpperCase()}
        </span>
      </span>
    </div>
  );
}

/**
 * Category advantage on the accordion trigger.
 *
 * The same count the snapshot strip and Overview's Category Advantage table
 * show, from the same `CategoryAdvantageResult` and through the same shared
 * chip, so a category cannot report one leader in one place and another
 * elsewhere. Nothing is recomputed here and no tally spans categories — this is
 * one category's own unweighted count of the rows directly beneath it.
 *
 * The visual parts are hidden from assistive technology and the whole result is
 * restated once in `describeCategoryAdvantage()`'s sentence, which is the same
 * helper the Overview rows use for their accessible name.
 */
function CategoryAdvantageMeta({
  result,
  categoryLabel,
  away,
  home,
}: {
  result: CategoryAdvantageResult;
  categoryLabel: string;
  away: NflMatchupTeam;
  home: NflMatchupTeam;
}) {
  return (
    <>
      <span aria-hidden className="flex min-w-0 items-center gap-1.5">
        <MatchupCategoryAdvantageChip result={result} away={away} home={home} />
        <span className="truncate text-[11px] font-medium text-slate-600">
          {categoryAdvantageLeadText(result)}
        </span>
      </span>
      <span className="sr-only">
        {describeCategoryAdvantage(result, categoryLabel, away.teamName, home.teamName)}
      </span>
    </>
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
  categoryResults,
  onOpenCategory,
  pendingCategory,
  navigationToken,
  scheduleContext,
  unitBattles,
  periodComparison,
  children,
}: {
  matchup: NflMatchup;
  categoryMetrics: Record<MatchupCategoryId, MatchupDisplayMetric[]>;
  /**
   * The same per-category counts Overview renders, resolved once by the page.
   * Shared rather than recomputed so the two surfaces cannot disagree about
   * which team leads a category.
   */
  categoryResults: Record<MatchupCategoryId, CategoryAdvantageResult>;
  /**
   * The page's existing category navigation, reused verbatim by the snapshot
   * strip so a tile runs the same expand/scroll/focus sequence as an Overview
   * row. Omit it and the strip is not rendered at all, rather than rendering
   * tiles that lead nowhere.
   */
  onOpenCategory?: (category: MatchupCategoryId) => void;
  /** Category addressed by the current fragment, if any. */
  pendingCategory: MatchupCategoryId | null;
  /** Changes on every navigation so a repeat jump re-runs the sequence. */
  navigationToken: number;
  /**
   * Strength-of-schedule context, rendered above the comparison grid.
   *
   * Purely informational and structurally inert: it sits in its own row and no
   * value, colour or ordering below it depends on its presence or its state.
   */
  scheduleContext?: React.ReactNode;
  /**
   * Unit Matchups, rendered above the comparison grid so each offense is read
   * against the defense it actually faces before the same-side, vs-league-average
   * table below it. Its own data sources stay with the page.
   */
  unitBattles?: React.ReactNode;
  /**
   * Success Rate by Period, paired beside Statistical Comparison once the
   * surrounding container is wide enough for both to stay readable. Kept as
   * its own prop rather than folded into `children` so this component can
   * place it in the same row without guessing at children order.
   */
  periodComparison?: React.ReactNode;
  /** Sections rendered beneath the statistical comparison row. */
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

  /**
   * One sentence restating the category results below. Null when there is
   * nothing to state, in which case no element is rendered at all — an empty
   * paragraph would still take the stack's spacing and read as a gap.
   */
  const categorySummary = summariseCategoryAdvantages(
    categoryResults,
    matchup.away.teamName,
    matchup.home.teamName
  );

  return (
    <div className="@container space-y-2">
      {categorySummary && (
        <p className="px-0.5 text-[12px] leading-5 text-slate-700">{categorySummary}</p>
      )}

      {onOpenCategory && (
        <MatchupCategorySnapshot
          matchup={matchup}
          results={categoryResults}
          onOpenCategory={onOpenCategory}
        />
      )}

      {scheduleContext}

      {unitBattles}

      <div className="grid grid-cols-1 items-start gap-2 @[1020px]:grid-cols-[minmax(520px,58%)_minmax(440px,42%)]">
        <MatchupSectionCard
          eyebrow="Metric by metric"
          title="Statistical Comparison"
          titleId="statistical-comparison-heading"
          subtitle="League rank out of 32 — 1 is best. Every row states its advantage in words."
          bodyClassName="px-0 py-0 sm:px-0"
        >
          {MATCHUP_CATEGORIES.map((category) => {
            const rows = categoryMetrics[category.id] ?? [];
            // Optional-chained for the same reason `categoryMetrics` is: a
            // category with no resolved result renders without a meta chip
            // rather than taking the whole panel down.
            const result = categoryResults?.[category.id];
            return (
              <MatchupCollapsibleGroup
                key={category.id}
                id={category.hash}
                triggerId={matchupCategoryTriggerId(category.id)}
                title={category.label}
                meta={
                  result ? (
                    <CategoryAdvantageMeta
                      result={result}
                      categoryLabel={category.label}
                      away={matchup.away}
                      home={matchup.home}
                    />
                  ) : undefined
                }
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
        </MatchupSectionCard>

        {periodComparison}
      </div>

      {children}
    </div>
  );
}
