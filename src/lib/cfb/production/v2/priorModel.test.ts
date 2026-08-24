import { describe, expect, it } from "vitest";
import { applyCfbV2PriorModel } from "./priorModel";
import { CFB_V2_PRIOR_DEFENSE_TIERS, CFB_V2_PRIOR_OFFENSE_TIERS } from "./priorCoefficients";

describe("applyCfbV2PriorModel — fallback hierarchy (Phase 3 §9)", () => {
  it("uses PRIOR_D when all offense/defense features are present", () => {
    const result = applyCfbV2PriorModel({
      teamId: "alpha",
      prevSeasonOffense: 0.5,
      prevSeasonDefense: 0.3,
      returningProductionOffense: 0.6,
      talent: 700,
    });
    expect(result.offenseTier).toBe("PRIOR_D");
    expect(result.defenseTier).toBe("PRIOR_D");
    expect(result.priorTier).toBe("PRIOR_D");
    expect(Number.isFinite(result.priorOffense)).toBe(true);
    expect(Number.isFinite(result.priorDefense)).toBe(true);
  });

  it("falls back offense to PRIOR_C when returning production is missing but talent is present", () => {
    const result = applyCfbV2PriorModel({
      teamId: "alpha",
      prevSeasonOffense: 0.5,
      prevSeasonDefense: 0.3,
      returningProductionOffense: null,
      talent: 700,
    });
    expect(result.offenseTier).toBe("PRIOR_C");
  });

  it("falls back to PRIOR_A when only prevSeason is present (never zero-imputes missing talent/returning)", () => {
    const result = applyCfbV2PriorModel({
      teamId: "alpha",
      prevSeasonOffense: 0.5,
      prevSeasonDefense: 0.3,
      returningProductionOffense: null,
      talent: null,
    });
    expect(result.offenseTier).toBe("PRIOR_A");
    expect(result.defenseTier).toBe("PRIOR_A");
  });

  it("falls all the way to LEAGUE_MEAN for a transition team with no prior-FBS history at all", () => {
    const result = applyCfbV2PriorModel({
      teamId: "newTeam",
      prevSeasonOffense: null,
      prevSeasonDefense: null,
      returningProductionOffense: null,
      talent: null,
    });
    expect(result.offenseTier).toBe("LEAGUE_MEAN");
    expect(result.defenseTier).toBe("LEAGUE_MEAN");
    expect(result.priorTier).toBe("LEAGUE_MEAN");
    expect(result.priorOffense).toBe(0);
    expect(result.priorDefense).toBe(0);
  });

  it("resolves talent-only (no prevSeason) to LEAGUE_MEAN — PRIOR_A requires prevSeason, and the chain never opportunistically upgrades", () => {
    const result = applyCfbV2PriorModel({
      teamId: "newTeamWithTalent",
      prevSeasonOffense: null,
      prevSeasonDefense: null,
      returningProductionOffense: null,
      talent: 650,
    });
    expect(result.offenseTier).toBe("LEAGUE_MEAN");
    expect(result.defenseTier).toBe("LEAGUE_MEAN");
  });

  it("combined priorTier is the more-degraded of offense/defense tiers", () => {
    // returning production present -> offense could reach PRIOR_D, but no talent -> both fall to PRIOR_A
    const bothA = applyCfbV2PriorModel({ teamId: "t", prevSeasonOffense: 0.2, prevSeasonDefense: 0.1, returningProductionOffense: 0.5, talent: null });
    expect(bothA.offenseTier).toBe("PRIOR_A");
    expect(bothA.defenseTier).toBe("PRIOR_A");
    expect(bothA.priorTier).toBe("PRIOR_A");
  });

  it("never applies PRIOR_B — collapses to PRIOR_A/PRIOR_D per the frozen PRIOR_D fallback chain", () => {
    // No case in the fallback chain (PRIOR_D -> PRIOR_C -> PRIOR_A) can ever resolve to PRIOR_B.
    for (const tiers of [CFB_V2_PRIOR_OFFENSE_TIERS, CFB_V2_PRIOR_DEFENSE_TIERS]) {
      expect(Object.keys(tiers)).not.toContain("PRIOR_B");
    }
  });

  it("defense PRIOR_D and PRIOR_C tiers are numerically identical (no defensive returning-production signal)", () => {
    expect(CFB_V2_PRIOR_DEFENSE_TIERS.PRIOR_D.coefficients).toEqual(CFB_V2_PRIOR_DEFENSE_TIERS.PRIOR_C.coefficients);
    expect(CFB_V2_PRIOR_DEFENSE_TIERS.PRIOR_D.features).toEqual(CFB_V2_PRIOR_DEFENSE_TIERS.PRIOR_C.features);
  });

  it("is deterministic for identical inputs", () => {
    const input = { teamId: "alpha", prevSeasonOffense: 0.4, prevSeasonDefense: 0.2, returningProductionOffense: 0.55, talent: 600 };
    expect(applyCfbV2PriorModel(input)).toEqual(applyCfbV2PriorModel(input));
  });
});
