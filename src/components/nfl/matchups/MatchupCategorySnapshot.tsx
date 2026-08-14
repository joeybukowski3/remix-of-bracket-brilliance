import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import MatchupCategoryAdvantageChip, {
  categoryAdvantageLeadText,
} from "@/components/nfl/matchups/MatchupCategoryAdvantageChip";
import {
  CATEGORY_ADVANTAGE_NOTE,
  MATCHUP_CATEGORIES,
  describeCategoryAdvantage,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

/**
 * Category snapshot.
 *
 * Every category's advantage visible before any group is expanded, and a
 * shortcut into the one a reader wants. Driven entirely by `MATCHUP_CATEGORIES`,
 * so it lists whatever the registry lists, in registry order — adding or
 * removing a category never requires touching this file.
 *
 * Each tile is one category's own unweighted count of the rows beneath it,
 * reading the same `CategoryAdvantageResult` the accordion trigger and the
 * Overview table read. There is deliberately no percentage, no average-rank
 * margin and no figure summed across categories: matchupCategoryAdvantage.ts
 * documents why rank averages across differently-united metrics are not a
 * comparison, and MatchupCategoryAdvantage.tsx records that a page-level tally
 * was removed on purpose because it invites a reading this surface must not
 * support. `CATEGORY_ADVANTAGE_NOTE` is restated here for the same reason.
 *
 * Selection reuses `onOpenCategory` — the page's existing navigation action —
 * so a tile runs exactly the same expand, scroll, highlight and focus sequence
 * as an Overview category row and a direct `#comparison-{id}` visit. No jump
 * logic exists here.
 */
export default function MatchupCategorySnapshot({
  matchup,
  results,
  onOpenCategory,
}: {
  matchup: NflMatchup;
  results: Record<MatchupCategoryId, CategoryAdvantageResult>;
  onOpenCategory: (category: MatchupCategoryId) => void;
}) {
  const { away, home } = matchup;

  return (
    <MatchupSectionCard
      eyebrow="At a glance"
      title="Category Snapshot"
      titleId="category-snapshot-heading"
    >
      <ul className="grid grid-cols-2 gap-1.5 @[600px]:grid-cols-3 @[960px]:grid-cols-6">
        {MATCHUP_CATEGORIES.map((category) => {
          const result = results?.[category.id];
          if (!result) return null;

          // Semantic stripe, not a team colour: accent when the category has a
          // leader, neutral when it does not. Which team leads is already
          // unambiguous from the crest and abbreviation inside the tile, and
          // team colour would not carry it reliably anyway — guide data holds a
          // single colour per team, so a navy-vs-navy matchup gives both sides
          // near-identical stripes.
          const decided = result.result === "away" || result.result === "home";

          return (
            <li key={category.id}>
              <button
                type="button"
                aria-label={describeCategoryAdvantage(
                  result,
                  category.label,
                  away.teamName,
                  home.teamName
                )}
                onClick={() => onOpenCategory(category.id)}
                className={cn(
                  "flex min-h-[44px] w-full flex-col items-start gap-1 rounded-lg border border-t-[3px] border-slate-200 bg-slate-50 px-2 py-2 text-left transition-colors hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                  decided ? "border-t-emerald-600" : "border-t-slate-300"
                )}
              >
                <span
                  aria-hidden
                  className="w-full truncate text-[11px] font-semibold leading-4 text-slate-900"
                >
                  {category.label}
                </span>
                <span aria-hidden className="flex min-w-0 items-center">
                  <MatchupCategoryAdvantageChip result={result} away={away} home={home} />
                </span>
                <span
                  aria-hidden
                  className="w-full truncate text-[10px] font-medium leading-4 text-slate-600"
                >
                  {categoryAdvantageLeadText(result)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 text-[11px] leading-4 text-slate-600">{CATEGORY_ADVANTAGE_NOTE}</p>
    </MatchupSectionCard>
  );
}
