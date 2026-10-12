/**
 * Golden test: baseline v0 behavior under the public, untuned benchmark
 * parameters (BASELINE_V0_PUBLIC_PARAMS = the design defaults).
 *
 * Re-captured in Phase 2B when the NBA.com-tuned Phase 1 values were removed
 * from tracked code pending a rights determination. These outputs are NOT
 * numerically equivalent to the Phase 1 tuned benchmark. If this test fails,
 * v0 behavior changed: revert the change rather than updating the numbers.
 */
import { describe, expect, it } from "vitest";
import { buildTeamGameDates, computePregameFeatures } from "./features";
import { BASELINE_MODEL_VERSION, DEFAULT_BASELINE_PARAMS, projectBaseline, projectNaive } from "./projection";
import { V0_GOLDEN_HISTORY, V0_GOLDEN_PRIORS, V0_GOLDEN_TARGETS, V0_GOLDEN_TEAM_ROWS, V0_PUBLIC_PARAMS } from "./__fixtures__/v0Golden";

const EXPECTED = [
  {
    "gameId": "0022400005",
    "model": {
      "minutes": 30.741190476190486,
      "pts": 18.507647493283926,
      "reb": 7.233115316567322,
      "ast": 3.580226942081725
    },
    "naive_l10": {
      "minutes": 31.6,
      "pts": 18.9,
      "reb": 7.3,
      "ast": 3.6
    },
    "flags": {
      "historyTier": "partial",
      "teamChanged": false,
      "teamChangedRecently": false,
      "returningFromAbsence": false,
      "roleChange": false,
      "teamGamesMissed": 0
    }
  },
  {
    "gameId": "0022400017",
    "model": {
      "minutes": 31.318181818181824,
      "pts": 18.777737694404365,
      "reb": 7.386604136604137,
      "ast": 3.639660493827161
    },
    "naive_l10": {
      "minutes": 32.1,
      "pts": 19.4,
      "reb": 7.6,
      "ast": 3.7
    },
    "flags": {
      "historyTier": "full",
      "teamChanged": false,
      "teamChangedRecently": false,
      "returningFromAbsence": true,
      "roleChange": false,
      "teamGamesMissed": 4
    }
  },
  {
    "gameId": "0022400020",
    "model": {
      "minutes": 28.490909090909096,
      "pts": 17.07423373010228,
      "reb": 6.729621093564757,
      "ast": 3.27464630657119
    },
    "naive_l10": {
      "minutes": 29.4,
      "pts": 17.7,
      "reb": 7,
      "ast": 3.5
    },
    "flags": {
      "historyTier": "full",
      "teamChanged": true,
      "teamChangedRecently": true,
      "returningFromAbsence": false,
      "roleChange": false,
      "teamGamesMissed": null
    }
  },
  {
    "gameId": "0022400023",
    "model": {
      "minutes": 20.550000000000004,
      "pts": 12.339121069710197,
      "reb": 4.926527358173884,
      "ast": 2.440077766588341
    },
    "naive_l10": {
      "minutes": 23.7,
      "pts": 14.3,
      "reb": 5.9,
      "ast": 3
    },
    "flags": {
      "historyTier": "full",
      "teamChanged": false,
      "teamChangedRecently": true,
      "returningFromAbsence": false,
      "roleChange": true,
      "teamGamesMissed": 0
    }
  },
  {
    "gameId": "0022409999",
    "model": {
      "minutes": 30.35454545454546,
      "pts": 18.207851586974133,
      "reb": 7.150249851006281,
      "ast": 3.51786396491389
    },
    "naive_l10": {
      "minutes": 31.6,
      "pts": 18.8,
      "reb": 7.4,
      "ast": 3.5
    },
    "flags": {
      "historyTier": "full",
      "teamChanged": true,
      "teamChangedRecently": true,
      "returningFromAbsence": false,
      "roleChange": false,
      "teamGamesMissed": null
    }
  }
] as const;

describe("baseline v0 golden outputs (public untuned parameters)", () => {
  const dates = buildTeamGameDates(V0_GOLDEN_TEAM_ROWS);

  it("keeps its model version and uses the frozen untuned defaults", () => {
    expect(BASELINE_MODEL_VERSION).toBe("nba-props-baseline-v0");
    expect(V0_PUBLIC_PARAMS).toEqual(DEFAULT_BASELINE_PARAMS);
    expect(V0_PUBLIC_PARAMS).toEqual({
      minutesWeights: { l5: 0.4, l10: 0.3, l20: 0.2, seasonToDate: 0.1 },
      minutesShrinkGames: 2,
      newPlayerMinutes: 14,
      rateShrinkMinutes: { pts: 100, reb: 100, ast: 100 },
      prevSeasonMinGames: 10,
      prevSeasonMinMinutes: 200,
      stintMinGames: 3,
    });
    expect(Object.isFrozen(V0_PUBLIC_PARAMS) && Object.isFrozen(V0_PUBLIC_PARAMS.rateShrinkMinutes)).toBe(true);
  });

  it.each(EXPECTED.map((row, index) => [row.gameId, index] as const))("reproduces target %s", (_gameId, index) => {
    const features = computePregameFeatures(V0_GOLDEN_HISTORY, V0_GOLDEN_TARGETS[index], dates);
    const expected = EXPECTED[index];
    const model = projectBaseline(features, V0_GOLDEN_PRIORS, V0_PUBLIC_PARAMS);
    for (const stat of ["minutes", "pts", "reb", "ast"] as const) {
      expect(model[stat]).toBeCloseTo(expected.model[stat], 9);
      expect(projectNaive(features).naive_l10[stat]).toBeCloseTo(expected.naive_l10[stat], 9);
    }
    expect({
      historyTier: features.historyTier,
      teamChanged: features.teamChanged,
      teamChangedRecently: features.teamChangedRecently,
      returningFromAbsence: features.returningFromAbsence,
      roleChange: features.roleChange,
      teamGamesMissed: features.teamGamesMissed,
    }).toEqual(expected.flags);
  });

  it("projects the no-history prior", () => {
    const features = computePregameFeatures([], V0_GOLDEN_TARGETS[0], dates);
    const m = V0_PUBLIC_PARAMS.newPlayerMinutes;
    expect(projectBaseline(features, V0_GOLDEN_PRIORS, V0_PUBLIC_PARAMS)).toEqual({ minutes: m, pts: m * 0.47, reb: m * 0.19, ast: m * 0.11 });
  });
});
