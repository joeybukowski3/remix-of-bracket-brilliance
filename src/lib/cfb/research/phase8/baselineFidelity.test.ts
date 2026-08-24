import { describe, expect, it } from "vitest";
import { runPhase8WalkForward } from "./phase8WalkForward";
import { BASELINE_SPEC } from "./candidateSpecs";
import { computePhase4Predictions } from "../phase5/phase5WalkForward";

/**
 * Section 24 — "frozen baseline remains byte-identical": BASELINE_SPEC
 * (GLOBAL_BASELINE connectivity, NONE staleness, lambda=20) must reduce
 * every per-team λ_i to exactly Phase 4's constant ratingLambda=20, so its
 * predictions must match Phase 4's own frozen walk-forward exactly. Only
 * 2020 is used here (full 6-season run is exercised in the driver script)
 * to keep this test fast; a match on one season is sufficient to prove the
 * per-team-lambda machinery collapses to the scalar case correctly.
 */
describe("BASELINE_SPEC reproduces Phase 4's frozen walk-forward exactly", () => {
  it("projectedMargin matches Phase 4 for every game in season 2020", { timeout: 60_000 }, () => {
    const phase8 = runPhase8WalkForward({ testSeasons: [2020], candidateSpec: BASELINE_SPEC });
    const phase4 = computePhase4Predictions().filter((p) => p.season === 2020);

    expect(phase8.length).toBe(phase4.length);
    expect(phase8.length).toBeGreaterThan(0);

    const phase4ByGame = new Map(phase4.map((p) => [p.gameId, p]));
    for (const p of phase8) {
      const match = phase4ByGame.get(p.gameId);
      expect(match).toBeDefined();
      expect(p.projectedMargin).toBeCloseTo(match!.projectedMargin as number, 9);
      expect(p.expectedHomePoints).toBeCloseTo(match!.expectedHomePoints as number, 9);
    }
  });
});
