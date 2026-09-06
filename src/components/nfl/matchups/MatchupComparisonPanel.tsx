import { useEffect, useRef, useState } from "react";
import MatchupCategoryAdvantageChip, {
  categoryAdvantageLeadText,
} from "@/components/nfl/matchups/MatchupCategoryAdvantageChip";
import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import MatchupCategorySnapshot from "@/components/nfl/matchups/MatchupCategorySnapshot";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import NflHeadToHeadMetricRow from "@/components/nfl/matchups/NflHeadToHeadMetricRow";
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

/**
 * Away/home identity for a comparison group: the two crests and abbreviations
 * over the value columns the new head-to-head rows align to. One quiet line,
 * not the former full table header.
 */
function ComparisonSideHeader({ matchup }: { matchup: NflMatchup }) {
  return (
    <div className="mx-auto grid w-full grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] items-center gap-x-2 border-b border-slate-200 pb-1.5 sm:max-w-[760px] sm:grid-cols-[5rem_minmax(0,1fr)_5rem] sm:gap-x-4">
      <span className="flex items-center justify-end gap-1">
        <NflTeamCrest team={matchup.away} side="away" size={16} />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {matchup.away.abbr.toUpperCase()}
        </span>
      </span>
      <span aria-hidden className="text-center text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
        Advantage
      </span>
      <span className="flex items-center justify-start gap-1">
        <NflTeamCrest team={matchup.home} side="home" size={16} />
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
    <div className="matchup-comparison-density @container space-y-2">
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
                <ComparisonSideHeader matchup={matchup} />
                {rows.map((metric) => (
                  <NflHeadToHeadMetricRow
                    key={metric.key}
                    label={metric.label}
                    shortLabel={metric.shortLabel}
                    help={metric.help}
                    leftValue={metric.away.formatted}
                    rightValue={metric.home.formatted}
                    leftRank={metric.away.rank}
                    rightRank={metric.home.rank}
                    leftRawValue={metric.away.value}
                    rightRawValue={metric.home.value}
                    higherIsBetter={
                      metric.direction === "higher-is-better"
                        ? true
                        : metric.direction === "lower-is-better"
                          ? false
                          : null
                    }
                    comparison={metric.comparison}
                    leftTeamName={matchup.away.teamName}
                    rightTeamName={matchup.home.teamName}
                    leftTeamAbbr={matchup.away.abbr}
                    rightTeamAbbr={matchup.home.abbr}
                  />
                ))}
              </MatchupCollapsibleGroup>
            );
          })}

          {/* One compact, collapsed-by-default legend beneath every category,
              rather than a raised card repeated in view. Rank colours stay
              reachable; the numeric rank on every badge carries the signal
              without it. */}
          <details className="group border-t border-slate-200 p-3 sm:p-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600 [&::-webkit-details-marker]:hidden">
              <span className="inline-block transition-transform group-open:rotate-90">▸</span>
              Rank tier colours
            </summary>
            <div className="mt-2">
              <MatchupRankLegend />
              <p className="mt-2 text-[11px] leading-4 text-slate-600">
                Colour is secondary — every value carries its numeric rank and every row states the
                advantage in words.
              </p>
            </div>
          </details>
        </MatchupSectionCard>

        {periodComparison}
      </div>

      {unitBattles}

      {children}
    </div>
  );
}
