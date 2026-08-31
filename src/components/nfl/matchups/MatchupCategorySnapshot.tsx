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
      className="matchup-category-snapshot"
    >
      <ul className="grid grid-cols-1 gap-3 @[560px]:grid-cols-2 @[900px]:grid-cols-3">
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
                  "flex min-h-[44px] w-full items-center gap-3.5 rounded-[10px] border border-t-4 border-slate-300 bg-slate-50 px-4 py-3 text-left transition-colors hover:border-slate-400 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                  decided ? "border-t-emerald-700" : "border-t-slate-300"
                )}
              >
                <span aria-hidden className="shrink-0">
                  <MatchupCategoryAdvantageChip
                    result={result}
                    away={away}
                    home={home}
                    crestSize={46}
                  />
                </span>
                <span aria-hidden className="min-w-0">
                  <span className="block truncate text-[16px] font-extrabold leading-tight text-slate-900">
                    {category.label}
                  </span>
                  <span className="mt-1 block truncate text-[13px] leading-4 text-slate-500">
                    {categoryAdvantageLeadText(result)}
                  </span>
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
