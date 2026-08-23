import { describe, expect, it } from "vitest";
import { runPhase9Pipeline } from "./pipeline";
import { runPhase8WalkForward } from "../phase8/phase8WalkForward";
import { PHASE9_BASELINE_SPEC } from "./config";

/**
 * Section 26 — "baseline pipeline remains unchanged" + "repeated run is
 * deterministic". Phase 8's rating step is already proven leakage-safe and
 * byte-identical to Phase 4 (phase8/baselineFidelity.test.ts); this test
 * proves the Phase 9 orchestration WRAPPER introduces no distortion of its
 * own by comparing its rating-step output directly against calling Phase
 * 8's own walk-forward function.
 */
describe("Phase 9 pipeline wrapper fidelity", () => {
  it(
    "ratingPredictions from runPhase9Pipeline match calling runPhase8WalkForward directly, for the same spec/season",
    { timeout: 120_000 },
    () => {
      const testSeasons = [2020];
      const viaPhase9 = runPhase9Pipeline(PHASE9_BASELINE_SPEC, testSeasons);
      const viaPhase8Direct = runPhase8WalkForward({ testSeasons, candidateSpec: PHASE9_BASELINE_SPEC });

      expect(viaPhase9.ratingPredictions.length).toBe(viaPhase8Direct.length);
      const byGame = new Map(viaPhase8Direct.map((p) => [p.gameId, p]));
      for (const p of viaPhase9.ratingPredictions) {
        const match = byGame.get(p.gameId);
        expect(match).toBeDefined();
        expect(p.projectedMargin).toBe(match!.projectedMargin);
        expect(p.expectedHomePoints).toBe(match!.expectedHomePoints);
      }
    },
  );

  it(
    "repeated runs of the same spec/season are byte-identical (deterministic seeded bootstrap)",
    { timeout: 180_000 },
    () => {
      const testSeasons = [2020];
      const run1 = runPhase9Pipeline(PHASE9_BASELINE_SPEC, testSeasons);
      const run2 = runPhase9Pipeline(PHASE9_BASELINE_SPEC, testSeasons);

      expect(run1.calibrated.length).toBe(run2.calibrated.length);
      expect(run1.probabilities.length).toBe(run2.probabilities.length);
      expect(JSON.stringify(run1.calibrated)).toBe(JSON.stringify(run2.calibrated));
      expect(JSON.stringify(run1.probabilities)).toBe(JSON.stringify(run2.probabilities));
    },
  );
});
