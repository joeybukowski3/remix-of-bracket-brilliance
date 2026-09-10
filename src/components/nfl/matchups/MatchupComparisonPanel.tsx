import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import MatchupCategoryAdvantageChip, {
  categoryAdvantageLeadText,
} from "@/components/nfl/matchups/MatchupCategoryAdvantageChip";
import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import MatchupCategorySnapshot from "@/components/nfl/matchups/MatchupCategorySnapshot";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import MatchupTabStrip, { type MatchupTabDef } from "@/components/nfl/matchups/MatchupTabStrip";
import MatchupMetricTable from "@/components/nfl/matchups/MatchupMetricTable";
import MatchupComparisonTeamHeader from "@/components/nfl/matchups/MatchupComparisonTeamHeader";
import MatchupRankLegend from "@/components/nfl/matchups/MatchupRankLegend";
import { prefersReducedMotion } from "@/components/nfl/matchups/matchupNavigation";
import { MATCHUP_SECTION_SCROLL_MT } from "@/lib/nfl/matchupSections";
import { cn } from "@/lib/utils";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
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

/**
 * The Statistical Comparison tab set: every registry category plus one
 * presentation-only "coaching" tab. "coaching" is deliberately not part of
 * `MatchupCategoryId` — that registry is also read by the Overview tab's
 * Category Advantage table, and Coaching has no counted metrics, only a
 * relocated standalone card.
 */
type StatComparisonTabId = MatchupCategoryId | "coaching";

const COACHING_TAB_ID: StatComparisonTabId = "coaching";

