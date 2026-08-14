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
    <section
      aria-labelledby="category-snapshot-heading"
      className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4"
    >
      <h2
        id="category-snapshot-heading"
        className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600"
      >
        Category Snapshot
      </h2>

      <ul className="mt-2 grid grid-cols-2 gap-2 @[600px]:grid-cols-3 @[960px]:grid-cols-6">
        {MATCHUP_CATEGORIES.map((category) => {
          const result = results?.[category.id];
          if (!result) return null;

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
                className="flex min-h-[44px] w-full flex-col items-start gap-1 rounded-md border border-slate-200 px-2 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
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

      <p className="mt-2.5 text-[11px] leading-4 text-slate-600">{CATEGORY_ADVANTAGE_NOTE}</p>
    </section>
  );
}
