import { describe, expect, it } from "vitest";
import { computeCandidateA, computeCandidateB, candidateAPolicyDiff, type ProductionRowLike } from "./candidates";
import { CANDIDATE_A_SPEC, CANDIDATE_B_SNAP_SPEC, SHADOW_EXCLUDED_SIGNALS } from "./spec";

const row = (position: ProductionRowLike["position"], over: Partial<{ baseline: number; env: number; fpa: number; delta: number | null; ratio: number | null; extra: number }> = {}): ProductionRowLike => {
  const baseline = over.baseline ?? 20; const env = over.env ?? 0.5; const fpa = over.fpa ?? 0.4; const extra = over.extra ?? 0.3;
  return {
    position, baselineFantasyPoints: baseline, projectedFantasyPoints: baseline + extra + env + fpa,
    components: { usageAdjustment: 0, teamContextAdjustment: extra, otherAdjustment: 0, scoringEnvironmentAdjustment: env, opponentFpaAdjustment: fpa },
    context: { scoringEnvironment: { impliedTotalDelta: over.delta === undefined ? 2 : over.delta }, opponentFpa: { opponentFpaRatio: over.ratio === undefined ? 1.1 : over.ratio } },
  };
};

describe("Candidate A", () => {
  it("QB: swaps ONLY the FPA layer (weight 0.20 -> 0.23); implied-total layer untouched", () => {
    const prod = row("QB", { baseline: 20, ratio: 1.1, fpa: 0.4 });
    const a = computeCandidateA(prod);
    expect(a.components.fpaAdjustment).toBeCloseTo(20 * 0.1 * CANDIDATE_A_SPEC.QB.fpa.weight, 10);
    expect(a.projection).toBeCloseTo(prod.projectedFantasyPoints - 0.4 + a.components.fpaAdjustment, 10);
    expect(a.components.envAdjustment).toBe(0);
  });
  it("QB/RB: FPA cap binds and a null ratio is neutral (never fabricated)", () => {
    expect(computeCandidateA(row("QB", { baseline: 30, ratio: 2 })).components.fpaAdjustment).toBe(CANDIDATE_A_SPEC.QB.fpa.cap);
    const neutral = computeCandidateA(row("QB", { ratio: null, fpa: 0 }));
    expect(neutral.components.fpaAdjustment).toBe(0);
  });
  it("RB: re-weights ONLY the FPA layer (0.15 -> 0.17) on the production row; no level shift, no history plumbing", () => {
    const prod = row("RB", { baseline: 20, ratio: 1.1, fpa: 0.3, extra: 0.2 });
    const a = computeCandidateA(prod);
    expect(a.components.fpaAdjustment).toBeCloseTo(20 * 0.1 * CANDIDATE_A_SPEC.RB.fpa.weight, 10);
    expect(a.projection).toBeCloseTo(prod.projectedFantasyPoints - 0.3 + a.components.fpaAdjustment, 10);
    expect(Object.keys(a.components)).toEqual(["envAdjustment", "fpaAdjustment", "snapAdjustment", "notes"]);
  });
  it("WR: swaps ONLY the implied-total layer (0.26 -> 0.08, capped); FPA layer is production's", () => {
    const prod = row("WR", { env: 1.0, fpa: 0.6, delta: 3 });
    const a = computeCandidateA(prod);
    expect(a.components.envAdjustment).toBeCloseTo(3 * CANDIDATE_A_SPEC.WR.env.coefficient, 10);
    expect(a.projection).toBeCloseTo(prod.projectedFantasyPoints - 1.0 + a.components.envAdjustment, 10);
    expect(computeCandidateA(row("WR", { delta: 100 })).components.envAdjustment).toBe(CANDIDATE_A_SPEC.WR.env.cap);
    expect(computeCandidateA(row("WR", { delta: null, env: 0 })).components.envAdjustment).toBe(0);
  });
  it("TE: exactly production", () => {
    const prod = row("TE");
    expect(computeCandidateA(prod).projection).toBe(prod.projectedFantasyPoints);
  });
  it("states the policy diff explicitly", () => {
    expect(candidateAPolicyDiff().WR.envCoefficient).toEqual([0.26, 0.08]);
    expect(candidateAPolicyDiff().QB.fpaWeight).toEqual([0.2, 0.23]);
    expect(candidateAPolicyDiff().RB.fpaWeight).toEqual([0.15, 0.17]);
    expect(SHADOW_EXCLUDED_SIGNALS).toEqual(["trench-advantage", "epa-advantage", "success-advantage", "td-score", "red-zone-usage"]);
  });
});

describe("Candidate B", () => {
  const a = computeCandidateA(row("WR"));
  it("adds snap share for WR/TE only, centred on the training mean, symmetric cap", () => {
    const spec = CANDIDATE_B_SNAP_SPEC.WR!;
    expect(computeCandidateB(a, "WR", spec.mean).components.snapAdjustment).toBeCloseTo(0, 10);
    expect(computeCandidateB(a, "WR", spec.mean + spec.sd).components.snapAdjustment).toBeCloseTo(spec.perSd, 10);
    expect(computeCandidateB(a, "WR", 0.01).components.snapAdjustment).toBe(-spec.cap);
    expect(computeCandidateB(a, "WR", 5).components.snapAdjustment).toBe(spec.cap);
    expect(computeCandidateB(a, "TE", 0.9).components.snapAdjustment).toBeGreaterThan(0);
  });
  it("never touches QB/RB and treats missing snap share as exactly zero", () => {
    for (const pos of ["QB", "RB"] as const) {
      const r = computeCandidateA(row(pos));
      const b = computeCandidateB(r, pos, 0.99);
      expect(b.projection).toBe(r.projection);
      expect(b.components.snapAdjustment).toBe(0);
    }
    const missing = computeCandidateB(a, "WR", null);
    expect(missing.projection).toBe(a.projection);
    expect(missing.components.notes.join()).toContain("missing");
  });
});
