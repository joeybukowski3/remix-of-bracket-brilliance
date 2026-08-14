/**
 * One-line summary of the category advantages.
 *
 * A plain restatement of `categoryResults` in a sentence: which categories each
 * team leads, which came out even, and which have nothing comparable to show
 * yet. It reads the counts the analyzer has already computed and adds nothing
 * to them.
 *
 * Deliberately NOT built on `deriveAdvantages`/`deriveAngles` from
 * matchupComparison.ts. Those describe guide-level season data — power rank,
 * offense and defense percentages, projected wins — which is a different source
 * answering a different question. A sentence about *categories* has to come
 * from the category counts, or the summary and the table beneath it could
 * disagree.
 *
 * Three rules the wording obeys:
 *
 *  1. Every clause traces to a `CategoryAdvantageResult.result` value. There is
 *     no interpretation, no causal claim ("which is why the margin sits
 *     closer"), no qualitative verdict ("holds the clearer edge") and no
 *     reference to the model projection, the market or anything this function
 *     cannot see.
 *  2. No category is counted. The sentence names categories; it never says
 *     "leads 4 of 6 categories". That page-level tally was removed on purpose
 *     — see the note in MatchupCategoryAdvantage.tsx — and a proportion in
 *     prose is the same figure in a different typeface.
 *  3. No overall winner is declared. Listing what each side leads is
 *     descriptive; ruling on who is better overall would be an aggregate
 *     verdict this page does not make.
 *
 * Team names come from the matchup, so no franchise, abbreviation or slug is
 * baked in here.
 */

import {
  MATCHUP_CATEGORIES,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";

/** Results keyed by category. Entries may be absent while data is resolving. */
export type CategorySummaryResults = Partial<
  Record<MatchupCategoryId, CategoryAdvantageResult>
>;

/**
 * Join labels for prose: "Offense", "Offense and Passing",
 * "Offense, Passing and Rushing".
 */
function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Summarise the category advantages in one sentence.
 *
 * Categories are named in registry order, so the sentence tracks the order of
 * the table it describes and the same inputs always produce the same string.
 *
 * Returns null when there is nothing to state — no results at all — so a caller
 * renders no summary rather than an empty or hedged one.
 */
export function summariseCategoryAdvantages(
  results: CategorySummaryResults | null | undefined,
  awayTeamName: string,
  homeTeamName: string
): string | null {
  if (!results) return null;

  const awayLed: string[] = [];
  const homeLed: string[] = [];
  const even: string[] = [];
  const unavailable: string[] = [];

  // Registry order, so the sentence and the table agree on sequence.
  for (const category of MATCHUP_CATEGORIES) {
    const result = results[category.id];
    if (!result) continue;
    if (result.result === "away") awayLed.push(category.label);
    else if (result.result === "home") homeLed.push(category.label);
    else if (result.result === "even") even.push(category.label);
    else unavailable.push(category.label);
  }

  const clauses: string[] = [];
  if (awayLed.length > 0) clauses.push(`${awayTeamName} leads ${joinLabels(awayLed)}.`);
  if (homeLed.length > 0) clauses.push(`${homeTeamName} leads ${joinLabels(homeLed)}.`);
  if (even.length > 0) {
    clauses.push(`${joinLabels(even)} ${even.length === 1 ? "is" : "are"} even.`);
  }
  if (unavailable.length > 0) {
    clauses.push(
      `${joinLabels(unavailable)} ${
        unavailable.length === 1 ? "has" : "have"
      } no comparable metrics yet.`
    );
  }

  if (clauses.length === 0) return null;
  return clauses.join(" ");
}
