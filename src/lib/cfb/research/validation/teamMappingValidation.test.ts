import { describe, expect, it } from "vitest";
import type { CfbResearchTeamSeason } from "../types";
import { assertNoAmbiguousTeamMappings, collectUnresolvedTeamMappings } from "./teamMappingValidation";

function row(overrides: Partial<CfbResearchTeamSeason>): CfbResearchTeamSeason {
  return {
    externalTeamId: "1",
    jkbTeamId: null,
    season: 2019,
    conference: null,
    classification: "fbs",
    returningProductionPercentPpa: null,
    returningProductionUsage: null,
    talentComposite: null,
    ...overrides,
  };
}

describe("collectUnresolvedTeamMappings", () => {
  it("returns only rows with a null jkbTeamId", () => {
    const rows = [row({ externalTeamId: "1", jkbTeamId: "ala" }), row({ externalTeamId: "2", jkbTeamId: null })];
    expect(collectUnresolvedTeamMappings(rows)).toEqual([{ season: 2019, externalTeamId: "2" }]);
  });
});

describe("assertNoAmbiguousTeamMappings", () => {
  it("does not throw when every jkbTeamId maps to a single external id per season", () => {
    const rows = [
      row({ externalTeamId: "1", jkbTeamId: "ala" }),
      row({ externalTeamId: "2", jkbTeamId: "miss" }),
      row({ externalTeamId: "1", season: 2020, jkbTeamId: "ala" }),
    ];
    expect(() => assertNoAmbiguousTeamMappings(rows)).not.toThrow();
  });

  it("fails loudly when two external ids collide on the same jkbTeamId within a season", () => {
    const rows = [row({ externalTeamId: "1", jkbTeamId: "ala" }), row({ externalTeamId: "2", jkbTeamId: "ala" })];
    expect(() => assertNoAmbiguousTeamMappings(rows)).toThrow(/Ambiguous team mapping/);
  });

  it("allows the same jkbTeamId to reuse the same external id across seasons", () => {
    const rows = [
      row({ externalTeamId: "1", season: 2018, jkbTeamId: "ala" }),
      row({ externalTeamId: "1", season: 2019, jkbTeamId: "ala" }),
    ];
    expect(() => assertNoAmbiguousTeamMappings(rows)).not.toThrow();
  });
});
