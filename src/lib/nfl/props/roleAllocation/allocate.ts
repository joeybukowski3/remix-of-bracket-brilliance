/**
 * WU4B S4 — constrained allocation of a finite pool to players.
 *
 * The pool (positional designed-rush sub-pool, or targetable pass pool) is
 * FIXED. Raw model shares are clipped ≥ 0 and renormalised to sum to 1
 * within the pool, so projected player volume always sums back to the
 * pool. When every player in a pool has a zero raw share (all no-history)
 * the pool is split equally.
 *
 * The efficiency leg is UNCHANGED from production (Part 10): projected
 * yards = projected volume × prior efficiency shrunk toward the league
 * mean with a 4-game prior — the same shrinkage the production
 * carries×YPC / targets×YPT formulas use.
 */
import { shrinkTowardLeagueMean } from "../qbPassingBaselines";
import type { NflShareObservation } from "./shareModels";

const EFFICIENCY_SHRINKAGE_PRIOR_GAMES = 4;

export type NflAllocatedPlayer = {
  obs: NflShareObservation;
  rawShare: number;
  normalizedShare: number;
  projectedVolume: number;
  projectedYards: number;
};

export type NflPoolCoherence = {
  poolId: string;
  poolKey: NflShareObservation["poolKey"];
  poolSize: number;
  playerCount: number;
  shareSum: number;
  volumeSum: number;
  volumeResidual: number;
  anyNegativeShare: boolean;
  anyShareOverOne: boolean;
  duplicatePlayerIds: number;
  usedEqualSplit: boolean;
};

export type NflPoolAllocation = {
  poolId: string;
  poolKey: NflShareObservation["poolKey"];
  players: NflAllocatedPlayer[];
  coherence: NflPoolCoherence;
};

/**
 * S5A — protect a strongly-supported dominant player from proportional
 * normalisation compression. When the top player clears every evidence
 * gate, their share is held at (capped) raw share and the remaining pool
 * is normalised among the others. Coherence is still exact. `null` = S4
 * behaviour (pure proportional normalisation).
 */
export type NflDominantAnchorConfig = {
  minPriorGamesPlayed: number;
  minRawShare: number;
  minConcentration: number;
  shareCap: number;
  /** anchor at the player's own unshrunk prior within-pool share instead of the model's (mean-regressed) raw share. */
  usePriorShare?: boolean;
};

/** Allocate one pool. `rawShareOf` maps an observation to its model raw share. */
export function allocatePool(
  poolObservations: readonly NflShareObservation[],
  poolSize: number,
  rawShareOf: (o: NflShareObservation) => number,
  leagueEfficiency: number,
  dominantAnchor: NflDominantAnchorConfig | null = null,
): NflPoolAllocation {
  const first = poolObservations[0];
  const rawShares = poolObservations.map((o) => Math.max(0, rawShareOf(o)));
  const rawSum = rawShares.reduce((s, v) => s + v, 0);
  const usedEqualSplit = rawSum <= 0;
  const n = poolObservations.length || 1;

  // Optional dominant anchor: pick the single eligible top player, if any.
  let anchorIndex = -1;
  let anchorShare = 0;
  if (dominantAnchor && !usedEqualSplit && poolObservations.length >= 2) {
    let best = -1;
    for (let i = 0; i < poolObservations.length; i += 1) {
      const o = poolObservations[i];
      const eligible =
        o.isProjectedStarter &&
        o.priorGamesPlayed >= dominantAnchor.minPriorGamesPlayed &&
        rawShares[i] >= dominantAnchor.minRawShare &&
        (o.concentration ?? 0) >= dominantAnchor.minConcentration;
      if (eligible && (best < 0 || rawShares[i] > rawShares[best])) best = i;
    }
    if (best >= 0) {
      const anchorBasis =
        dominantAnchor.usePriorShare && poolObservations[best].priorShare != null
          ? Math.max(rawShares[best], poolObservations[best].priorShare as number)
          : rawShares[best];
      const candidate = Math.min(anchorBasis, dominantAnchor.shareCap);
      const othersRaw = rawSum - rawShares[best];
      if (candidate < 1 && othersRaw > 0) {
        anchorIndex = best;
        anchorShare = candidate;
      }
    }
  }
  const othersRawSum = anchorIndex >= 0 ? rawSum - rawShares[anchorIndex] : rawSum;

  const players: NflAllocatedPlayer[] = poolObservations.map((obs, i) => {
    const rawShare = rawShares[i];
    let normalizedShare: number;
    if (usedEqualSplit) normalizedShare = 1 / n;
    else if (i === anchorIndex) normalizedShare = anchorShare;
    else if (anchorIndex >= 0) normalizedShare = (1 - anchorShare) * (rawShare / othersRawSum);
    else normalizedShare = rawShare / rawSum;
    const projectedVolume = poolSize * normalizedShare;
    const eff = shrinkTowardLeagueMean(
      obs.priorEfficiency ?? leagueEfficiency,
      obs.priorEfficiency == null ? 0 : obs.priorGamesPlayed,
      leagueEfficiency,
      EFFICIENCY_SHRINKAGE_PRIOR_GAMES,
    );
    return { obs, rawShare, normalizedShare, projectedVolume, projectedYards: projectedVolume * eff };
  });

  const seen = new Set<string>();
  let duplicates = 0;
  for (const p of players) {
    if (seen.has(p.obs.playerId)) duplicates += 1;
    seen.add(p.obs.playerId);
  }
  const shareSum = players.reduce((s, p) => s + p.normalizedShare, 0);
  const volumeSum = players.reduce((s, p) => s + p.projectedVolume, 0);

  return {
    poolId: first?.poolId ?? "",
    poolKey: first?.poolKey ?? "receiving",
    players,
    coherence: {
      poolId: first?.poolId ?? "",
      poolKey: first?.poolKey ?? "receiving",
      poolSize,
      playerCount: players.length,
      shareSum,
      volumeSum,
      volumeResidual: poolSize - volumeSum,
      anyNegativeShare: players.some((p) => p.normalizedShare < 0),
      anyShareOverOne: players.some((p) => p.normalizedShare > 1 + 1e-9),
      duplicatePlayerIds: duplicates,
      usedEqualSplit,
    },
  };
}

