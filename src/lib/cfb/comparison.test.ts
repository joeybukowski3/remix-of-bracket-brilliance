import { describe, expect, it } from "vitest";
import { rankAdvantageEdge } from "./comparison";

describe("rankAdvantageEdge", () => {
  it("away=12, home=null => away (only away has a usable rank)", () => {
    expect(rankAdvantageEdge(12, null)).toBe("away");
  });

  it("away=null, home=12 => home (only home has a usable rank)", () => {
    expect(rankAdvantageEdge(null, 12)).toBe("home");
  });

  it("both null => none", () => {
    expect(rankAdvantageEdge(null, null)).toBe("none");
  });

  it("12 vs 12 => even (equal ranks, no advantage)", () => {
    expect(rankAdvantageEdge(12, 12)).toBe("even");
  });

  it("12 vs 40 => away (lower rank number wins)", () => {
    expect(rankAdvantageEdge(12, 40)).toBe("away");
  });

  it("40 vs 12 => home (lower rank number wins)", () => {
    expect(rankAdvantageEdge(40, 12)).toBe("home");
  });
});
