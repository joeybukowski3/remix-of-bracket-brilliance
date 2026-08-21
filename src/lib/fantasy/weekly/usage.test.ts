import { normalizeWeeklyUsage } from "@/lib/fantasy/weekly/usage";

describe("weekly usage normalization", () => {
  it("preserves supported counts and shares", () => {
    expect(normalizeWeeklyUsage({ offensiveSnaps: 52, snapShare: 0.8, targets: 9, targetShare: 0.27 }))
      .toMatchObject({ offensiveSnaps: 52, snapShare: 0.8, targets: 9, targetShare: 0.27 });
  });

  it("keeps missing and unsupported fields null", () => {
    expect(normalizeWeeklyUsage({})).toEqual({
      offensiveSnaps: null, snapShare: null, passAttempts: null, completions: null,
      rushAttempts: null, targets: null, receptions: null, receivingAirYards: null,
      targetShare: null, airYardsShare: null, routes: null, routeParticipation: null,
      redZoneTouches: null, goalLineTouches: null, redZoneTargets: null,
    });
  });

  it("accepts signed receiving air-yard fields", () => {
    expect(normalizeWeeklyUsage({ receivingAirYards: -4, airYardsShare: -0.02 }))
      .toMatchObject({ receivingAirYards: -4, airYardsShare: -0.02 });
  });

  it("never fabricates or clamps invalid shares", () => {
    expect(() => normalizeWeeklyUsage({ snapShare: 1.2 })).toThrow();
    expect(() => normalizeWeeklyUsage({ targets: -1 })).toThrow();
  });
});