/** How long the arrival highlight stays on the destination group. */
const JUMP_HIGHLIGHT_MS = 1100;

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
 * Statistical Comparison: every category the Overview table counts, plus a
 * Coaching / Sideline tab, in a single tabbed container — one category
 * visible at a time.
 *
 * Arriving at a category — by selecting an Overview row, by a direct visit to
 * `#comparison-{id}`, or by Back — selects that tab, positions its panel
 * clear of both sticky layers, applies a brief restrained highlight and moves
 * focus onto the tab trigger, so keyboard and screen-reader users land
 * exactly where a pointer user does.
 *
 * Every category's panel stays mounted (only visually hidden), the same way
 * the accordion this replaced kept every group's anchor in the DOM — the jump
 * effect below depends on the destination panel already existing the instant
 * it runs.
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
  coaching,
  projection = false,
  dedicatedLabel,
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
   * strip so a tile runs the same select/scroll/focus sequence as an Overview
   * row. Omit it and the strip is not rendered at all, rather than rendering
   * tiles that lead nowhere.
   */
  onOpenCategory?: (category: MatchupCategoryId) => void;
  /** Category addressed by the current fragment, if any. */
  pendingCategory: MatchupCategoryId | null;
  /** Changes on every navigation so a repeat jump re-runs the sequence. */
  navigationToken: number;
  /**
   * Strength-of-schedule context, rendered above the tab strip.
   *
   * Purely informational and structurally inert: it sits in its own row and no
   * value, colour or ordering below it depends on its presence or its state.
   */
  scheduleContext?: ReactNode;
  /**
   * Coaching / Sideline content for its own tab — the existing standalone
   * `MatchupCoaching` card, relocated verbatim. Optional so a caller that has
   * no coaching data yet simply omits the tab's content, not the tab.
   */
  coaching?: ReactNode;
  projection?: boolean;
  dedicatedLabel?: string;
}) {
  const [activeTab, setActiveTab] = useState<StatComparisonTabId>(MATCHUP_CATEGORIES[0].id);
  const [highlighted, setHighlighted] = useState<StatComparisonTabId | null>(null);
  const triggerRefs = useRef(new Map<StatComparisonTabId, HTMLButtonElement>());
  const isMobile = useIsCompactLayout("(max-width: 639px)");

  // Mobile-only accordion state: every category starts collapsed, per the
  // mobile density spec — the tab strip below is the desktop presentation of
  // this exact same content and needs no such state, since every panel is
  // already mounted and only one is unhidden.
  const [openCategories, setOpenCategories] = useState<Set<StatComparisonTabId>>(new Set());
  const toggleCategory = (id: StatComparisonTabId) => {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!pendingCategory) return;
    setActiveTab(pendingCategory);
    setHighlighted(pendingCategory);
    // A jump must reveal the destination even when its accordion group starts
    // collapsed — arriving at a category is expected to open it, not leave it
    // closed behind the highlight.
    setOpenCategories((current) => new Set(current).add(pendingCategory));

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

  /**
   * One category's metrics as the shared comparison table — the same component
   * the Overview snapshot uses, at the larger `detail` scale. Shared by the
   * mobile accordion and the desktop tab panel.
   */
  const renderTable = (rows: MatchupDisplayMetric[], categoryLabel: string) => (
    <MatchupMetricTable
      variant="detail"
      metrics={rows}
      matchup={matchup}
      projected={projection || !!dedicatedLabel}
      caption={`${categoryLabel} metrics for ${matchup.away.teamName} and ${matchup.home.teamName}`}
    />
  );

  const tabs: MatchupTabDef[] = [
    ...MATCHUP_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      triggerId: matchupCategoryTriggerId(category.id),
    })),
    { id: COACHING_TAB_ID, label: "Coaching / Sideline", triggerId: "comparison-coaching-tab" },
  ];

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

      <MatchupSectionCard
        eyebrow="Metric by metric"
        title={dedicatedLabel ? `Statistical Comparison — ${dedicatedLabel}` : projection ? "Statistical Comparison — 2026 Projection" : "Statistical Comparison"}
        titleId="statistical-comparison-heading"
        subtitle={dedicatedLabel ? "Rank 1 is best among teams with available values; N/A rows are excluded from category counts." : projection
          ? "Projected statistics only. Rank 1 is best among teams with available values; N/A rows are excluded from category counts."
          : "League rank out of 32 — 1 is best. Every row states its advantage in words."}
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {isMobile ? (
          <div>
            {MATCHUP_CATEGORIES.map((category) => {
              const rows = categoryMetrics[category.id] ?? [];
              const result = categoryResults?.[category.id];
              const decided = result?.result === "away" || result?.result === "home";
              return (
                <div
                  key={category.id}
                  className={cn(decided ? "border-l-4 border-l-emerald-600" : "border-l-4 border-l-slate-300")}
                >
                  <MatchupCollapsibleGroup
                    id={category.hash}
                    triggerId={matchupCategoryTriggerId(category.id)}
                    title={category.label}
                    meta={result && (
                      <CategoryAdvantageMeta
                        result={result}
                        categoryLabel={category.label}
                        away={matchup.away}
                        home={matchup.home}
                      />
                    )}
                    open={openCategories.has(category.id)}
                    onToggle={() => toggleCategory(category.id)}
                    highlighted={highlighted === category.id}
                    triggerRef={(node) => {
                      if (node) triggerRefs.current.set(category.id, node);
                      else triggerRefs.current.delete(category.id);
                    }}
                  >
                    <MatchupComparisonTeamHeader matchup={matchup} />
                    {renderTable(rows, category.label)}
                  </MatchupCollapsibleGroup>
                </div>
              );
            })}
            {coaching && (
              <MatchupCollapsibleGroup
                id="comparison-coaching"
                triggerId="comparison-coaching-tab"
                title="Coaching / Sideline"
                open={openCategories.has(COACHING_TAB_ID)}
                onToggle={() => toggleCategory(COACHING_TAB_ID)}
                highlighted={highlighted === COACHING_TAB_ID}
                triggerRef={(node) => {
                  if (node) triggerRefs.current.set(COACHING_TAB_ID, node);
                  else triggerRefs.current.delete(COACHING_TAB_ID);
                }}
              >
                {coaching}
              </MatchupCollapsibleGroup>
            )}
          </div>
        ) : (
          <>
            <MatchupTabStrip
              tabs={tabs}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as StatComparisonTabId)}
              ariaLabel="Statistical comparison categories"
              triggerRef={(id, node) => {
                const tabId = id as StatComparisonTabId;
                if (node) triggerRefs.current.set(tabId, node);
                else triggerRefs.current.delete(tabId);
              }}
            />

            {MATCHUP_CATEGORIES.map((category) => {
              const rows = categoryMetrics[category.id] ?? [];
              // Optional-chained for the same reason `categoryMetrics` is: a
              // category with no resolved result renders without a meta chip
              // rather than taking the whole panel down.
              const result = categoryResults?.[category.id];
              return (
                <div
                  key={category.id}
                  id={category.hash}
                  role="tabpanel"
                  aria-labelledby={matchupCategoryTriggerId(category.id)}
                  hidden={activeTab !== category.id}
                  className={cn(
                    MATCHUP_SECTION_SCROLL_MT,
                    "px-2.5 pb-2 pt-2 sm:px-3 motion-safe:transition-colors motion-safe:duration-700",
                    highlighted === category.id && "bg-sky-50"
                  )}
                >
                  <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-600">
                    {result && (
                      <CategoryAdvantageMeta
                        result={result}
                        categoryLabel={category.label}
                        away={matchup.away}
                        home={matchup.home}
                      />
                    )}
                  </div>
                  <MatchupComparisonTeamHeader matchup={matchup} />
                  {renderTable(rows, category.label)}
                </div>
              );
            })}

            <div
              id="comparison-coaching"
              role="tabpanel"
              aria-labelledby="comparison-coaching-tab"
              hidden={activeTab !== COACHING_TAB_ID}
              className={cn(MATCHUP_SECTION_SCROLL_MT, "px-2.5 pb-2 pt-2 sm:px-3")}
            >
              {coaching}
            </div>
          </>
        )}

        {/* One compact, collapsed-by-default legend beneath the tab panels,
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
    </div>
  );
}
