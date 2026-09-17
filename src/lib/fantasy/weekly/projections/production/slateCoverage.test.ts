import { describe, expect, it } from "vitest";
import { assertFantasySlateCoverage } from "./slateCoverage";

const games = [
  { season: 2026, week: 1, seasonType: "REG", homeAbbr: "hou", awayAbbr: "buf" },
  { season: 2026, week: 2, seasonType: "REG", homeAbbr: "buf", awayAbbr: "det" },
];
describe("fantasy rollover publication coverage", () => {
  it("accepts the complete Week 2 matchup union", () => {
    expect(() => assertFantasySlateCoverage([{ team: "buf", opponent: "det" }, { team: "det", opponent: "buf" }], games, 2026, 2)).not.toThrow();
  });
  it("rejects missing current-roster candidates instead of writing empty projections", () => {
    expect(() => assertFantasySlateCoverage([], games, 2026, 2)).toThrow("coverage is incomplete");
  });
  it("rejects partial or Week 1 matchup coverage", () => {
    expect(() => assertFantasySlateCoverage([{ team: "det", opponent: "buf" }], games, 2026, 2)).toThrow();
    expect(() => assertFantasySlateCoverage([{ team: "buf", opponent: "hou" }, { team: "hou", opponent: "buf" }], games, 2026, 2)).toThrow();
  });
});
