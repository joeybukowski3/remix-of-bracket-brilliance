import { describe, expect, it } from "vitest";
import { solveLinearSystem } from "./linearSolver";
import { solveLinearSystem as researchSolveLinearSystem } from "../../research/phase2/linearSolver";

describe("solveLinearSystem", () => {
  it("solves a simple 2x2 system exactly", () => {
    // 2x + y = 5; x + 3y = 10 -> x=1, y=3
    const x = solveLinearSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    );
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it("matches the research implementation on random systems (parity, test-only import)", () => {
    function randomSystem(n: number, seed: number) {
      let s = seed;
      const rand = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s / 0x7fffffff) * 2 - 1;
      };
      const matrix = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 10 + rand() : rand())),
      );
      const vector = Array.from({ length: n }, () => rand() * 5);
      return { matrix, vector };
    }

    for (const [n, seed] of [
      [3, 1],
      [5, 42],
      [8, 7],
    ] as const) {
      const { matrix, vector } = randomSystem(n, seed);
      const production = solveLinearSystem(matrix, vector);
      const research = researchSolveLinearSystem(matrix, vector);
      for (let i = 0; i < n; i += 1) expect(production[i]).toBeCloseTo(research[i], 10);
    }
  });
});
