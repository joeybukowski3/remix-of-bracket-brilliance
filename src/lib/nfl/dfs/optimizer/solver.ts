/**
 * WU8 deterministic exact lineup solver.
 *
 * This is an exact integer optimizer, not a heuristic and not a sampler. It is
 * a multi-group 0/1 knapsack solved by dynamic programming over the salary
 * axis, which is the same feasible set a MILP would search:
 *
 *   maximize   sum of per-player strategy scores
 *   subject to the NFL Classic roster shape, the canonical salary cap, no
 *              duplicate DraftKings ID, no duplicate canonical identity, and
 *              at least the canonical minimum number of distinct games.
 *
 * No solver dependency is installed. A MILP/WASM package was evaluated and
 * rejected: the roster shape has only five position groups and one linear
 * budget, so plain DP is exact here, has no bundle cost, no worker/WASM
 * bootstrap, and is trivially unit-testable against a brute-force oracle.
 *
 * DETERMINISM. Objective and projection values are carried as INTEGER
 * micro-units, so partial sums are exactly associative and no floating-point
 * comparison can reorder equal solutions. Candidates are pre-sorted by
 * DraftKings ID and ties are broken by the documented policy order:
 *   1. higher objective score
 *   2. higher JKB offense projected subtotal
 *   3. lower salary remaining
 *   4. lexicographically smallest sorted DraftKings ID sequence
 *
 * MINIMUM GAMES. The DP is first run unconstrained. If the optimum already
 * spans enough distinct games the constraint was not binding and that optimum
 * is returned. Otherwise the solver runs, for every game g on the slate, a
 * two-class DP that requires at least one player inside g and at least one
 * player outside g, and takes the best. Every multi-game lineup qualifies for
 * at least one such g and every qualifying lineup spans at least two games, so
 * the maximum over g is exactly the best multi-game lineup.
 */

export type SolverPosition = "QB" | "RB" | "WR" | "TE" | "DST";

export type SolverPlayer = {
  dkId: string;
  position: SolverPosition;
  salary: number;
  /** Strategy score in integer micro-units. */
  scoreMicro: number;
  /** JKB projected fantasy points in integer micro-units. Always 0 for DST. */
  jkbMicro: number;
  /** Canonical game identifier used for the minimum-distinct-games rule. */
  gameKey: string;
  /** Canonical player/team identity used to block duplicate real-world entities. */
  identityKey: string;
};

export type SolverRules = {
  salaryCap: number;
  minimumGamesRequired: number;
  counts: { QB: number; RB: number; WR: number; TE: number; DST: number };
  flexPositions: readonly ("RB" | "WR" | "TE")[];
};

export type SolverSolution = {
  players: SolverPlayer[];
  /** Which position filled the FLEX slot. */
  flexPosition: "RB" | "WR" | "TE";
  objectiveMicro: number;
  jkbMicro: number;
  salaryUsed: number;
  distinctGames: number;
};

export type SolverResult =
  | { status: "solved"; solution: SolverSolution; warnings: string[] }
  | { status: "infeasible"; reasons: string[]; warnings: string[] };

const POSITIONS: readonly SolverPosition[] = ["QB", "RB", "WR", "TE", "DST"];

