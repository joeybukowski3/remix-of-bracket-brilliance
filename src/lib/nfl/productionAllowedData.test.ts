import { describe, expect, it } from "vitest";
import {
  formatYardsAllowed,
  resolveProductionAllowed,
  type ProductionAllowedArtifact,
} from "./productionAllowedData";

function artifact(overrides?: Partial<ProductionAllowedArtifact>): ProductionAllowedArtifact {
  return {
    _meta: { schemaVersion: "v1", generatedAt: "2026-01-01T00:00:00.000Z", source: "test", season: 2025, notes: [] },
    schemaVersion: "nfl-matchup-production-allowed-v1",
    sourceSeason: 2025,
    marketPositions: { passing: ["QB"], rushing: ["ALL", "RB"], receiving: ["WR", "TE", "RB"] },
    teams: {
      DEN: {
        passing: { QB: { season: { yardsAllowedPerGame: 250.5, totalYardsAllowed: 4258.5, gamesIncluded: 17, weeksIncluded: [] }, last5: null } },
        rushing: { ALL: { season: null, last5: null }, RB: { season: null, last5: null } },
        receiving: { WR: { season: null, last5: null }, TE: { season: null, last5: null }, RB: { season: null, last5: null } },
      },
    },
    coverage: {
      passing: { QB: { season: 32, last5: 32, ofTeams: 32 } },
      rushing: { ALL: { season: 32, last5: 32, ofTeams: 32 }, RB: { season: 32, last5: 32, ofTeams: 32 } },
      receiving: {
        WR: { season: 32, last5: 32, ofTeams: 32 },
        TE: { season: 32, last5: 32, ofTeams: 32 },
        RB: { season: 32, last5: 32, ofTeams: 32 },
      },
    },
    ...overrides,
  };
}

describe("resolveProductionAllowed", () => {
  it("returns the requested team/market/position/window cell", () => {
    const cell = resolveProductionAllowed(artifact(), "DEN", "passing", "QB", "season");
    expect(cell?.yardsAllowedPerGame).toBe(250.5);
  });

  it("returns null for a missing window rather than another window's value", () => {
    expect(resolveProductionAllowed(artifact(), "DEN", "passing", "QB", "last5")).toBeNull();
  });

  it("returns null for an unknown team", () => {
    expect(resolveProductionAllowed(artifact(), "ZZZ", "passing", "QB", "season")).toBeNull();
  });

  it("returns null when the artifact itself is null", () => {
    expect(resolveProductionAllowed(null, "DEN", "passing", "QB", "season")).toBeNull();
  });

  it("returns null when no team abbreviation is supplied", () => {
    expect(resolveProductionAllowed(artifact(), undefined, "passing", "QB", "season")).toBeNull();
  });
});

describe("formatYardsAllowed", () => {
  it("formats to one decimal", () => {
    expect(formatYardsAllowed({ yardsAllowedPerGame: 205.1, totalYardsAllowed: 3487, gamesIncluded: 17, weeksIncluded: [] })).toBe("205.1");
  });

  it("renders N/A for a null cell, never a fabricated zero", () => {
    expect(formatYardsAllowed(null)).toBe("N/A");
  });
});
