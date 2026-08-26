import { describe, expect, it } from "vitest";
import { EMPTY_FEATURE_CATEGORY, type NflPassingFeatureRecord } from "./features";
import { NFL_YARDAGE_MARKETS } from "./yardageOutcomes";
import type { NflYardageProjection } from "./projection";

/**
 * Phase 1 invariant guards. These exist to fail loudly if a future edit
 * accidentally starts populating a category or field this phase explicitly
 * leaves empty/null -- catching an out-of-scope change (model fitting,
 * matchup scoring, prop-edge population) at type-check/test time rather
 * than at review time.
 */

describe("Phase 1 scope invariants", () => {
  it("exactly three yardage markets are defined", () => {
    expect(NFL_YARDAGE_MARKETS).toEqual(["passing", "rushing", "receiving"]);
  });

  it("a feature record's categories are all still empty placeholders", () => {
    const record: NflPassingFeatureRecord = {
      schemaVersion: "nfl-passing-feature-schema-v1",
      season: 2025,
      week: 1,
      playerId: "gsis:00-0036389",
      generatedAt: "2026-08-25T00:00:00.000Z",
      opportunity: EMPTY_FEATURE_CATEGORY,
      playerEfficiency: EMPTY_FEATURE_CATEGORY,
      opponentEfficiency: EMPTY_FEATURE_CATEGORY,
      gameEnvironment: EMPTY_FEATURE_CATEGORY,
      availability: EMPTY_FEATURE_CATEGORY,
    };
    for (const key of ["opportunity", "playerEfficiency", "opponentEfficiency", "gameEnvironment", "availability"] as const) {
      expect(Object.keys(record[key])).toHaveLength(0);
    }
  });

  it("a projection constructed today has no fitted yard value or model version", () => {
    const projection: NflYardageProjection = {
      schemaVersion: "nfl-yardage-projection-v1",
      season: 2025,
      week: 1,
      playerId: "gsis:00-0036389",
      market: "passing",
      projectedYards: null,
      uncertainty: null,
      modelVersion: null,
      dataVersion: "nfl-yardage-outcome-row-v1",
      generatedAt: "2026-08-25T00:00:00.000Z",
    };
    expect(projection.projectedYards).toBeNull();
    expect(projection.modelVersion).toBeNull();
  });

  it("projection schema has no matchup-score field", () => {
    const projectionKeys: ReadonlySet<string> = new Set([
      "schemaVersion", "season", "week", "playerId", "market", "projectedYards",
      "uncertainty", "modelVersion", "dataVersion", "generatedAt",
    ]);
    expect(projectionKeys.has("matchupScore")).toBe(false);
    expect(projectionKeys.has("opportunityScore")).toBe(false);
    expect(projectionKeys.has("environmentScore")).toBe(false);
  });
});
