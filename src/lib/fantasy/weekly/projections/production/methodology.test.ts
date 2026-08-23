import { describe, expect, it } from "vitest";
import {
  PRODUCTION_METHODOLOGY_POSITION_MATRIX,
  assertMethodologyMatchesFrozenSpec,
} from "./methodology";

describe("production methodology matrix", () => {
  it("matches the frozen v1 spec for every position", () => {
    expect(() => assertMethodologyMatchesFrozenSpec()).not.toThrow();
  });

  it("declares QB as baseline-only with no usage or team-context adjustment", () => {
    const qb = PRODUCTION_METHODOLOGY_POSITION_MATRIX.find((row) => row.position === "QB")!;
    expect(qb.baseline).toBe(true);
    expect(qb.usage).toBe(false);
    expect(qb.teamContext).toBe(false);
  });

  it("declares RB as the only position with team context active", () => {
    for (const row of PRODUCTION_METHODOLOGY_POSITION_MATRIX) {
      expect(row.teamContext).toBe(row.position === "RB");
    }
  });

  it("declares RB/WR/TE usage active", () => {
    for (const position of ["RB", "WR", "TE"] as const) {
      const row = PRODUCTION_METHODOLOGY_POSITION_MATRIX.find((r) => r.position === position)!;
      expect(row.usage).toBe(true);
    }
  });

  it("never mentions rejected V2 factors in any summary text", () => {
    const allText = PRODUCTION_METHODOLOGY_POSITION_MATRIX.map((row) => row.summary).join(" ").toLowerCase();
    expect(allText).not.toMatch(/implied team total|opponent-adjusted defense|betting market|injury/);
  });

  it("declares scoring-environment and opponent-FPA context active for every position, including QB", () => {
    for (const row of PRODUCTION_METHODOLOGY_POSITION_MATRIX) {
      expect(row.impliedTotal).toBe(true);
      expect(row.opponentFpa).toBe(true);
    }
  });
});
