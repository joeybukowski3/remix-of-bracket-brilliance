import { describe, expect, it } from "vitest";
import { makeRow } from "../model/__fixtures__/rows";
import {
  evaluateResidualActivation,
  getCurrentInferencePolicy,
  getInferencePolicy,
  WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION,
} from "./inferencePolicy";
import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "../model/frozenSpec";

describe("inference-policy version authority", () => {
  it("exposes the approved contract for weekly-fantasy-projection-inference-v1", () => {
    const policy = getCurrentInferencePolicy();
    expect(policy.inferencePolicyVersion).toBe(WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION);
    expect(policy.modelVersion).toBe(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION);
    expect(policy.week1Authority).toBe("baseline-only");
    expect(policy.learnedResidualActivation).toBe("any-selected-non-baseline-feature-observed");
    expect(getInferencePolicy(WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION)).toEqual(policy);
  });

  it("fails closed for an unknown inference-policy version instead of falling back", () => {
    expect(() => getInferencePolicy("weekly-fantasy-projection-inference-v2")).toThrow();
    expect(() => getInferencePolicy("")).toThrow();
  });
});

describe("evaluateResidualActivation", () => {
  it("activates when at least one selected non-baseline current-season feature is observed", () => {
    const row = makeRow({ season: 2026, week: 2, playerId: "gsis:rb-wk2", position: "RB", targetsSeasonPrior: 3, carriesSeasonPrior: null });
    const result = evaluateResidualActivation("RB", row);
    expect(result).toEqual({ activated: true, reason: "selected-current-season-feature-observed" });
  });

  it("does NOT activate when every selected non-baseline feature is structurally missing (Week 1 shape)", () => {
    const row = makeRow({
      season: 2026, week: 1, playerId: "gsis:rb-wk1", position: "RB", gamesPlayedPrior: 0,
      carriesSeasonPrior: null, carriesLast3: null, targetsSeasonPrior: null, targetsLast3: null,
      receptionsSeasonPrior: null, rushYardsSeasonPrior: null, receivingYardsSeasonPrior: null,
      targetShareSeasonPrior: null, teamRushEpaPrior: null, teamOffensivePlaysPrior: null,
    });
    const result = evaluateResidualActivation("RB", row);
    expect(result).toEqual({ activated: false, reason: "no-selected-current-season-features-observed" });
  });

  it("ignores missingness indicators entirely -- it reads raw pregame feature values only, never a deployment bundle", () => {
    // evaluateResidualActivation's signature has no bundle/scaler/indicator parameter at all,
    // so there is structurally no missingness-indicator input it could consult.
    expect(evaluateResidualActivation.length).toBe(2);
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:wr-1", position: "WR", targetsSeasonPrior: null, targetsLast3: null, receptionsSeasonPrior: null, receivingYardsSeasonPrior: null, receivingAirYardsSeasonPrior: null, airYardsShareSeasonPrior: null, targetShareSeasonPrior: null });
    expect(evaluateResidualActivation("WR", row).activated).toBe(false);
  });

  it("is independent of the baseline authority (fallback baseline never counts as an observed feature)", () => {
    // Baseline-authority fields (priorSeasonPpg, seasonPpgPrior, etc.) are never in a frozen
    // RB/WR/TE `features` list, so a present baseline/fallback value cannot itself activate the residual.
    const row = makeRow({
      season: 2026, week: 1, playerId: "gsis:te-1", position: "TE", priorSeasonPpg: 8, seasonPpgPrior: null,
      targetsSeasonPrior: null, targetsLast3: null, receptionsSeasonPrior: null, receivingYardsSeasonPrior: null,
      receivingAirYardsSeasonPrior: null, airYardsShareSeasonPrior: null, targetShareSeasonPrior: null,
    });
    expect(evaluateResidualActivation("TE", row).activated).toBe(false);
  });

  it("requires no target-week information -- output is unaffected by target-week-only fields", () => {
    const base = { season: 2026 as const, week: 1 as const, playerId: "gsis:wr-2", position: "WR" as const, targetsSeasonPrior: 5 };
    const withZeroOutcome = makeRow({ ...base, actualFantasyPoints: 0 });
    const withNonZeroOutcome = makeRow({ ...base, actualFantasyPoints: 27.4 });
    expect(evaluateResidualActivation("WR", withZeroOutcome)).toEqual(evaluateResidualActivation("WR", withNonZeroOutcome));
  });
});
