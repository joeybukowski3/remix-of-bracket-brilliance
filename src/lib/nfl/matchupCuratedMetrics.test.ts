import { describe, expect, it } from "vitest";
import { MATCHUP_CATEGORIES, MATCHUP_TEAM_METRICS, type MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import { CURATED_METRIC_DEFAULTS, MIN_SELECTED_METRICS, SPINE_METRICS } from "@/lib/nfl/matchupCuratedMetrics";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";

/** The same key format `matchupDisplayMetrics.ts` resolves to for a category ref. */
function registryKeysInOrder(categoryId: MatchupCategoryId): string[] {
  const category = MATCHUP_CATEGORIES.find((c) => c.id === categoryId)!;
  return category.metrics.map((ref) => (ref.kind === "team" ? `team.${ref.id}` : ref.key));
}

/** Registry keys that are chart-eligible — excludes context-only rows, which curated defaults must never include. */
function chartEligibleRegistryKeys(categoryId: MatchupCategoryId): string[] {
  const category = MATCHUP_CATEGORIES.find((c) => c.id === categoryId)!;
  return category.metrics
    .filter((ref) => {
      if (ref.kind === "team") return MATCHUP_TEAM_METRICS[ref.id].direction !== "context-only";
      return getMetricDef(ref.key)?.direction !== "context-only";
    })
    .map((ref) => (ref.kind === "team" ? `team.${ref.id}` : ref.key));
}

describe("CURATED_METRIC_DEFAULTS", () => {
  for (const category of MATCHUP_CATEGORIES) {
    describe(category.id, () => {
      const registryKeys = registryKeysInOrder(category.id);
      const curated = CURATED_METRIC_DEFAULTS[category.id];

      it("contains only metrics that exist in the category's registry", () => {
        for (const id of curated) {
          expect(registryKeys).toContain(id);
        }
      });

      it("preserves registry order", () => {
        const indices = curated.map((id) => registryKeys.indexOf(id));
        const sorted = [...indices].sort((a, b) => a - b);
        expect(indices).toEqual(sorted);
      });

      it("has no duplicate ids", () => {
        expect(new Set(curated).size).toBe(curated.length);
      });

      it(`meets the minimum selection floor of ${MIN_SELECTED_METRICS}`, () => {
        expect(curated.length).toBeGreaterThanOrEqual(MIN_SELECTED_METRICS);
      });

      it("targets roughly 6-8 metrics where the category has that many chart-eligible metrics available", () => {
        const eligibleCount = chartEligibleRegistryKeys(category.id).length;
        if (eligibleCount >= 6) {
          expect(curated.length).toBeGreaterThanOrEqual(6);
        } else {
          expect(curated.length).toBe(eligibleCount);
        }
      });

      it("never includes a context-only metric", () => {
        const eligible = new Set(chartEligibleRegistryKeys(category.id));
        for (const id of curated) {
          expect(eligible).toContain(id);
        }
      });
    });
  }

  it("covers every registered category", () => {
    const definedCategories = Object.keys(CURATED_METRIC_DEFAULTS).sort();
    const registryCategories = MATCHUP_CATEGORIES.map((c) => c.id).sort();
    expect(definedCategories).toEqual(registryCategories);
  });
});

describe("SPINE_METRICS", () => {
  it("addresses only metrics that exist in their declared category's registry", () => {
    for (const entry of SPINE_METRICS) {
      const registryKeys = registryKeysInOrder(entry.categoryId);
      expect(registryKeys).toContain(entry.metricId);
    }
  });

  it("has no duplicate (category, metric) pairs", () => {
    const pairs = SPINE_METRICS.map((e) => `${e.categoryId}:${e.metricId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("targets roughly 6-8 headline metrics", () => {
    expect(SPINE_METRICS.length).toBeGreaterThanOrEqual(6);
    expect(SPINE_METRICS.length).toBeLessThanOrEqual(8);
  });
});
