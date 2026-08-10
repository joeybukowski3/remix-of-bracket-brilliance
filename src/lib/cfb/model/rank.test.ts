import { describe, expect, it } from "vitest";
import { generateRanks } from "./rank";

describe("generateRanks", () => {
  it("assigns rank 1 to the highest value by default (desc)", () => {
    const ranks = generateRanks([
      { teamId: "a", value: 50 },
      { teamId: "b", value: 90 },
      { teamId: "c", value: 70 },
    ]);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("a")).toBe(3);
  });

  it("is deterministic and breaks ties by teamId ascending", () => {
    const ranksA = generateRanks([
      { teamId: "zeta", value: 80 },
      { teamId: "alpha", value: 80 },
    ]);
    expect(ranksA.get("alpha")).toBe(1);
    expect(ranksA.get("zeta")).toBe(2);

    // Re-running produces identical output — no hidden ordering dependence.
    const ranksB = generateRanks([
      { teamId: "zeta", value: 80 },
      { teamId: "alpha", value: 80 },
    ]);
    expect(ranksB).toEqual(ranksA);
  });

  it("produces every rank 1..N uniquely with no gaps for a fully-rated set", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ teamId: `t${i}`, value: i }));
    const ranks = generateRanks(items);
    const values = [...ranks.values()].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(values).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("gives null rank to items with a null value and sorts them out of the ranked set", () => {
    const ranks = generateRanks([
      { teamId: "a", value: 10 },
      { teamId: "b", value: null },
      { teamId: "c", value: 20 },
    ]);
    expect(ranks.get("b")).toBeNull();
    expect(ranks.get("c")).toBe(1);
    expect(ranks.get("a")).toBe(2);
  });

  it("supports ascending direction (rank 1 = lowest value)", () => {
    const ranks = generateRanks(
      [
        { teamId: "a", value: 50 },
        { teamId: "b", value: 10 },
      ],
      "asc",
    );
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("a")).toBe(2);
  });
});
