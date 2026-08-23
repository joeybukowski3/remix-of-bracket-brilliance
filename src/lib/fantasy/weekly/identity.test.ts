import {
  normalizeNflTeamAbbr,
  resolveCanonicalPlayerIdentity,
  resolveWeekEffectiveTeam,
} from "@/lib/fantasy/weekly/identity";

describe("weekly player identity", () => {
  it("uses namespaced GSIS IDs and preserves external IDs", () => {
    const result = resolveCanonicalPlayerIdentity({
      gsisId: "00-001", pfrId: "SameJo01", espnId: 123, playerName: "John Same", position: "WR",
    });
    expect(result).toMatchObject({ resolved: true, identity: { playerId: "gsis:00-001" } });
  });

  it("keeps same-name players distinct", () => {
    const first = resolveCanonicalPlayerIdentity({ gsisId: "00-001", playerName: "Alex Smith", position: "QB" });
    const second = resolveCanonicalPlayerIdentity({ gsisId: "00-002", playerName: "Alex Smith", position: "TE" });
    expect(first.resolved && first.identity.playerId).not.toBe(second.resolved && second.identity.playerId);
  });

  it("resolves trades without reading a future assignment", () => {
    const assignments = [
      { playerId: "gsis:00-001", season: 2025, week: 1, team: "JAC" },
      { playerId: "gsis:00-001", season: 2025, week: 8, team: "WAS" },
    ];
    expect(resolveWeekEffectiveTeam(assignments, "gsis:00-001", 2025, 7)).toBe("jax");
    expect(resolveWeekEffectiveTeam(assignments, "gsis:00-001", 2025, 8)).toBe("wsh");
    expect(resolveWeekEffectiveTeam(assignments, "gsis:00-001", 2024, 18)).toBeNull();
  });

  it("normalizes known team aliases", () => {
    expect(normalizeNflTeamAbbr("LA")).toBe("lar");
    expect(normalizeNflTeamAbbr("JAC")).toBe("jax");
    expect(normalizeNflTeamAbbr("WAS")).toBe("wsh");
  });

  it("normalizes both nflverse Cardinals team codes (AZ and ARI) to the same schedule-source abbreviation", () => {
    expect(normalizeNflTeamAbbr("AZ")).toBe("ari");
    expect(normalizeNflTeamAbbr("ARI")).toBe("ari");
    expect(normalizeNflTeamAbbr("az")).toBe("ari");
  });

  it("reports missing IDs instead of joining by name", () => {
    expect(resolveCanonicalPlayerIdentity({ playerName: "No Id", position: "RB" }))
      .toEqual({ resolved: false, reason: "missing-gsis-id" });
  });
});
