import { describe, expect, it } from "vitest";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { getRosConsensusIdentity } from "@/lib/fantasy/rosPlayerIdentity";

describe("ROS player identity bridge", () => {
  it("resolves every source-backed JKB row without fabricating the one absent identity", () => {
    const unresolved = FANTASY_RANKINGS.rows.filter((row) => !getRosConsensusIdentity(row));
    expect(unresolved.map((row) => row.player)).toEqual(["Ricky Pearsall"]);
    const resolvedIds = FANTASY_RANKINGS.rows.flatMap((row) => {
      const identity = getRosConsensusIdentity(row);
      return identity ? [identity["Source ID"]] : [];
    });
    expect(new Set(resolvedIds).size).toBe(resolvedIds.length);
  });

  it("uses reviewed aliases without fuzzy matching", () => {
    const mahomes = FANTASY_RANKINGS.rows.find((row) => row.player === "Patrick Mahomes")!;
    expect(getRosConsensusIdentity(mahomes)).toMatchObject({
      Player: "Patrick Mahomes II",
      Position: "QB",
    });
  });
});
