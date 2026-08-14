import { describe, it, expect } from "vitest";
import {
  summariseCategoryAdvantages,
  type CategorySummaryResults,
} from "@/lib/nfl/matchupCategorySummary";
import {
  MATCHUP_CATEGORIES,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";

const AWAY = "Away Club";
const HOME = "Home Club";

/** A result carrying the given verdict; counts are consistent with it. */
function result(
  categoryId: MatchupCategoryId,
  verdict: CategoryAdvantageResult["result"]
): CategoryAdvantageResult {
  if (verdict === "na") {
    return { categoryId, result: "na", awayLeads: 0, homeLeads: 0, ties: 0, eligible: 0 };
  }
  if (verdict === "even") {
    return { categoryId, result: "even", awayLeads: 2, homeLeads: 2, ties: 0, eligible: 4 };
  }
  const awayLeads = verdict === "away" ? 3 : 1;
  return { categoryId, result: verdict, awayLeads, homeLeads: 4 - awayLeads, ties: 0, eligible: 4 };
}

/** Build a results map from a category-id -> verdict shorthand. */
function resultsFor(
  verdicts: Partial<Record<MatchupCategoryId, CategoryAdvantageResult["result"]>>
): CategorySummaryResults {
  const map: CategorySummaryResults = {};
  for (const [id, verdict] of Object.entries(verdicts)) {
    map[id as MatchupCategoryId] = result(id as MatchupCategoryId, verdict!);
  }
  return map;
}

// ── Naming each side's categories ──────────────────────────────────────────────

describe("category summary", () => {
  it("names the categories each team leads and the ones that are even", () => {
    const summary = summariseCategoryAdvantages(
      resultsFor({
        overall: "away",
        offense: "home",
        defense: "away",
        passing: "home",
        rushing: "even",
        trenches: "even",
      }),
      AWAY,
      HOME
    );

    expect(summary).toBe(
      "Away Club leads Overall Quality and Defense. " +
        "Home Club leads Offense and Passing. " +
        "Rushing and Trenches are even."
    );
  });

  it("uses the team names it is given, never a baked-in franchise", () => {
    const summary = summariseCategoryAdvantages(
      resultsFor({ offense: "away", defense: "home" }),
      "Visiting Side",
      "Hosting Side"
    );

    expect(summary).toContain("Visiting Side leads Offense.");
    expect(summary).toContain("Hosting Side leads Defense.");
  });

  it("names categories in registry order, not in the order they were supplied", () => {
    const summary = summariseCategoryAdvantages(
      resultsFor({ trenches: "away", offense: "away", overall: "away" }),
      AWAY,
      HOME
    );

    expect(summary).toBe("Away Club leads Overall Quality, Offense and Trenches.");
  });

  it("is deterministic for identical input", () => {
    const results = resultsFor({ overall: "away", offense: "home", rushing: "even" });

    expect(summariseCategoryAdvantages(results, AWAY, HOME)).toBe(
      summariseCategoryAdvantages(results, AWAY, HOME)
    );
  });
});

// ── List grammar ───────────────────────────────────────────────────────────────

describe("list wording", () => {
  it("states a single category without a conjunction", () => {
    expect(summariseCategoryAdvantages(resultsFor({ offense: "away" }), AWAY, HOME)).toBe(
      "Away Club leads Offense."
    );
  });

  it("joins exactly two categories with 'and' and no comma", () => {
    expect(
      summariseCategoryAdvantages(resultsFor({ offense: "away", defense: "away" }), AWAY, HOME)
    ).toBe("Away Club leads Offense and Defense.");
  });

  it("agrees the verb with a single even category", () => {
    expect(summariseCategoryAdvantages(resultsFor({ rushing: "even" }), AWAY, HOME)).toBe(
      "Rushing is even."
    );
  });

  it("agrees the verb with several even categories", () => {
    expect(
      summariseCategoryAdvantages(resultsFor({ rushing: "even", trenches: "even" }), AWAY, HOME)
    ).toBe("Rushing and Trenches are even.");
  });
});

// ── Missing and unavailable data ───────────────────────────────────────────────

describe("unavailable categories", () => {
  it("reports a category with nothing comparable rather than omitting it", () => {
    const summary = summariseCategoryAdvantages(
      resultsFor({ offense: "away", trenches: "na" }),
      AWAY,
      HOME
    );

    expect(summary).toBe("Away Club leads Offense. Trenches has no comparable metrics yet.");
  });

  it("agrees the verb across several unavailable categories", () => {
    expect(
      summariseCategoryAdvantages(resultsFor({ passing: "na", trenches: "na" }), AWAY, HOME)
    ).toBe("Passing and Trenches have no comparable metrics yet.");
  });

  it("states only the unavailable clause when nothing can be compared at all", () => {
    const allNa = resultsFor(
      Object.fromEntries(MATCHUP_CATEGORIES.map((category) => [category.id, "na"]))
    );

    const summary = summariseCategoryAdvantages(allNa, AWAY, HOME);

    expect(summary).toContain("have no comparable metrics yet.");
    expect(summary).not.toContain("leads");
    expect(summary).not.toContain("even");
  });

  it("skips categories with no result yet rather than guessing one", () => {
    expect(summariseCategoryAdvantages(resultsFor({ offense: "away" }), AWAY, HOME)).toBe(
      "Away Club leads Offense."
    );
  });

  it("returns null when there are no results at all", () => {
    expect(summariseCategoryAdvantages({}, AWAY, HOME)).toBeNull();
    expect(summariseCategoryAdvantages(null, AWAY, HOME)).toBeNull();
    expect(summariseCategoryAdvantages(undefined, AWAY, HOME)).toBeNull();
  });
});

// ── What the sentence must never say ───────────────────────────────────────────

describe("no fabricated or aggregate language", () => {
  const summary = summariseCategoryAdvantages(
    resultsFor({
      overall: "away",
      offense: "away",
      defense: "home",
      passing: "home",
      rushing: "even",
      trenches: "na",
    }),
    AWAY,
    HOME
  );

  it("counts no categories, in figures or in words", () => {
    // The removed page-level tally must not reappear as prose.
    expect(summary).not.toMatch(/\d+\s+of\s+\d+/);
    expect(summary).not.toMatch(/categor(y|ies)/i);
    expect(summary).not.toMatch(/\b(most|majority|half|both sides)\b/i);
  });

  it("declares no overall winner and no qualitative verdict", () => {
    expect(summary).not.toMatch(
      /\b(edge|advantage|better|stronger|weaker|clearer|favou?red|dominant|holds)\b/i
    );
  });

  it("makes no reference to the projection, the market or a recommendation", () => {
    expect(summary).not.toMatch(
      /\b(model|market|spread|projection|projected|pick|bet|confidence|value)\b/i
    );
  });

  it("names only categories the registry defines", () => {
    const labels = MATCHUP_CATEGORIES.map((category) => category.label);
    const named = labels.filter((label) => summary?.includes(label));

    expect(named).toHaveLength(labels.length);
  });

  it("mentions a team only where that team has a result", () => {
    const awayOnly = summariseCategoryAdvantages(resultsFor({ offense: "away" }), AWAY, HOME);

    expect(awayOnly).toContain(AWAY);
    expect(awayOnly).not.toContain(HOME);
  });
});
