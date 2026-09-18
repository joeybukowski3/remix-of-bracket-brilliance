import { describe, expect, it } from "vitest";
import { computeEdge } from "./edge";

describe("computeEdge", () => {
  it("returns null when the FOR rank is missing", () => {
    expect(computeEdge(null, 20)).toBeNull();
  });

  it("returns null when the ALLOWED rank is missing", () => {
    expect(computeEdge(20, null)).toBeNull();
  });

  it("is 0 for a perfectly average offense vs. an average defense", () => {
    expect(computeEdge(16, 17)).toBe(0);
    expect(computeEdge(17, 16)).toBe(0);
  });

  it("is maximally positive for a top offense vs. the most generous defense", () => {
    expect(computeEdge(32, 32)).toBe(31);
  });

  it("is maximally negative for the worst offense vs. the stingiest defense", () => {
    expect(computeEdge(1, 1)).toBe(-31);
  });

  it("is positive when a strong offense faces a generous defense", () => {
    expect(computeEdge(28, 25)).toBe(20);
  });

  it("is negative when a weak offense faces a stingy defense", () => {
    expect(computeEdge(4, 6)).toBe(-23);
  });
});
