import { describe, expect, it } from "vitest";
import { buildYardageOpponentContext } from "./opponentContext";
import type { EpaArtifact } from "@/lib/nfl/epaData";
import type { SuccessRatesArtifact } from "@/lib/nfl/successRateData";
import type { ProductionAllowedArtifact } from "@/lib/nfl/productionAllowedData";

function epaArtifact(): EpaArtifact {
  return {
    _meta: { schemaVersion: "v1", generatedAt: "2026-01-01T00:00:00.000Z", source: "nflverse", notes: [] },
    schemaVersion: "v1",
    attribution: "nflverse / nflfastR",
    currentSeason: 2026,
    priorSeason: 2025,
    seasonsUsed: [2025],
    metricKeys: [],
    metricDirections: {},
    displayDecimals: 3,
    windows: {
      "season-blend": {
        mode: "season",
        includePriorSeason: true,
        teams: {
          kc: { gamesIncluded: 8, gameIds: [], seasons: [2025], through: { season: 2025, week: 18, dateUtc: null }, metrics: { "off.epaPerPass": [0.1, 5] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
          den: { gamesIncluded: 8, gameIds: [], seasons: [2025], through: { season: 2025, week: 18, dateUtc: null }, metrics: { "def.epaPerPassAllowed": [-0.08, 3], "def.epaPerRushAllowed": [-0.02, 10] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
        },
      },
    },
    provenance: null,
  };
}

function successArtifact(): SuccessRatesArtifact {
  return {
    _meta: {
      schemaVersion: "v1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: "RBSDM",
      attribution: "RBSDM / Ben Baldwin",
      endpoint: "https://rbsdm.com/stats",
      currentSeason: 2026,
      priorSeason: 2025,
      completedGameCounts: {},
      notes: [],
    },
    periods: {
      "2025-last8": {
        den: { gamesIncluded: 8, gameIds: [], metrics: { "def.passSuccessRateAllowed": { pct: 42.5, raw: 0.425, rank: 4 } } },
      },
    },
  };
}

function productionAllowedArtifact(): ProductionAllowedArtifact {
  return {
    _meta: { schemaVersion: "v1", generatedAt: "2026-01-01T00:00:00.000Z", source: "nflverse", season: 2025, notes: [] },
    schemaVersion: "nfl-matchup-production-allowed-v1",
    sourceSeason: 2025,
    marketPositions: { passing: ["QB"], rushing: ["ALL", "RB"], receiving: ["WR", "TE", "RB"] },
    teams: {
      DEN: {
        passing: { QB: { season: { yardsAllowedPerGame: 250.5, totalYardsAllowed: 4258.5, gamesIncluded: 17, weeksIncluded: [] }, last5: { yardsAllowedPerGame: 230, totalYardsAllowed: 1150, gamesIncluded: 5, weeksIncluded: [] } } },
        rushing: {
          ALL: { season: { yardsAllowedPerGame: 110, totalYardsAllowed: 1870, gamesIncluded: 17, weeksIncluded: [] }, last5: null },
          RB: { season: { yardsAllowedPerGame: 90, totalYardsAllowed: 1530, gamesIncluded: 17, weeksIncluded: [] }, last5: null },
        },
        receiving: {
          WR: { season: { yardsAllowedPerGame: 130, totalYardsAllowed: 2210, gamesIncluded: 17, weeksIncluded: [] }, last5: null },
          TE: { season: null, last5: null },
          RB: { season: null, last5: null },
        },
      },
    },
    coverage: {
      passing: { QB: { season: 32, last5: 32, ofTeams: 32 } },
      rushing: { ALL: { season: 32, last5: 32, ofTeams: 32 }, RB: { season: 32, last5: 32, ofTeams: 32 } },
      receiving: { WR: { season: 32, last5: 32, ofTeams: 32 }, TE: { season: 0, last5: 0, ofTeams: 32 }, RB: { season: 0, last5: 0, ofTeams: 32 } },
    },
  };
}

const abbrMap = new Map([["den", "DEN"], ["kc", "KC"]]);

describe("buildYardageOpponentContext", () => {
  it("passing: uses pass-mode edges and the QB production-allowed slice", () => {
    const ctx = buildYardageOpponentContext({
      team: "kc",
      opponent: "den",
      market: "passing",
      position: "QB",
      epa: epaArtifact(),
      success: successArtifact(),
      productionAllowed: productionAllowedArtifact(),
      abbrToNflverseAbbr: abbrMap,
    });
    expect(ctx.mode).toBe("pass");
    expect(ctx.productionAllowed.position).toBe("QB");
    expect(ctx.productionAllowed.season?.yardsAllowedPerGame).toBe(250.5);
    expect(ctx.productionAllowed.last5?.yardsAllowedPerGame).toBe(230);
    expect(ctx.epaEdge.defense?.value).toBeCloseTo(-0.08);
    expect(ctx.epaEdge.defense?.rank).toBe(3);
    expect(ctx.successEdge.defense?.value).toBeCloseTo(42.5);
    expect(ctx.successPeriodLabel).toBe("2025 L8");
  });

  it("rushing: RB position uses the RB slice, not the team-wide ALL slice", () => {
    const ctx = buildYardageOpponentContext({
      team: "kc",
      opponent: "den",
      market: "rushing",
      position: "RB",
      epa: epaArtifact(),
      success: successArtifact(),
      productionAllowed: productionAllowedArtifact(),
      abbrToNflverseAbbr: abbrMap,
    });
    expect(ctx.mode).toBe("rush");
    expect(ctx.productionAllowed.position).toBe("RB");
    expect(ctx.productionAllowed.season?.yardsAllowedPerGame).toBe(90);
  });

  it("rushing: QB position falls back to the team-wide ALL slice", () => {
    const ctx = buildYardageOpponentContext({
      team: "kc",
      opponent: "den",
      market: "rushing",
      position: "QB",
      epa: epaArtifact(),
      success: successArtifact(),
      productionAllowed: productionAllowedArtifact(),
      abbrToNflverseAbbr: abbrMap,
    });
    expect(ctx.productionAllowed.position).toBe("ALL");
    expect(ctx.productionAllowed.season?.yardsAllowedPerGame).toBe(110);
  });

  it("receiving: uses pass-mode edges but the player's own position for yards allowed", () => {
    const ctx = buildYardageOpponentContext({
      team: "kc",
      opponent: "den",
      market: "receiving",
      position: "WR",
      epa: epaArtifact(),
      success: successArtifact(),
      productionAllowed: productionAllowedArtifact(),
      abbrToNflverseAbbr: abbrMap,
    });
    expect(ctx.mode).toBe("pass");
    expect(ctx.productionAllowed.position).toBe("WR");
    expect(ctx.productionAllowed.season?.yardsAllowedPerGame).toBe(130);
  });

  it("receiving: a position with no coverage (TE here) resolves to null, never a substituted number", () => {
    const ctx = buildYardageOpponentContext({
      team: "kc",
      opponent: "den",
      market: "receiving",
      position: "TE",
      epa: epaArtifact(),
      success: successArtifact(),
      productionAllowed: productionAllowedArtifact(),
      abbrToNflverseAbbr: abbrMap,
    });
    expect(ctx.productionAllowed.position).toBe("TE");
    expect(ctx.productionAllowed.season).toBeNull();
  });

  it("resolves a null artifact to a fully-null-but-shaped context, never a thrown error", () => {
    const ctx = buildYardageOpponentContext({
      team: "kc",
      opponent: "zzz",
      market: "passing",
      position: "QB",
      epa: null,
      success: null,
      productionAllowed: null,
      abbrToNflverseAbbr: abbrMap,
    });
    expect(ctx.productionAllowed.season).toBeNull();
    expect(ctx.epaEdge.defense).toBeNull();
    expect(ctx.successEdge.defense).toBeNull();
  });
});
