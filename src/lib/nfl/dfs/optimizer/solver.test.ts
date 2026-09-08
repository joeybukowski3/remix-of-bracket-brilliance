import { describe, expect, it } from "vitest";
import { solveLineup, type SolverPlayer, type SolverPosition, type SolverRules } from "./solver";

const RULES: SolverRules = {
  salaryCap: 50_000,
  minimumGamesRequired: 2,
  counts: { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1 },
  flexPositions: ["RB", "WR", "TE"],
};

let sequence = 0;
function player(overrides: Partial<SolverPlayer> & { position: SolverPosition }): SolverPlayer {
  sequence += 1;
  const dkId = overrides.dkId ?? `dk-${String(sequence).padStart(4, "0")}`;
  return {
    dkId,
    position: overrides.position,
    salary: overrides.salary ?? 5_000,
    scoreMicro: overrides.scoreMicro ?? 50_000_000,
    jkbMicro: overrides.jkbMicro ?? 10_000_000,
    gameKey: overrides.gameKey ?? "game-a",
    identityKey: overrides.identityKey ?? `id-${dkId}`,
  };
}

/** Builds a legal-by-construction pool with distinct scores and two games. */
function buildPool(options: { baseSalary?: number } = {}): SolverPlayer[] {
  const shape: [SolverPosition, number][] = [
    ["QB", 3],
    ["RB", 5],
    ["WR", 6],
    ["TE", 4],
    ["DST", 3],
  ];
  const pool: SolverPlayer[] = [];
  let score = 90_000_000;
  shape.forEach(([position, count]) => {
    for (let i = 0; i < count; i += 1) {
      score -= 1_300_000;
      pool.push(
        player({
          position,
          salary: (options.baseSalary ?? 4_000) + i * 700,
          scoreMicro: score,
          jkbMicro: score / 5,
          gameKey: i % 2 === 0 ? "game-a" : "game-b",
        }),
      );
    }
  });
  return pool;
}

/** Exhaustive oracle: enumerates every legal roster and returns the best under the same tie-break policy. */
function bruteForce(pool: readonly SolverPlayer[], rules: SolverRules) {
  const byPosition = (position: SolverPosition) => pool.filter((entry) => entry.position === position);

  function combinations(items: readonly SolverPlayer[], k: number): SolverPlayer[][] {
    if (k === 0) return [[]];
    if (items.length < k) return [];
    const [head, ...rest] = items;
    return [...combinations(rest, k - 1).map((combo) => [head, ...combo]), ...combinations(rest, k)];
  }

  let best: { players: SolverPlayer[]; obj: number; jkb: number; salary: number } | null = null;

  for (const flex of rules.flexPositions) {
    const need = {
      QB: rules.counts.QB,
      RB: rules.counts.RB + (flex === "RB" ? 1 : 0),
      WR: rules.counts.WR + (flex === "WR" ? 1 : 0),
      TE: rules.counts.TE + (flex === "TE" ? 1 : 0),
      DST: rules.counts.DST,
    };
    for (const qb of combinations(byPosition("QB"), need.QB)) {
      for (const rb of combinations(byPosition("RB"), need.RB)) {
        for (const wr of combinations(byPosition("WR"), need.WR)) {
          for (const te of combinations(byPosition("TE"), need.TE)) {
            for (const dst of combinations(byPosition("DST"), need.DST)) {
              const players = [...qb, ...rb, ...wr, ...te, ...dst];
              const salary = players.reduce((sum, entry) => sum + entry.salary, 0);
              if (salary > rules.salaryCap) continue;
              if (new Set(players.map((entry) => entry.gameKey)).size < rules.minimumGamesRequired) continue;
              if (new Set(players.map((entry) => entry.identityKey)).size !== players.length) continue;
              const obj = players.reduce((sum, entry) => sum + entry.scoreMicro, 0);
              const jkb = players.reduce((sum, entry) => sum + entry.jkbMicro, 0);
              const candidate = { players, obj, jkb, salary };
              if (best === null) {
                best = candidate;
                continue;
              }
              if (obj !== best.obj) {
                if (obj > best.obj) best = candidate;
                continue;
              }
              if (jkb !== best.jkb) {
                if (jkb > best.jkb) best = candidate;
                continue;
              }
              if (salary !== best.salary) {
                if (salary > best.salary) best = candidate;
                continue;
              }
              const a = players.map((entry) => entry.dkId).sort().join(",");
              const b = best.players.map((entry) => entry.dkId).sort().join(",");
              if (a < b) best = candidate;
            }
          }
        }
      }
    }
  }
  return best;
}

