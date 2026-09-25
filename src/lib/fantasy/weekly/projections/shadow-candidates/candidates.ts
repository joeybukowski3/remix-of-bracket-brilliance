import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { CANDIDATE_A_SPEC, CANDIDATE_B_SNAP_SPEC, PRODUCTION_POLICY_REFERENCE } from "./spec";

/** Structural subset of `WeeklyFantasyProjectionProductionRow` the candidates need (keeps this module decoupled from the zod contract). */
export type ProductionRowLike = {
  position: FantasyPosition;
  projectedFantasyPoints: number;
  baselineFantasyPoints: number;
  components: { usageAdjustment: number; teamContextAdjustment: number; otherAdjustment: number; scoringEnvironmentAdjustment: number; opponentFpaAdjustment: number };
  context: {
    scoringEnvironment: { impliedTotalDelta: number | null };
    opponentFpa: { opponentFpaRatio: number | null };
  };
};

export type CandidateComponents = {
  /** What the candidate replaced/added, in fantasy points, relative to the production number it started from. */
  envAdjustment: number;
  fpaAdjustment: number;
  snapAdjustment: number;
  notes: string[];
};

export type CandidateResult = { projection: number; components: CandidateComponents };

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

function fpaAdjustment(row: ProductionRowLike, weight: number, cap: number): number {
  const ratio = row.context.opponentFpa.opponentFpaRatio;
  // Mirrors production/context.ts: missing ratio => neutral 0 (never fabricated).
  return ratio == null ? 0 : clamp(row.baselineFantasyPoints * (ratio - 1) * weight, -cap, cap);
}

/** Candidate A. `productionRow` is the PUBLIC production row exactly as published (RB rows must already include the team-history repair). */
export function computeCandidateA(productionRow: ProductionRowLike): CandidateResult {
  const pos = productionRow.position;
  const notes: string[] = [];
  const empty: CandidateComponents = { envAdjustment: 0, fpaAdjustment: 0, snapAdjustment: 0, notes };

  if (pos === "QB") {
    const { weight, cap } = CANDIDATE_A_SPEC.QB.fpa;
    const fpa = fpaAdjustment(productionRow, weight, cap);
    const delta = fpa - productionRow.components.opponentFpaAdjustment;
    return { projection: productionRow.projectedFantasyPoints + delta, components: { ...empty, fpaAdjustment: fpa } };
  }
  if (pos === "RB") {
    // Production RB rows already carry the repaired team-history residual; Candidate A only re-weights the FPA layer.
    const { weight, cap } = CANDIDATE_A_SPEC.RB.fpa;
    const fpa = fpaAdjustment(productionRow, weight, cap);
    return { projection: productionRow.projectedFantasyPoints - productionRow.components.opponentFpaAdjustment + fpa, components: { ...empty, fpaAdjustment: fpa } };
  }
  if (pos === "WR") {
    const { coefficient, cap } = CANDIDATE_A_SPEC.WR.env;
    const delta = productionRow.context.scoringEnvironment.impliedTotalDelta;
    const env = delta == null ? 0 : clamp(delta * coefficient, -cap, cap);
    return { projection: productionRow.projectedFantasyPoints - productionRow.components.scoringEnvironmentAdjustment + env, components: { ...empty, envAdjustment: env } };
  }
  return { projection: productionRow.projectedFantasyPoints, components: empty };
}

/** Candidate B = Candidate A + snap-share adjustment for WR/TE only; missing snap share => exactly 0. */
export function computeCandidateB(candidateA: CandidateResult, position: FantasyPosition, snapShareL3: number | null): CandidateResult {
  const spec = CANDIDATE_B_SNAP_SPEC[position];
  if (!spec || snapShareL3 == null || !Number.isFinite(snapShareL3)) {
    return { projection: candidateA.projection, components: { ...candidateA.components, snapAdjustment: 0, notes: [...candidateA.components.notes, spec ? "snap share missing: no adjustment" : "position not supported by the audit: no snap adjustment"] } };
  }
  const adjustment = clamp(((snapShareL3 - spec.mean) / spec.sd) * spec.perSd, -spec.cap, spec.cap);
  return { projection: candidateA.projection + adjustment, components: { ...candidateA.components, snapAdjustment: adjustment } };
}

/** Explicit, testable statement of how each production policy value was changed by Candidate A. */
export function candidateAPolicyDiff() {
  return {
    QB: { fpaWeight: [PRODUCTION_POLICY_REFERENCE.fpa.QB.weight, CANDIDATE_A_SPEC.QB.fpa.weight] },
    RB: { fpaWeight: [PRODUCTION_POLICY_REFERENCE.fpa.RB.weight, CANDIDATE_A_SPEC.RB.fpa.weight] },
    WR: { envCoefficient: [PRODUCTION_POLICY_REFERENCE.env.WR.coefficient, CANDIDATE_A_SPEC.WR.env.coefficient] },
    TE: {},
  } as const;
}
