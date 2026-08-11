import { describe, it, expect } from "vitest";
import {
  CATEGORY_ADVANTAGE_NOTE,
  MATCHUP_CATEGORIES,
  MATCHUP_CATEGORY_IDS,
  classifyMetricComparison,
  computeCategoryAdvantage,
  describeCategoryAdvantage,
  getMatchupCategory,
  isMatchupCategoryId,
  matchupCategoryTriggerId,
  type CategoryMetricInput,
} from "@/lib/nfl/matchupCategoryAdvantage";
import { MARKET_PROFILE_METRICS } from "@/lib/nfl/matchupMetrics";

/**
 * The category roll-up is the only new calculation in the redesign, and it is
 * deliberately dull: an unweighted count of already-resolved metrics. These
 * tests pin the two things that make it trustworthy — that "not comparable" and
 * "missing" are never conflated, and that every decision comes from raw numbers
 * and a declared direction.
 *
 * Nothing here references a team, an abbreviation or a matchup: the result is a
 * function of the numbers alone, which is what makes the shared template safe.
 */

function metric(overrides: Partial<CategoryMetricInput>): CategoryMetricInput {
  return {
    key: "off.epaPerPlay",
    direction: "higher-is-better",
    awayValue: 0,
    homeValue: 0,
    ...overrides,
  };
}

describe("classifyMetricComparison", () => {
  it("gives higher-is-better to the larger raw value", () => {
    expect(
      classifyMetricComparison(
        metric({ direction: "higher-is-better", awayValue: 0.12, homeValue: 0.04 })
      )
    ).toBe("away");
    expect(
      classifyMetricComparison(
        metric({ direction: "higher-is-better", awayValue: 0.04, homeValue: 0.12 })
      )
    ).toBe("home");
  });

  it("gives lower-is-better to the smaller raw value", () => {
    expect(
      classifyMetricComparison(
        metric({ direction: "lower-is-better", awayValue: 18.2, homeValue: 20.5 })
      )
    ).toBe("away");
    expect(
      classifyMetricComparison(
        metric({ direction: "lower-is-better", awayValue: 20.5, homeValue: 18.2 })
      )
    ).toBe("home");
  });

  it("handles negative raw values through the declared direction", () => {
    // Both sides negative: lower-is-better must prefer the more negative value.
    expect(
      classifyMetricComparison(
        metric({ direction: "lower-is-better", awayValue: -0.061, homeValue: -0.012 })
      )
    ).toBe("away");
  });

  it("treats equal raw values as a genuine tie", () => {
    expect(classifyMetricComparison(metric({ awayValue: 5.5, homeValue: 5.5 }))).toBe("tie");
  });

  it("treats equal zero values as a tie, not as missing", () => {
    expect(classifyMetricComparison(metric({ awayValue: 0, homeValue: 0 }))).toBe("tie");
    expect(
      classifyMetricComparison(
        metric({ direction: "lower-is-better", awayValue: 0, homeValue: 0 })
      )
    ).toBe("tie");
  });

  it("excludes a context-only metric as not comparable, never as missing", () => {
    expect(
      classifyMetricComparison(
        metric({ direction: "context-only", awayValue: 1800, homeValue: 1750 })
      )
    ).toBe("not-comparable");
  });

  it("excludes a direction of none as not comparable", () => {
    expect(
      classifyMetricComparison(metric({ direction: "none", awayValue: 1, homeValue: 2 }))
    ).toBe("not-comparable");
  });

  it("excludes the metric when the away value is missing", () => {
    expect(classifyMetricComparison(metric({ awayValue: null, homeValue: 4.2 }))).toBe("missing");
  });

  it("excludes the metric when the home value is missing", () => {
    expect(classifyMetricComparison(metric({ awayValue: 4.2, homeValue: null }))).toBe("missing");
  });

  it("excludes the metric when both values are missing", () => {
    expect(classifyMetricComparison(metric({ awayValue: null, homeValue: null }))).toBe("missing");
  });

  it("treats non-finite values as missing", () => {
    expect(classifyMetricComparison(metric({ awayValue: Number.NaN, homeValue: 3 }))).toBe(
      "missing"
    );
    expect(
      classifyMetricComparison(metric({ awayValue: 3, homeValue: Number.POSITIVE_INFINITY }))
    ).toBe("missing");
    expect(
      classifyMetricComparison(metric({ awayValue: Number.NEGATIVE_INFINITY, homeValue: 3 }))
    ).toBe("missing");
  });
});

