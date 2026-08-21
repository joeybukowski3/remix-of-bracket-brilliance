import { describe, expect, it } from "vitest";
import { resolveProductionProjectionIdentity, type ProductionIdentitySourceRow } from "./productionIdentity";

const row = (overrides: Partial<ProductionIdentitySourceRow> = {}): ProductionIdentitySourceRow => ({
  gsisId: "00-canonical", pfrId: "AlleJo02", playerName: "Josh Allen", position: "QB", team: "BUF", status: "ACT", ...overrides,
});

describe("production projection identity", () => {
  it("repairs the Josh Allen collision only through exact name and position", () => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId: "AlleJo01", playerName: "Josh Allen", position: "QB", team: "BUF" },
      rosterRows: [row({ pfrId: "AlleJo01", playerName: "Jonathan Allen", position: "DL", gsisId: "00-wrong" }), row()],
      playerRows: [row({ pfrId: "AlleJo01", playerName: "Jonathan Allen", position: "DL", gsisId: "00-wrong" }), row()],
    });
    expect(result).toMatchObject({ resolved: true, gsisId: "00-canonical", strategy: "exact-name-position", directPfrConflict: true });
  });

  it("repairs the Jahmyr Gibbs collision without accepting Jack Gibbens", () => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId: "GibbJa00", playerName: "Jahmyr Gibbs", position: "RB", team: "DET" },
      rosterRows: [
        row({ pfrId: "GibbJa00", playerName: "Jack Gibbens", position: "LB", team: "ARI", gsisId: "00-wrong" }),
        row({ pfrId: "GibbJa01", playerName: "Jahmyr Gibbs", position: "RB", team: "DET", gsisId: "00-gibbs" }),
      ],
      playerRows: [],
    });
    expect(result).toMatchObject({ resolved: true, gsisId: "00-gibbs", directPfrConflict: true });
  });

  it("fails closed on team conflicts between duplicate exact identities", () => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId: "missing", playerName: "Duplicate Name", position: "WR", team: "FA" },
      rosterRows: [row({ playerName: "Duplicate Name", position: "WR", team: "BUF" }), row({ playerName: "Duplicate Name", position: "WR", team: "MIA", gsisId: "00-other" })],
      playerRows: [],
    });
    expect(result.resolved).toBe(false);
    expect(result.failureReason).toMatch(/multiple exact/);
  });

  it("uses an exact projected team only to disambiguate duplicate exact names", () => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId: "missing", playerName: "Duplicate Name", position: "WR", team: "MIA" },
      rosterRows: [row({ playerName: "Duplicate Name", position: "WR", team: "BUF" }), row({ playerName: "Duplicate Name", position: "WR", team: "MIA", gsisId: "00-other" })],
      playerRows: [],
    });
    expect(result).toMatchObject({ resolved: true, gsisId: "00-other" });
  });

  it("fails closed on a position conflict even when name, team, and PFR ID match", () => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId: "MeltBo00", playerName: "Bo Melton", position: "WR", team: "GB" },
      rosterRows: [row({ pfrId: "MeltBo00", playerName: "Bo Melton", position: "DB", team: "GB" })],
      playerRows: [row({ pfrId: "MeltBo00", playerName: "Bo Melton", position: "WR", team: null })],
    });
    expect(result.resolved).toBe(false);
    expect(result.failureReason).toBe("current roster position conflicts with projection position");
  });

  it("does not use a shared PFR stem as a production join", () => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId: "SamePl00", playerName: "Projection Name", position: "WR", team: "BUF" },
      rosterRows: [row({ pfrId: "SamePl01", playerName: "Different Name", position: "WR", team: "BUF" })],
      playerRows: [],
    });
    expect(result.resolved).toBe(false);
  });

  it.each([
    ["WalkKe01", "Ken Walker III", "RB", "Kenneth Walker III"],
    ["GainKe00", "Kenny Gainwell", "RB", "Kenneth Gainwell"],
    ["PalmJo01", "Joshua Palmer", "WR", "Josh Palmer"],
    ["BrowMa05", "Hollywood Brown", "WR", "Marquise Brown"],
    ["TinsMi00", "Mitch Tinsley", "WR", "Mitchell Tinsley"],
    ["HibnMa00", "Matt Hibner", "TE", "Matthew Hibner"],
  ] as const)("allows audited alias %s and no broader name similarity", (sourceId, projectionName, position, rosterName) => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId, playerName: projectionName, position, team: "BUF" },
      rosterRows: [row({ pfrId: sourceId, playerName: rosterName, position, team: "BUF" })],
      playerRows: [],
    });
    expect(result).toMatchObject({ resolved: true });
    expect(result.roster?.playerName).toBe(rosterName);
  });

  it("keeps GSIS canonical when an exact roster row lacks GSIS", () => {
    const result = resolveProductionProjectionIdentity({
      projection: { sourceId: "TraoSe00", playerName: "Seydou Traore", position: "TE", team: "MIA" },
      rosterRows: [row({ gsisId: null, pfrId: null, playerName: "Seydou Traore", position: "TE", team: "MIA", status: "E14" })],
      playerRows: [row({ gsisId: "00-traore", pfrId: "TraoSe00", playerName: "Seydou Traore", position: "TE", team: null })],
    });
    expect(result).toMatchObject({ resolved: true, gsisId: "00-traore", strategy: "exact-name-position" });
  });
});
