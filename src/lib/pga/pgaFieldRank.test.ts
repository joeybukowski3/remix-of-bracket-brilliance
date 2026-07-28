import { describe, expect, it } from "vitest";
import { assignFieldRanks, normalizePlayerKey } from "@/lib/pga/historyModel";

type Row = { player: string; modelScore: number; modelRank: number };

/** Tour-ordered rows: ranks 1-3 are NOT in the field, mirroring Rocket Classic. */
const TOUR_ROWS: Row[] = [
  { player: "Scottie Scheffler", modelScore: 90, modelRank: 1 },
  { player: "Rory McIlroy", modelScore: 88, modelRank: 2 },
  { player: "Collin Morikawa", modelScore: 86, modelRank: 3 },
  { player: "Jacob Bridgeman", modelScore: 74.4, modelRank: 4 },
  { player: "Russell Henley", modelScore: 74.2, modelRank: 5 },
  { player: "Cameron Young", modelScore: 69.4, modelRank: 11 },
];

const FIELD = new Set(
  ["Jacob Bridgeman", "Russell Henley", "Cameron Young"].map(normalizePlayerKey),
);

describe("assignFieldRanks", () => {
  it("numbers the strongest field member #1 instead of inheriting a tour rank", () => {
    // The production defect: /pga's default field view began at "#4" because
    // tour ranks 1-3 belonged to players not entered this week.
    const ranked = assignFieldRanks(TOUR_ROWS, FIELD);
    const bridgeman = ranked.find((r) => r.player === "Jacob Bridgeman");

    expect(bridgeman?.fieldRank).toBe(1);
    expect(bridgeman?.modelRank).toBe(4);
  });

  it("produces contiguous field ranks starting at 1", () => {
    const ranked = assignFieldRanks(TOUR_ROWS, FIELD);
    const fieldRanks = ranked
      .filter((r) => r.fieldRank != null)
      .map((r) => r.fieldRank)
      .sort((a, b) => (a as number) - (b as number));

    expect(fieldRanks).toEqual([1, 2, 3]);
  });

  it("leaves non-field players without a field rank", () => {
    const ranked = assignFieldRanks(TOUR_ROWS, FIELD);
    for (const player of ["Scottie Scheffler", "Rory McIlroy", "Collin Morikawa"]) {
      expect(ranked.find((r) => r.player === player)?.fieldRank).toBeNull();
    }
  });

  it("preserves every tour rank untouched", () => {
    const ranked = assignFieldRanks(TOUR_ROWS, FIELD);
    for (const original of TOUR_ROWS) {
      expect(ranked.find((r) => r.player === original.player)?.modelRank).toBe(original.modelRank);
    }
  });

  it("does not alter modelScore", () => {
    const ranked = assignFieldRanks(TOUR_ROWS, FIELD);
    for (const original of TOUR_ROWS) {
      expect(ranked.find((r) => r.player === original.player)?.modelScore).toBe(original.modelScore);
    }
  });

  it("orders field rank by model score descending", () => {
    const ranked = assignFieldRanks(TOUR_ROWS, FIELD);
    expect(ranked.find((r) => r.player === "Jacob Bridgeman")?.fieldRank).toBe(1);
    expect(ranked.find((r) => r.player === "Russell Henley")?.fieldRank).toBe(2);
    expect(ranked.find((r) => r.player === "Cameron Young")?.fieldRank).toBe(3);
  });

  it("breaks ties deterministically by player name", () => {
    const tied: Row[] = [
      { player: "Zed Zulu", modelScore: 70, modelRank: 1 },
      { player: "Al Alpha", modelScore: 70, modelRank: 2 },
      { player: "Mo Mike", modelScore: 70, modelRank: 3 },
    ];
    const field = new Set(tied.map((r) => normalizePlayerKey(r.player)));
    const ranked = assignFieldRanks(tied, field);

    expect(ranked.find((r) => r.player === "Al Alpha")?.fieldRank).toBe(1);
    expect(ranked.find((r) => r.player === "Mo Mike")?.fieldRank).toBe(2);
    expect(ranked.find((r) => r.player === "Zed Zulu")?.fieldRank).toBe(3);
  });

  it("is stable across repeated shuffled input", () => {
    const expected = assignFieldRanks(TOUR_ROWS, FIELD)
      .filter((r) => r.fieldRank != null)
      .sort((a, b) => (a.fieldRank as number) - (b.fieldRank as number))
      .map((r) => r.player);

    for (let i = 0; i < 25; i += 1) {
      const shuffled = [...TOUR_ROWS].sort(() => Math.random() - 0.5);
      const actual = assignFieldRanks(shuffled, FIELD)
        .filter((r) => r.fieldRank != null)
        .sort((a, b) => (a.fieldRank as number) - (b.fieldRank as number))
        .map((r) => r.player);
      expect(actual).toEqual(expected);
    }
  });

  it("numbers every row when no field filter is available", () => {
    // An empty field set means "field data unusable", not "nobody is entered".
    const ranked = assignFieldRanks(TOUR_ROWS, new Set<string>());
    expect(ranked.every((r) => r.fieldRank != null)).toBe(true);
    expect(ranked.find((r) => r.player === "Scottie Scheffler")?.fieldRank).toBe(1);
  });

  it("matches field members through the shared player-key normalization", () => {
    // Both the field set and the model rows normalize through the same
    // function, so any spelling matches itself.
    const rows: Row[] = [{ player: "Nicolai Højgaard", modelScore: 80, modelRank: 1 }];
    const ranked = assignFieldRanks(rows, new Set([normalizePlayerKey("Nicolai Højgaard")]));
    expect(ranked[0].fieldRank).toBe(1);
  });

  it("matches across decomposable accents", () => {
    const rows: Row[] = [{ player: "Ludvig Åberg", modelScore: 80, modelRank: 1 }];
    const ranked = assignFieldRanks(rows, new Set([normalizePlayerKey("Ludvig Aberg")]));
    expect(ranked[0].fieldRank).toBe(1);
  });

  it("documents that non-decomposable letters like o-slash do NOT cross-match", () => {
    // Pre-existing normalizePlayerKey limitation, NOT introduced here and out
    // of scope for this correctness pass: NFKD decomposes base+combining-mark
    // pairs (a-ring, e-acute) but o-slash is its own letter, so it is stripped
    // entirely. Harmless today because both sources spell names identically;
    // recorded so a future identity fix has a failing expectation to flip.
    const rows: Row[] = [{ player: "Nicolai Højgaard", modelScore: 80, modelRank: 1 }];
    const ranked = assignFieldRanks(rows, new Set([normalizePlayerKey("Nicolai Hojgaard")]));
    expect(ranked[0].fieldRank).toBeNull();
  });

  it("returns an empty array for empty input", () => {
    expect(assignFieldRanks([], FIELD)).toEqual([]);
  });
});