describe("computeCategoryAdvantage", () => {
  it("gives the category to the away team when it leads more metrics", () => {
    const result = computeCategoryAdvantage("defense", [
      metric({ direction: "lower-is-better", awayValue: 18.2, homeValue: 20.5 }),
      metric({ direction: "lower-is-better", awayValue: 42.1, homeValue: 46.9 }),
      metric({ direction: "higher-is-better", awayValue: 0.9, homeValue: 1.4 }),
    ]);
    expect(result).toEqual({
      categoryId: "defense",
      result: "away",
      awayLeads: 2,
      homeLeads: 1,
      ties: 0,
      eligible: 3,
    });
  });

  it("gives the category to the home team when it leads more metrics", () => {
    const result = computeCategoryAdvantage("offense", [
      metric({ awayValue: 0.04, homeValue: 0.11 }),
      metric({ awayValue: 21.8, homeValue: 24.5 }),
      metric({ awayValue: 5.9, homeValue: 5.3 }),
    ]);
    expect(result.result).toBe("home");
    expect(result.homeLeads).toBe(2);
    expect(result.awayLeads).toBe(1);
    expect(result.eligible).toBe(3);
  });

  it("returns EVEN on equal lead counts", () => {
    const result = computeCategoryAdvantage("rushing", [
      metric({ awayValue: 4.4, homeValue: 4.2 }),
      metric({ awayValue: 0.02, homeValue: 0.07 }),
    ]);
    expect(result.result).toBe("even");
    expect(result.awayLeads).toBe(1);
    expect(result.homeLeads).toBe(1);
    expect(result.eligible).toBe(2);
  });

  it("counts ties toward eligible but never lets them decide the category", () => {
    const result = computeCategoryAdvantage("passing", [
      metric({ awayValue: 7.1, homeValue: 7.1 }),
      metric({ awayValue: 0, homeValue: 0 }),
      metric({ awayValue: 0.16, homeValue: 0.09 }),
    ]);
    expect(result.ties).toBe(2);
    expect(result.eligible).toBe(3);
    expect(result.result).toBe("away");
    expect(result.awayLeads).toBe(1);
  });

  it("returns N/A when no metric is eligible", () => {
    const result = computeCategoryAdvantage("trenches", [
      metric({ direction: "context-only", awayValue: 1, homeValue: 2 }),
      metric({ awayValue: null, homeValue: 3 }),
      metric({ awayValue: Number.NaN, homeValue: Number.NaN }),
    ]);
    expect(result).toEqual({
      categoryId: "trenches",
      result: "na",
      awayLeads: 0,
      homeLeads: 0,
      ties: 0,
      eligible: 0,
    });
  });

  it("does not count context-only metrics as data gaps", () => {
    const withContext = computeCategoryAdvantage("overall", [
      metric({ awayValue: 0.12, homeValue: 0.04 }),
      metric({ direction: "context-only", awayValue: 1800, homeValue: 1750 }),
    ]);
    const withoutContext = computeCategoryAdvantage("overall", [
      metric({ awayValue: 0.12, homeValue: 0.04 }),
    ]);
    expect(withContext).toEqual(withoutContext);
  });

  it("returns N/A rather than EVEN for an empty category", () => {
    expect(computeCategoryAdvantage("overall", []).result).toBe("na");
  });
});

describe("describeCategoryAdvantage", () => {
  it("states the leading team and the counts it led", () => {
    const result = computeCategoryAdvantage("defense", [
      metric({ direction: "lower-is-better", awayValue: 18.2, homeValue: 20.5 }),
      metric({ direction: "lower-is-better", awayValue: 42.1, homeValue: 46.9 }),
      metric({ awayValue: 1.4, homeValue: 0.9 }),
    ]);
    expect(describeCategoryAdvantage(result, "Defense", "Away Club", "Home Club")).toBe(
      "Defense: Away Club advantage, leading 3 of 3 comparable metrics. Open detailed metrics."
    );
  });

  it("states an even split without naming a team", () => {
    const result = computeCategoryAdvantage("rushing", [
      metric({ awayValue: 4.4, homeValue: 4.2 }),
      metric({ awayValue: 0.02, homeValue: 0.07 }),
    ]);
    const label = describeCategoryAdvantage(result, "Rushing", "Away Club", "Home Club");
    expect(label).toBe(
      "Rushing: even, 1 metrics each of 2 comparable. Open detailed metrics."
    );
    expect(label).not.toContain("advantage");
  });

  it("states insufficient data when nothing was comparable", () => {
    const result = computeCategoryAdvantage("trenches", []);
    expect(describeCategoryAdvantage(result, "Trenches", "Away Club", "Home Club")).toBe(
      "Trenches: insufficient data, no comparable metrics available. Open detailed metrics."
    );
  });
});

describe("category registry", () => {
  it("keeps the approved order", () => {
    expect(MATCHUP_CATEGORY_IDS).toEqual([
      "overall",
      "offense",
      "defense",
      "passing",
      "rushing",
      "trenches",
    ]);
  });

  it("exposes stable, team-neutral hashes", () => {
    for (const category of MATCHUP_CATEGORIES) {
      expect(category.hash).toBe(`comparison-${category.id}`);
      expect(matchupCategoryTriggerId(category.id)).toBe(`comparison-${category.id}-trigger`);
      // No team, abbreviation, slug or game identifier may leak into a hash.
      expect(category.hash).toMatch(/^comparison-[a-z]+$/);
    }
  });

  it("gives every category a label and at least one metric", () => {
    for (const category of MATCHUP_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.metrics.length).toBeGreaterThan(0);
    }
  });

  it("never lets a market metric decide a team-performance category", () => {
    const marketKeys = new Set(MARKET_PROFILE_METRICS.map((def) => def.key));
    for (const category of MATCHUP_CATEGORIES) {
      for (const ref of category.metrics) {
        if (ref.kind !== "metric") continue;
        expect(marketKeys.has(ref.key)).toBe(false);
        expect(ref.key.startsWith("mkt.")).toBe(false);
      }
    }
  });

  it("recognises only its own category ids", () => {
    expect(isMatchupCategoryId("defense")).toBe(true);
    expect(isMatchupCategoryId("market")).toBe(false);
    expect(isMatchupCategoryId("new-england-patriots")).toBe(false);
    expect(getMatchupCategory("defense").label).toBe("Defense");
  });

  it("states the note without betting language", () => {
    expect(CATEGORY_ADVANTAGE_NOTE).toBe(
      "Category advantages are based on an unweighted count of the comparable metrics shown in each section. They are not the model projection."
    );
    for (const word of ["pick", "best bet", "confidence", "edge", "probability"]) {
      expect(CATEGORY_ADVANTAGE_NOTE.toLowerCase()).not.toContain(word);
    }
  });
});