function ids(players: readonly SolverPlayer[]): string[] {
  return players.map((entry) => entry.dkId).sort();
}

describe("solveLineup", () => {
  it("returns exactly the DraftKings NFL Classic roster shape", () => {
    const result = solveLineup(buildPool(), RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;

    const counts = result.solution.players.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.position] = (acc[entry.position] ?? 0) + 1;
      return acc;
    }, {});
    expect(result.solution.players).toHaveLength(9);
    expect(counts.QB).toBe(1);
    expect(counts.DST).toBe(1);
    expect(counts.RB).toBeGreaterThanOrEqual(2);
    expect(counts.WR).toBeGreaterThanOrEqual(3);
    expect(counts.TE).toBeGreaterThanOrEqual(1);
    expect(counts.RB + counts.WR + counts.TE).toBe(7);
  });

  it("never exceeds the canonical salary cap", () => {
    const pool = buildPool({ baseSalary: 4_300 });
    const result = solveLineup(pool, RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    expect(result.solution.salaryUsed).toBeLessThanOrEqual(RULES.salaryCap);
    expect(result.solution.players.reduce((sum, entry) => sum + entry.salary, 0)).toBe(result.solution.salaryUsed);
  });

  it("never repeats a DraftKings ID or a canonical identity", () => {
    const result = solveLineup(buildPool(), RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    expect(new Set(result.solution.players.map((entry) => entry.dkId)).size).toBe(9);
    expect(new Set(result.solution.players.map((entry) => entry.identityKey)).size).toBe(9);
  });

  it("drops candidates that share a canonical identity with another uploaded row", () => {
    const pool = buildPool();
    const twin = { ...pool[3], dkId: "dk-duplicate", identityKey: pool[3].identityKey };
    const result = solveLineup([...pool, twin], RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    expect(result.warnings.join(" ")).toMatch(/canonical identity/);
    expect(result.solution.players.map((entry) => entry.dkId)).not.toContain("dk-duplicate");
    expect(result.solution.players.map((entry) => entry.dkId)).not.toContain(pool[3].dkId);
  });

  it("fills the FLEX slot only from RB, WR or TE", () => {
    const result = solveLineup(buildPool(), RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    expect(RULES.flexPositions).toContain(result.solution.flexPosition);
  });

  it("enforces the minimum distinct games rule even when the best roster is single-game", () => {
    // Every game-a player is strictly better, so the unconstrained optimum is single-game.
    const pool: SolverPlayer[] = [];
    const shape: [SolverPosition, number][] = [["QB", 2], ["RB", 4], ["WR", 5], ["TE", 3], ["DST", 2]];
    shape.forEach(([position, count]) => {
      for (let i = 0; i < count; i += 1) {
        pool.push(player({ position, salary: 4_000, scoreMicro: 90_000_000 - i * 1_000_000, gameKey: "game-a" }));
      }
      pool.push(player({ position, salary: 4_000, scoreMicro: 10_000_000, gameKey: "game-b" }));
    });

    const result = solveLineup(pool, RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    expect(result.solution.distinctGames).toBeGreaterThanOrEqual(2);
    expect(result.warnings.join(" ")).toMatch(/minimum-distinct-games/);
    expect(result.solution.players).toEqual(bruteForce(pool, RULES)?.players.sort((a, b) => (a.dkId < b.dkId ? -1 : 1)) ?? []);
  });

  it("reports infeasible with reasons when a position pool is too thin", () => {
    const pool = buildPool().filter((entry) => entry.position !== "TE");
    const result = solveLineup(pool, RULES);
    expect(result.status).toBe("infeasible");
    if (result.status !== "infeasible") return;
    expect(result.reasons.join(" ")).toMatch(/eligible TE candidate/);
  });

  it("reports infeasible with reasons when no roster fits under the salary cap", () => {
    const result = solveLineup(buildPool({ baseSalary: 9_000 }), RULES);
    expect(result.status).toBe("infeasible");
    if (result.status !== "infeasible") return;
    expect(result.reasons.join(" ")).toMatch(/salary cap/);
  });

  it("reports infeasible when the slate has only one game", () => {
    const pool = buildPool().map((entry) => ({ ...entry, gameKey: "game-a" }));
    const result = solveLineup(pool, RULES);
    expect(result.status).toBe("infeasible");
    if (result.status !== "infeasible") return;
    expect(result.reasons.join(" ")).toMatch(/different NFL games/);
  });

  it("produces byte-identical output for the same input", () => {
    const pool = buildPool();
    const first = solveLineup(pool, RULES);
    const second = solveLineup([...pool].reverse(), RULES);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  /**
   * Exactly-nine fixture: one spare TE means the FLEX slot has exactly two
   * interchangeable candidates, so the tie-break policy alone decides.
   */
  function tieFixture(extras: [Partial<SolverPlayer>, Partial<SolverPlayer>]): SolverPlayer[] {
    const shape: [SolverPosition, number][] = [["QB", 1], ["RB", 2], ["WR", 3], ["TE", 1], ["DST", 1]];
    const pool: SolverPlayer[] = [];
    shape.forEach(([position, count]) => {
      for (let i = 0; i < count; i += 1) {
        pool.push(player({ position, salary: 4_000, scoreMicro: 95_000_000, gameKey: i % 2 === 0 ? "game-a" : "game-b" }));
      }
    });
    extras.forEach((extra) => pool.push(player({ position: "TE", salary: 4_000, gameKey: "game-b", ...extra })));
    return pool;
  }

  it("breaks an objective tie on the higher JKB projection subtotal", () => {
    const pool = tieFixture([
      { dkId: "dk-te-lowjkb", scoreMicro: 80_000_000, jkbMicro: 5_000_000 },
      { dkId: "dk-te-highjkb", scoreMicro: 80_000_000, jkbMicro: 9_000_000 },
    ]);
    const result = solveLineup(pool, RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    const picked = result.solution.players.map((entry) => entry.dkId);
    expect(picked).toContain("dk-te-highjkb");
    expect(picked).not.toContain("dk-te-lowjkb");
  });

  it("prefers the lexicographically smallest DraftKings ID sequence on a total tie", () => {
    const pool = tieFixture([
      { dkId: "dk-te-zz", scoreMicro: 80_000_000, jkbMicro: 7_000_000 },
      { dkId: "dk-te-aa", scoreMicro: 80_000_000, jkbMicro: 7_000_000 },
    ]);
    const result = solveLineup(pool, RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    const picked = result.solution.players.map((entry) => entry.dkId);
    expect(picked).toContain("dk-te-aa");
    expect(picked).not.toContain("dk-te-zz");
  });

  it("spends more salary when the objective and JKB subtotal are otherwise tied", () => {
    const pool = tieFixture([
      { dkId: "dk-te-cheap", salary: 3_000, scoreMicro: 80_000_000, jkbMicro: 7_000_000 },
      { dkId: "dk-te-rich", salary: 4_800, scoreMicro: 80_000_000, jkbMicro: 7_000_000 },
    ]);
    const result = solveLineup(pool, RULES);
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    const picked = result.solution.players.map((entry) => entry.dkId);
    expect(picked).toContain("dk-te-rich");
    expect(picked).not.toContain("dk-te-cheap");
  });

  it.each([
    ["loose cap", { baseSalary: undefined }],
    ["tight cap", { baseSalary: 4_300 }],
  ])("matches an exhaustive brute-force oracle (%s)", (_label, options) => {
    const pool = buildPool(options as { baseSalary?: number });
    const result = solveLineup(pool, RULES);
    const oracle = bruteForce(pool, RULES);
    expect(oracle).not.toBeNull();
    expect(result.status).toBe("solved");
    if (result.status !== "solved" || oracle === null) return;
    expect(result.solution.objectiveMicro).toBe(oracle.obj);
    expect(result.solution.salaryUsed).toBe(oracle.salary);
    expect(ids(result.solution.players)).toEqual(ids(oracle.players));
  });

  it("matches the oracle across randomized small slates", () => {
    // Deterministic linear-congruential generator: the fixtures are reproducible.
    let seed = 20260907;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 12; trial += 1) {
      const pool: SolverPlayer[] = [];
      const shape: [SolverPosition, number][] = [["QB", 3], ["RB", 4], ["WR", 5], ["TE", 3], ["DST", 3]];
      shape.forEach(([position, count]) => {
        for (let i = 0; i < count; i += 1) {
          pool.push(
            player({
              position,
              salary: 3_000 + Math.floor(next() * 40) * 100,
              scoreMicro: Math.floor(next() * 100_000_000),
              jkbMicro: Math.floor(next() * 25_000_000),
              gameKey: next() < 0.5 ? "game-a" : "game-b",
            }),
          );
        }
      });

      const result = solveLineup(pool, RULES);
      const oracle = bruteForce(pool, RULES);
      if (oracle === null) {
        expect(result.status).toBe("infeasible");
        continue;
      }
      expect(result.status).toBe("solved");
      if (result.status !== "solved") return;
      expect(result.solution.objectiveMicro).toBe(oracle.obj);
      expect(ids(result.solution.players)).toEqual(ids(oracle.players));
    }
  });
});
