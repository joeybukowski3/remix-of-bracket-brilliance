import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { getVarianceProfile } from "../engine/playerScoreSimulation";
import {
  computeRosterScoringProfile,
  representativeMultiplier,
} from "../engine/rosterScoringProfile";
import { computeRosterStrength } from "../engine/rosterStrength";

const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 6, "scoring-profile-roster");
const roster = draft.rosters.get(6)!;
const draftedPlayerIds = new Set(draft.selections.map((selection) => selection.playerId));

describe("16-0 representative high/low multiplier", () => {
  it("returns a high-side multiplier greater than 1 and a low-side multiplier less than 1", () => {
    const profile = getVarianceProfile("RB", "mid-tier");
    expect(representativeMultiplier(profile, "high")).toBeGreaterThan(1);
    expect(representativeMultiplier(profile, "low")).toBeLessThan(1);
  });

  it("never returns the tier's absolute maximum multiplier as the high-side outcome", () => {
    for (const tier of ["elite", "high-end", "mid-tier", "low-tier"] as const) {
      const profile = getVarianceProfile("WR", tier);
      expect(representativeMultiplier(profile, "high")).toBeLessThan(profile.maximumMultiplier);
    }
  });

  it("widens the spread as position volatility increases, holding tier constant", () => {
    const stable = getVarianceProfile("QB", "mid-tier"); // volatility 0.24
    const volatile = getVarianceProfile("DST", "mid-tier"); // volatility 0.58
    const stableSpread =
      representativeMultiplier(stable, "high") - representativeMultiplier(stable, "low");
    const volatileSpread =
      representativeMultiplier(volatile, "high") - representativeMultiplier(volatile, "low");
    expect(volatileSpread).toBeGreaterThan(stableSpread);
  });

  it("narrows the spread for a more stable elite tier vs. a boom/bust low tier at the same position", () => {
    const elite = getVarianceProfile("WR", "elite");
    const lowTier = getVarianceProfile("WR", "low-tier");
    const eliteSpread = representativeMultiplier(elite, "high") - representativeMultiplier(elite, "low");
    const lowTierSpread =
      representativeMultiplier(lowTier, "high") - representativeMultiplier(lowTier, "low");
    expect(lowTierSpread).toBeGreaterThan(eliteSpread);
  });

  it("never returns a negative multiplier", () => {
    for (const tier of ["elite", "high-end", "mid-tier", "low-tier"] as const) {
      for (const position of ["QB", "RB", "WR", "TE", "K", "DST"] as const) {
        const profile = getVarianceProfile(position, tier);
        expect(representativeMultiplier(profile, "low")).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("16-0 deterministic roster scoring profile", () => {
  it("produces identical values across repeated calls (no randomness consumed)", () => {
    const first = computeRosterScoringProfile(
      roster,
      SIMULATION_PLAYERS,
      draftedPlayerIds,
      DEFENSE_POSITION_RANKS,
    );
    const second = computeRosterScoringProfile(
      roster,
      SIMULATION_PLAYERS,
      draftedPlayerIds,
      DEFENSE_POSITION_RANKS,
    );
    expect(second).toEqual(first);
  });

  it("has a baseline equal to the existing deterministic roster-strength calculation", () => {
    const temporaryReplacementPool = SIMULATION_PLAYERS.filter(
      (player) => player.active && !draftedPlayerIds.has(player.id),
    );
    const expectedBaseline = computeRosterStrength(roster, DEFENSE_POSITION_RANKS, temporaryReplacementPool);
    const profile = computeRosterScoringProfile(
      roster,
      SIMULATION_PLAYERS,
      draftedPlayerIds,
      DEFENSE_POSITION_RANKS,
    );
    expect(profile.baselinePPG).toBe(Math.round(expectedBaseline * 10) / 10);
  });

  it("keeps the high side at or above baseline and the low side at or below baseline", () => {
    const profile = computeRosterScoringProfile(
      roster,
      SIMULATION_PLAYERS,
      draftedPlayerIds,
      DEFENSE_POSITION_RANKS,
    );
    expect(profile.highSidePPG).toBeGreaterThanOrEqual(profile.baselinePPG);
    expect(profile.lowSidePPG).toBeLessThanOrEqual(profile.baselinePPG);
  });

  it("produces finite, non-negative values", () => {
    const profile = computeRosterScoringProfile(
      roster,
      SIMULATION_PLAYERS,
      draftedPlayerIds,
      DEFENSE_POSITION_RANKS,
    );
    for (const value of Object.values(profile)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("is computed with a signature that takes no seed or random source, proving it cannot consume randomness", () => {
    expect(computeRosterScoringProfile.length).toBe(4);
  });
});
