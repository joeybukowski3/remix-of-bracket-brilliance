// CFB Model V2 — production empirical-residual-bootstrap probability +
// interval generation (WU3 §13-§16). Zero runtime dependency on
// src/lib/cfb/research/**.
//
// PRNG: a literal port of research/phase5/normalMath.ts's `createSeededRandom`
// (mulberry32) — generic, dependency-free numerical code, duplicated here
// rather than imported at runtime (same pattern as linearSolver.ts).
//
// SEEDING DIVERGENCE FROM PHASE 9 (documented, not implicit — required by
// §2/§26): research/phase5/phase5WalkForwardCore.ts creates ONE
// `createSeededRandom(config.simulationSeed)` stream ONCE, before its
// walk-forward loop, and advances it continuously across EVERY game in
// chronological order — so game N's 20,000 draws depend on how many draws
// every earlier game in the SAME run already consumed. That contract is
// incompatible with a production API that must be able to project one game
// (or an arbitrary subset of a week) in isolation and get the same result
// regardless of what else is in the batch (§18 as-of semantics implies
// per-game determinism, not run-order-dependent determinism). Production
// therefore seeds each game's bootstrap independently and deterministically
// from (CFB_V2_PROBABILITY_CONFIG.seed, gameId) via FNV-1a — NOT from
// Phase 9's shared advancing stream. This is a versioned production choice
// (see buildGameProjections.ts's probabilityVersion), proven statistically
// (not bit-for-bit) equivalent to Phase 9 by phase9ProbabilityParity.test.ts.

import type { CfbV2ResidualPair } from "./residualPool";

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic mulberry32 PRNG — literal port of research/phase5/normalMath.ts's createSeededRandom. */
export function createCfbV2SeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derives one game's independent seed from the base production seed + gameId (see file header). */
export function deriveCfbV2GameSeed(baseSeed: number, gameId: string): number {
  return (Math.imul(baseSeed >>> 0, 0x01000193) ^ fnv1a32(gameId)) >>> 0;
}

export type CfbV2ProbabilityIntervals = {
  margin: { p50: [number, number]; p80: [number, number]; p90: [number, number]; p95: [number, number] };
  total: { p50: [number, number]; p80: [number, number]; p90: [number, number]; p95: [number, number] };
};

export type CfbV2BootstrapResult = {
  homeWinProbability: number;
  awayWinProbability: number;
  intervals: CfbV2ProbabilityIntervals;
};

function empiricalInterval(sorted: readonly number[], level: number): [number, number] {
  const tail = (1 - level) / 2;
  const lowIdx = Math.floor(tail * (sorted.length - 1));
  const highIdx = Math.ceil((1 - tail) * (sorted.length - 1));
  return [sorted[lowIdx], sorted[highIdx]];
}

/**
 * Empirical residual bootstrap for one game — literal port of
 * research/phase5/distributionModels.ts's `empiricalBootstrapFamily`
 * resampling loop (tie handling: `home > away` counts as a home win only;
 * a tie or an away lead counts toward pAwayWin = 1 - pHomeWin, matching
 * phase5WalkForwardCore.ts's `pAwayWin: 1 - distribution.pHomeWin` exactly
 * — no separate away-win counter).
 */
export function runCfbV2EmpiricalBootstrap(expectedHome: number, expectedAway: number, residualPool: readonly CfbV2ResidualPair[], random: () => number, drawCount: number): CfbV2BootstrapResult {
  const marginSamples: number[] = [];
  const totalSamples: number[] = [];
  let homeWins = 0;
  for (let i = 0; i < drawCount; i += 1) {
    const idx = Math.floor(random() * residualPool.length);
    const pair = residualPool[idx];
    const home = expectedHome + pair.home;
    const away = expectedAway + pair.away;
    marginSamples.push(home - away);
    totalSamples.push(home + away);
    if (home > away) homeWins += 1;
  }
  marginSamples.sort((a, b) => a - b);
  totalSamples.sort((a, b) => a - b);

  const homeWinProbability = homeWins / drawCount;
  return {
    homeWinProbability,
    awayWinProbability: 1 - homeWinProbability,
    intervals: {
      margin: {
        p50: empiricalInterval(marginSamples, 0.5),
        p80: empiricalInterval(marginSamples, 0.8),
        p90: empiricalInterval(marginSamples, 0.9),
        p95: empiricalInterval(marginSamples, 0.95),
      },
      total: {
        p50: empiricalInterval(totalSamples, 0.5),
        p80: empiricalInterval(totalSamples, 0.8),
        p90: empiricalInterval(totalSamples, 0.9),
        p95: empiricalInterval(totalSamples, 0.95),
      },
    },
  };
}
