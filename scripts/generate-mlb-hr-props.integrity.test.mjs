import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBatterGameIdentity,
  computeBatterHrScore,
  getEasternDate,
  resolveSlateDate,
} from "./generate-mlb-hr-props.mjs";
import { computeCandidateHrScore } from "./lib/mlb-hr-candidate-score.mjs";

describe("explicit HR slate date", () => {
  it("uses the explicit date instead of the current Eastern date", () => {
    const now = new Date("2026-07-14T16:00:00Z");
    assert.equal(getEasternDate(now), "2026-07-14");
    assert.equal(resolveSlateDate(["--date", "2026-07-02"], now), "2026-07-02");
  });

  it("falls back to the Eastern current date only when no explicit date exists", () => {
    assert.equal(resolveSlateDate([], new Date("2026-07-15T02:00:00Z")), "2026-07-14");
  });

  it("rejects missing or malformed date arguments", () => {
    assert.throws(() => resolveSlateDate(["--date"]), /valid YYYY-MM-DD/);
    assert.throws(() => resolveSlateDate(["--date", "07-14-2026"]), /valid YYYY-MM-DD/);
  });
});

describe("doubleheader batter identity", () => {
  it("keeps the same player and teams separate across distinct game IDs", () => {
    const gameOne = { player: "Same Player", playerId: 123, gameId: 7001, team: "NYY", opponent: "BOS" };
    const gameTwo = { ...gameOne, gameId: 7002 };
    assert.notEqual(buildBatterGameIdentity(gameOne), buildBatterGameIdentity(gameTwo));
    assert.equal(new Set([gameOne, gameTwo].map(buildBatterGameIdentity)).size, 2);
  });
});

describe("scoring formulas remain unchanged", () => {
  it("retains deterministic live and standalone candidate scores", () => {
    const batter = {
      barrelRate: 12,
      hardHitRate: 45,
      iso: 0.22,
      xba: 0.27,
      whiffRate: 22,
      last7HR: 2,
      last30HR: 6,
      opposingPitcherHrVs: 65,
      pitcherXera: 4.8,
      pitcherRegressionScore: 0.5,
      pitcherFlyBallRate: 42,
      parkFactor: 1.1,
      weatherBoost: 2,
    };
    const contexts = {
      barrelValues: [8, 12, 16],
      hardHitValues: [35, 45, 55],
      xbaValues: [0.22, 0.27, 0.31],
      whiffValues: [18, 22, 28],
      last7Values: [0, 2, 4],
      last30Values: [1, 6, 10],
      parkValues: [0.9, 1.1, 1.3],
    };

    assert.equal(computeBatterHrScore(batter, contexts), 55.6);
    assert.equal(computeCandidateHrScore(batter).candidateHrQualityScore, 57.4);
  });
});
