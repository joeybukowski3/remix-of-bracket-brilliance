import { ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import { categorySideStrength } from "@/components/nfl/matchups/matchupVisualMath";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import {
  CATEGORY_ADVANTAGE_NOTE,
  MATCHUP_CATEGORIES,
  describeCategoryAdvantage,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Category Advantage.
 *
 * A descriptive count, kept visually and verbally distinct from the model
 * projection beside it. It is never framed as a pick, a best bet, a confidence
 * score or an edge, and it carries no aggregate verdict, proportion bar or
 * "X of Y categories" headline — those were removed deliberately, because a
 * page-level tally invites exactly the reading this table must not support.
 *
 * Each row is a single `<button>` filling the row, with no nested clickable
 * elements, a 44px minimum target, and an accessible label carrying the full
 * result — the visual row reads only as a category plus an abbreviation, which
 * on its own would
 * tell a screen-reader user nothing about how decisive the category was.
 *
 * A result is communicated by crest *and* abbreviation, never by logo or colour
 * alone. EVEN and N/A are muted badges and are never given a crest: neither is
 * a team result.
 */
export default function MatchupCategoryAdvantage({
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
      aria-labelledby="category-advantage-heading"
      className="matchup-edge-map rounded-lg border border-slate-200 bg-white p-3 sm:p-4"
    >
      <h2
        id="category-advantage-heading"
        className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600"
      >
        Positional Edge Map
      </h2>

      <table className="mt-2 w-full border-collapse">
        <caption className="sr-only">
          Which team leads each comparison category. Selecting a category opens its detailed
          metrics in the Team Comparison tab.
        </caption>
        <thead>
          <tr className="border-b border-slate-200">
            <th
              scope="col"
              className="pb-1.5 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600"
            >
              Category
            </th>
            <th
              scope="col"
              className="pb-1.5 text-right text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600"
            >
              Advantage
            </th>
          </tr>
        </thead>
        <tbody>
          {MATCHUP_CATEGORIES.map((category) => {
            const result = results[category.id];
            const label = describeCategoryAdvantage(
              result,
              category.label,
              away.teamName,
              home.teamName
            );
            const awayStrength = categorySideStrength(result, "away");
            const homeStrength = categorySideStrength(result, "home");
            const neutral = result.result === "even" || result.result === "na";

            return (
              <tr key={category.id} className="border-b border-slate-100 last:border-0">
                <td colSpan={2} className="p-0">
                  <button
                    type="button"
                    data-edge={result.result}
                    aria-label={label}
                    onClick={() => onOpenCategory(category.id)}
                    className="matchup-edge-map__row min-h-[44px] w-full rounded-md px-1 py-1.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <span className="matchup-edge-map__side matchup-edge-map__side--away">
                      <span className="matchup-edge-map__team">
                        <NflTeamCrest team={away} side="away" size={18} />
                        <b>{away.abbr.toUpperCase()}</b>
                        <small>{result.awayLeads}</small>
                      </span>
                      <span className="matchup-edge-map__track" aria-hidden>
                        <span
                          className="matchup-edge-map__fill matchup-edge-map__fill--away"
                          style={{ "--edge-strength": `${awayStrength}%` } as CSSProperties}
                        />
                      </span>
                    </span>

                    <span className="matchup-edge-map__center">
                      <span className="matchup-edge-map__label">{category.label}</span>
                      {neutral && <small>{result.result === "even" ? "Even" : "N/A"}</small>}
                    </span>

                    <span className="matchup-edge-map__side matchup-edge-map__side--home">
                      <span className="matchup-edge-map__track" aria-hidden>
                        <span
                          className="matchup-edge-map__fill matchup-edge-map__fill--home"
                          style={{ "--edge-strength": `${homeStrength}%` } as CSSProperties}
                        />
                      </span>
                      <span className="matchup-edge-map__team">
                        <small>{result.homeLeads}</small>
                        <b>{home.abbr.toUpperCase()}</b>
                        <NflTeamCrest team={home} side="home" size={18} />
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-2.5 text-[11px] leading-4 text-slate-600">{CATEGORY_ADVANTAGE_NOTE}</p>
    </section>
  );
}