type Cell = { obj: number; jkb: number; players: number[] } | null;
/** [k][mask][salaryBucket] */
type GroupTable = Cell[][][];
/** [mask][salaryBucket] */
type MergeTable = Cell[][];

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function compareIndexLists(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** Strictly-better test under the documented tie-break order (salary is fixed within a cell). */
function isBetter(candidate: NonNullable<Cell>, incumbent: Cell): boolean {
  if (incumbent === null) return true;
  if (candidate.obj !== incumbent.obj) return candidate.obj > incumbent.obj;
  if (candidate.jkb !== incumbent.jkb) return candidate.jkb > incumbent.jkb;
  return compareIndexLists(candidate.players, incumbent.players) < 0;
}

function insertSorted(players: readonly number[], index: number): number[] {
  const next = players.slice();
  let position = next.length;
  while (position > 0 && next[position - 1] > index) position -= 1;
  next.splice(position, 0, index);
  return next;
}

function emptyGroupTable(maxK: number, buckets: number): GroupTable {
  const table: GroupTable = [];
  for (let k = 0; k <= maxK; k += 1) {
    const byMask: Cell[][] = [];
    for (let mask = 0; mask < 4; mask += 1) byMask.push(new Array<Cell>(buckets + 1).fill(null));
    table.push(byMask);
  }
  table[0][0][0] = { obj: 0, jkb: 0, players: [] };
  return table;
}

/**
 * Exact 0/1 knapsack over one position group.
 * `classOf` assigns each player to partition class 0 or 1; the resulting mask
 * records which classes a partial selection already contains.
 */
function buildGroupTable(
  players: readonly SolverPlayer[],
  indexes: readonly number[],
  maxK: number,
  buckets: number,
  unit: number,
  classOf: (index: number) => 0 | 1,
): GroupTable {
  const table = emptyGroupTable(maxK, buckets);
  for (const index of indexes) {
    const player = players[index];
    const bucket = player.salary / unit;
    const bit = 1 << classOf(index);
    for (let k = maxK; k >= 1; k -= 1) {
      for (let mask = 0; mask < 4; mask += 1) {
        const source = table[k - 1][mask];
        const target = table[k][mask | bit];
        for (let s = buckets; s >= bucket; s -= 1) {
          const base = source[s - bucket];
          if (base === null) continue;
          const candidate: NonNullable<Cell> = {
            obj: base.obj + player.scoreMicro,
            jkb: base.jkb + player.jkbMicro,
            players: insertSorted(base.players, index),
          };
          if (isBetter(candidate, target[s])) target[s] = candidate;
        }
      }
    }
  }
  return table;
}

function mergeTables(left: MergeTable, right: MergeTable, buckets: number): MergeTable {
  const result: MergeTable = [];
  for (let mask = 0; mask < 4; mask += 1) result.push(new Array<Cell>(buckets + 1).fill(null));

  const rightFilled: number[][] = [];
  for (let mask = 0; mask < 4; mask += 1) {
    const filled: number[] = [];
    for (let s = 0; s <= buckets; s += 1) if (right[mask][s] !== null) filled.push(s);
    rightFilled.push(filled);
  }

  for (let maskA = 0; maskA < 4; maskA += 1) {
    for (let sA = 0; sA <= buckets; sA += 1) {
      const a = left[maskA][sA];
      if (a === null) continue;
      for (let maskB = 0; maskB < 4; maskB += 1) {
        const target = result[maskA | maskB];
        for (const sB of rightFilled[maskB]) {
          const total = sA + sB;
          if (total > buckets) break;
          const b = right[maskB][sB] as NonNullable<Cell>;
          const incumbent = target[total];
          const obj = a.obj + b.obj;
          const jkb = a.jkb + b.jkb;
          if (incumbent !== null && (obj < incumbent.obj || (obj === incumbent.obj && jkb < incumbent.jkb))) continue;
          const candidate: NonNullable<Cell> = {
            obj,
            jkb,
            players: [...a.players, ...b.players].sort((x, y) => x - y),
          };
          if (isBetter(candidate, incumbent)) target[total] = candidate;
        }
      }
    }
  }
  return result;
}

/** Selects the best cell across salary buckets, applying the salary tie-break. */
function bestOf(table: MergeTable, buckets: number, requiredMask: number): { cell: NonNullable<Cell>; bucket: number } | null {
  let best: { cell: NonNullable<Cell>; bucket: number } | null = null;
  for (let mask = 0; mask < 4; mask += 1) {
    if ((mask & requiredMask) !== requiredMask) continue;
    for (let s = 0; s <= buckets; s += 1) {
      const cell = table[mask][s];
      if (cell === null) continue;
      if (best === null) {
        best = { cell, bucket: s };
        continue;
      }
      if (cell.obj !== best.cell.obj) {
        if (cell.obj > best.cell.obj) best = { cell, bucket: s };
        continue;
      }
      if (cell.jkb !== best.cell.jkb) {
        if (cell.jkb > best.cell.jkb) best = { cell, bucket: s };
        continue;
      }
      // Lower salary remaining wins, i.e. the higher salary bucket.
      if (s !== best.bucket) {
        if (s > best.bucket) best = { cell, bucket: s };
        continue;
      }
      if (compareIndexLists(cell.players, best.cell.players) < 0) best = { cell, bucket: s };
    }
  }
  return best;
}

function betterSolution(candidate: SolverSolution, incumbent: SolverSolution | null): boolean {
  if (incumbent === null) return true;
  if (candidate.objectiveMicro !== incumbent.objectiveMicro) return candidate.objectiveMicro > incumbent.objectiveMicro;
  if (candidate.jkbMicro !== incumbent.jkbMicro) return candidate.jkbMicro > incumbent.jkbMicro;
  if (candidate.salaryUsed !== incumbent.salaryUsed) return candidate.salaryUsed > incumbent.salaryUsed;
  const a = candidate.players.map((player) => player.dkId).sort();
  const b = incumbent.players.map((player) => player.dkId).sort();
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

type SolveOnceInput = {
  players: readonly SolverPlayer[];
  byPosition: Record<SolverPosition, number[]>;
  rules: SolverRules;
  buckets: number;
  unit: number;
  classOf: (index: number) => 0 | 1;
  requiredMask: number;
};

function solveOnce(input: SolveOnceInput): SolverSolution | null {
  const { players, byPosition, rules, buckets, unit, classOf, requiredMask } = input;

  const maxK: Record<SolverPosition, number> = {
    QB: rules.counts.QB,
    RB: rules.counts.RB + (rules.flexPositions.includes("RB") ? 1 : 0),
    WR: rules.counts.WR + (rules.flexPositions.includes("WR") ? 1 : 0),
    TE: rules.counts.TE + (rules.flexPositions.includes("TE") ? 1 : 0),
    DST: rules.counts.DST,
  };

  const tables = Object.fromEntries(
    POSITIONS.map((position) => [
      position,
      buildGroupTable(players, byPosition[position], maxK[position], buckets, unit, classOf),
    ]),
  ) as Record<SolverPosition, GroupTable>;

  let best: SolverSolution | null = null;

  for (const flex of rules.flexPositions) {
    const need: Record<SolverPosition, number> = {
      QB: rules.counts.QB,
      RB: rules.counts.RB + (flex === "RB" ? 1 : 0),
      WR: rules.counts.WR + (flex === "WR" ? 1 : 0),
      TE: rules.counts.TE + (flex === "TE" ? 1 : 0),
      DST: rules.counts.DST,
    };

    let merged: MergeTable | null = null;
    let feasible = true;
    for (const position of POSITIONS) {
      const slice = tables[position][need[position]];
      if (!slice.some((row) => row.some((cell) => cell !== null))) {
        feasible = false;
        break;
      }
      merged = merged === null ? slice.map((row) => row.slice()) : mergeTables(merged, slice, buckets);
    }
    if (!feasible || merged === null) continue;

    const winner = bestOf(merged, buckets, requiredMask);
    if (winner === null) continue;

    const chosen = winner.cell.players.map((index) => players[index]);
    const candidate: SolverSolution = {
      players: chosen,
      flexPosition: flex,
      objectiveMicro: winner.cell.obj,
      jkbMicro: winner.cell.jkb,
      salaryUsed: winner.bucket * unit,
      distinctGames: new Set(chosen.map((player) => player.gameKey)).size,
    };
    if (betterSolution(candidate, best)) best = candidate;
  }

  return best;
}

/**
 * Solves one strategy exactly. `players` must already be restricted to legal
 * candidates: optimizer-eligible offense with a strategy score, and DST with
 * usable WU6C matchup context.
 */
export function solveLineup(players: readonly SolverPlayer[], rules: SolverRules): SolverResult {
  const warnings: string[] = [];
  const reasons: string[] = [];

  // Deterministic candidate order: DraftKings ID ascending.
  const ordered = [...players].sort((a, b) => (a.dkId < b.dkId ? -1 : a.dkId > b.dkId ? 1 : 0));

  // Defence in depth: a canonical identity claimed by more than one uploaded
  // row is dropped entirely rather than silently picked between.
  const identityCounts = new Map<string, number>();
  ordered.forEach((player) => identityCounts.set(player.identityKey, (identityCounts.get(player.identityKey) ?? 0) + 1));
  const usable = ordered.filter((player) => (identityCounts.get(player.identityKey) ?? 0) === 1);
  if (usable.length !== ordered.length) {
    warnings.push(
      "Dropped " + (ordered.length - usable.length) + " candidate(s) sharing a canonical identity with another uploaded row",
    );
  }

  const byPosition = Object.fromEntries(POSITIONS.map((position) => [position, [] as number[]])) as Record<
    SolverPosition,
    number[]
  >;
  usable.forEach((player, index) => byPosition[player.position].push(index));

  const required: Record<SolverPosition, number> = {
    QB: rules.counts.QB,
    RB: rules.counts.RB,
    WR: rules.counts.WR,
    TE: rules.counts.TE,
    DST: rules.counts.DST,
  };
  for (const position of POSITIONS) {
    if (byPosition[position].length < required[position]) {
      reasons.push(
        "Only " + byPosition[position].length + " eligible " + position + " candidate(s); " + required[position] + " required",
      );
    }
  }
  if (reasons.length > 0) return { status: "infeasible", reasons, warnings };

  const unit = Math.max(1, usable.reduce((current, player) => gcd(current, player.salary), rules.salaryCap));
  const buckets = Math.floor(rules.salaryCap / unit);

  const noPartition = () => 0 as const;
  const unconstrained = solveOnce({
    players: usable,
    byPosition,
    rules,
    buckets,
    unit,
    classOf: noPartition,
    requiredMask: 0,
  });

  if (unconstrained === null) {
    return {
      status: "infeasible",
      reasons: ["No roster satisfies the $" + rules.salaryCap.toLocaleString("en-US") + " salary cap with the eligible candidate pool"],
      warnings,
    };
  }

  if (unconstrained.distinctGames >= rules.minimumGamesRequired) {
    return { status: "solved", solution: unconstrained, warnings };
  }

  // The minimum-games rule is binding. Solve it exactly, partition by game.
  const games = [...new Set(usable.map((player) => player.gameKey))].sort();
  let best: SolverSolution | null = null;
  for (const game of games) {
    const classOf = (index: number) => (usable[index].gameKey === game ? 0 : 1) as 0 | 1;
    const solution = solveOnce({ players: usable, byPosition, rules, buckets, unit, classOf, requiredMask: 3 });
    if (solution !== null && solution.distinctGames >= rules.minimumGamesRequired && betterSolution(solution, best)) {
      best = solution;
    }
  }

  if (best === null) {
    return {
      status: "infeasible",
      reasons: [
        "No roster under the salary cap draws from at least " + rules.minimumGamesRequired + " different NFL games",
      ],
      warnings,
    };
  }

  warnings.push("The minimum-distinct-games rule was binding; the reported lineup is the best lineup that satisfies it");
  return { status: "solved", solution: best, warnings };
}
