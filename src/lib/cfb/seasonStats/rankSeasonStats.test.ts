import { describe, expect, it } from "vitest";
import { computeCompetitionRanks } from "./rankSeasonStats";

describe("computeCompetitionRanks", () => {
  it("ranks higher-is-better metrics descending", () => {
    const ranks = computeCompetitionRanks(
      [
        { teamId: "a", value: 30 },
        { teamId: "b", value: 40 },
        { teamId: "c", value: 20 },
      ],
      "higher-is-better",
    );
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("a")).toBe(2);
    expect(ranks.get("c")).toBe(3);
  });

  it("ranks lower-is-better metrics ascending", () => {
    const ranks = computeCompetitionRanks(
      [
        { teamId: "a", value: 30 },
        { teamId: "b", value: 40 },
        { teamId: "c", value: 20 },
      ],
      "lower-is-better",
    );
    expect(ranks.get("c")).toBe(1);
    expect(ranks.get("a")).toBe(2);
    expect(ranks.get("b")).toBe(3);
  });

  it("uses competition ranking for ties: 1, 2, 2, 4", () => {
    const ranks = computeCompetitionRanks(
      [
        { teamId: "a", value: 50 },
        { teamId: "b", value: 40 },
        { teamId: "c", value: 40 },
        { teamId: "d", value: 30 },
      ],
      "higher-is-better",
    );
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(2);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("d")).toBe(4);
  });

  it("excludes null values entirely rather than ranking them last", () => {
    const ranks = computeCompetitionRanks(
      [
        { teamId: "a", value: 50 },
        { teamId: "b", value: null },
        { teamId: "c", value: 30 },
      ],
      "higher-is-better",
    );
    expect(ranks.has("b")).toBe(false);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("c")).toBe(2);
  });

  it("is deterministic regardless of input order", () => {
    const entries = [
      { teamId: "a", value: 50 },
      { teamId: "b", value: 40 },
      { teamId: "c", value: 40 },
      { teamId: "d", value: 30 },
    ];
    const forward = computeCompetitionRanks(entries, "higher-is-better");
    const reversed = computeCompetitionRanks([...entries].reverse(), "higher-is-better");
    for (const entry of entries) {
      expect(reversed.get(entry.teamId)).toBe(forward.get(entry.teamId));
    }
  });
});