// ---------------------------------------------------------------------------
// Normalisation distortion diagnostics
// ---------------------------------------------------------------------------

export type NflRoleCohort =
  | "dominantRb1"
  | "committee1A1B"
  | "lowVolumeBackup"
  | "newTeamStarter"
  | "rookieNoHistory"
  | "other";

export function classifyRoleCohort(o: NflShareObservation): NflRoleCohort {
  if (o.noHistory) return "rookieNoHistory";
  if (o.teamChanged === true && o.isProjectedStarter) return "newTeamStarter";
  if (o.poolKey === "rb" && o.isProjectedStarter && (o.concentration ?? 0) >= 0.7) return "dominantRb1";
  if ((o.depthRankProxy ?? 9) <= 2 && (o.concentration ?? 1) < 0.6) return "committee1A1B";
  if ((o.depthRankProxy ?? 9) >= 3 || (o.priorShare ?? 0) < 0.1) return "lowVolumeBackup";
  return "other";
}

export type NflDistortionSummary = {
  cohort: NflRoleCohort;
  n: number;
  /** mean(normalizedShare − rawShare): + means normalisation systematically inflates this cohort. */
  meanShift: number;
  /** mean(normalizedShare / rawShare) for rawShare > 0. */
  meanRatio: number;
  meanRawShare: number;
  meanNormalizedShare: number;
};

export function measureNormalizationDistortion(allocations: readonly NflPoolAllocation[]): NflDistortionSummary[] {
  const byCohort = new Map<NflRoleCohort, NflAllocatedPlayer[]>();
  for (const a of allocations) {
    for (const p of a.players) {
      const c = classifyRoleCohort(p.obs);
      (byCohort.get(c) ?? byCohort.set(c, []).get(c)!).push(p);
    }
  }
  const out: NflDistortionSummary[] = [];
  for (const [cohort, players] of byCohort) {
    const shifts = players.map((p) => p.normalizedShare - p.rawShare);
    const ratios = players.filter((p) => p.rawShare > 1e-9).map((p) => p.normalizedShare / p.rawShare);
    out.push({
      cohort,
      n: players.length,
      meanShift: mean(shifts),
      meanRatio: mean(ratios),
      meanRawShare: mean(players.map((p) => p.rawShare)),
      meanNormalizedShare: mean(players.map((p) => p.normalizedShare)),
    });
  }
  return out.sort((a, b) => a.cohort.localeCompare(b.cohort));
}

function mean(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : 0;
}
