/**
 * TEST SUPPORT ONLY (imported by *.test.ts): builds internally consistent
 * per-game leagues for the Performance Rating engine.
 *
 * "Consistent" is load-bearing for leave-one-out: in a real game, team A's
 * offense IS team B's defense-allowed. Every game here writes both teams'
 * evidence from the same two offensive play-sum buckets, so an opponent's
 * season totals genuinely contain the game being excluded.
 */
import {
  deriveTeamPerformanceMetrics,
  type PerformancePlaySums,
  type TeamPerformanceWindowInput,
} from "@/lib/nfl/performanceMetricsCore2026";
import type { TeamPerformanceGameEvidence, TeamPerformanceSeasonEntry } from "@/lib/nfl/performanceComposite2026";

export const PLAYS = 100;

export type Rates = { epaPlay: number; sr: number; explosiveRate: number };

/** One offensive play-sum bucket at a fixed play count (rates on a 1% grid so counts are exact integers). */
export function sums(rates: Rates): PerformancePlaySums {
  const { epaPlay, sr, explosiveRate } = rates;
  const explosiveTotal = Math.round(explosiveRate * PLAYS);
  return {
    offEpa: epaPlay * PLAYS,
    offPlays: PLAYS,
    successNum: Math.round(sr * PLAYS),
    successDen: PLAYS,
    epaPosNum: Math.round(0.45 * PLAYS),
    epaPosDen: PLAYS,
    earlyEpa: epaPlay * 60,
    earlyPlays: 60,
    earlySuccessNum: Math.round(sr * 60),
    earlySuccessDen: 60,
    passEpa: epaPlay * 60,
    passPlays: 60,
    passSuccessNum: Math.round(sr * 60),
    passSuccessDen: 60,
    rushEpa: epaPlay * 40,
    rushPlays: 40,
    rushSuccessNum: Math.round(sr * 40),
    rushSuccessDen: 40,
    explosivePass: Math.round(explosiveTotal * 0.6),
    explosiveRush: explosiveTotal - Math.round(explosiveTotal * 0.6),
    thirdEpa: epaPlay * 15,
    thirdPlays: 15,
    thirdSuccessNum: Math.round(sr * 15),
    thirdSuccessDen: 15,
    thirdRawConvNum: Math.round(sr * 15),
    thirdRawConvDen: 15,
    sacks: 3,
    dropbacks: 60,
  };
}

export function addSums(a: PerformancePlaySums, b: PerformancePlaySums): PerformancePlaySums {
  const out = { ...a };
  for (const key of Object.keys(b) as (keyof PerformancePlaySums)[]) out[key] = a[key] + b[key];
  return out;
}

const ZERO_SUMS: PerformancePlaySums = sums({ epaPlay: 0, sr: 0, explosiveRate: 0 }); // shape template only
export const emptySums = (): PerformancePlaySums => {
  const out = { ...ZERO_SUMS };
  for (const key of Object.keys(out) as (keyof PerformancePlaySums)[]) out[key] = 0;
  return out;
};

/** One game. `aOff`/`bOff` are the garbage-time-FILTERED offensive rates; `*OffAll` default to the same. */
export type GameSpec = {
  a: string;
  b: string;
  aOff: Rates;
  bOff: Rates;
  aOffAll?: Rates;
  bOffAll?: Rates;
  /** Team a's final margin (b's is the negative). */
  aMargin: number;
  /** Drives-only diagnostics; never part of the rating. */
  aPointsPerDrive?: number;
};

export function windowInputFrom(team: string, games: readonly TeamPerformanceGameEvidence[], pointsPerDrive = 2): TeamPerformanceWindowInput {
  const offAll = emptySums();
  const offFiltered = emptySums();
  const defAll = emptySums();
  const defFiltered = emptySums();
  let offAllAcc = offAll, offFilteredAcc = offFiltered, defAllAcc = defAll, defFilteredAcc = defFiltered;
  for (const g of games) {
    offAllAcc = addSums(offAllAcc, g.offense.all);
    offFilteredAcc = addSums(offFilteredAcc, g.offense.filtered);
    defAllAcc = addSums(defAllAcc, g.defenseAllowed.all);
    defFilteredAcc = addSums(defFilteredAcc, g.defenseAllowed.filtered);
  }
  return {
    team,
    gamesPlayed: games.length,
    offense: { all: offAllAcc, filtered: offFilteredAcc },
    defenseAllowed: { all: defAllAcc, filtered: defFilteredAcc },
    driveOff: { drives: 11 * games.length, points: pointsPerDrive * 11 * games.length },
    driveDefAllowed: { drives: 11 * games.length, points: 2 * 11 * games.length },
  };
}

/** Build season entries (per-team games + the season metrics aggregated from them) from a list of games. */
export function entriesFromGames(games: readonly GameSpec[]): TeamPerformanceSeasonEntry[] {
  const byTeam = new Map<string, TeamPerformanceGameEvidence[]>();
  const drives = new Map<string, number>();
  const push = (team: string, evidence: TeamPerformanceGameEvidence) => {
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team)!.push(evidence);
  };
  for (const game of games) {
    const aFiltered = sums(game.aOff);
    const bFiltered = sums(game.bOff);
    const aAll = sums(game.aOffAll ?? game.aOff);
    const bAll = sums(game.bOffAll ?? game.bOff);
    push(game.a, { opponent: game.b, margin: game.aMargin, offense: { all: aAll, filtered: aFiltered }, defenseAllowed: { all: bAll, filtered: bFiltered } });
    push(game.b, { opponent: game.a, margin: -game.aMargin, offense: { all: bAll, filtered: bFiltered }, defenseAllowed: { all: aAll, filtered: aFiltered } });
    if (game.aPointsPerDrive !== undefined) drives.set(game.a, game.aPointsPerDrive);
  }
  return [...byTeam.entries()].map(([team, evidence]) => ({
    team,
    games: evidence,
    metrics: deriveTeamPerformanceMetrics(windowInputFrom(team, evidence, drives.get(team) ?? 2)),
  }));
}

/** Additive offence/defence quality: `off` raises the team's own rates, `def` raises what its defence ALLOWS (positive = leakier). */
export type Quality = { off: Rates; def: Rates; pd: number };
export const NEUTRAL_QUALITY: Quality = { off: { epaPlay: 0, sr: 0, explosiveRate: 0 }, def: { epaPlay: 0, sr: 0, explosiveRate: 0 }, pd: 0 };
export const BASE_RATES: Rates = { epaPlay: 0.02, sr: 0.42, explosiveRate: 0.09 };

const rateFor = (base: Rates, offTeam: Quality, defTeam: Quality): Rates => ({
  epaPlay: base.epaPlay + offTeam.off.epaPlay + defTeam.def.epaPlay,
  sr: base.sr + offTeam.off.sr + defTeam.def.sr,
  explosiveRate: base.explosiveRate + offTeam.off.explosiveRate + defTeam.def.explosiveRate,
});

/** Every pair plays `rounds` times (rounds=1: round robin). */
export function roundRobin(teams: readonly string[], quality: Readonly<Record<string, Quality>>, base: Rates = BASE_RATES, rounds = 1): GameSpec[] {
  const games: GameSpec[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        const a = teams[i];
        const b = teams[j];
        const qa = quality[a] ?? NEUTRAL_QUALITY;
        const qb = quality[b] ?? NEUTRAL_QUALITY;
        games.push({ a, b, aOff: rateFor(base, qa, qb), bOff: rateFor(base, qb, qa), aMargin: qa.pd - qb.pd });
      }
    }
  }
  return games;
}

export function rowOf<T extends { rows: { team: string }[] }>(board: T, team: string): T["rows"][number] {
  const found = board.rows.find((r) => r.team === team);
  if (!found) throw new Error(`missing row for ${team}`);
  return found;
}
