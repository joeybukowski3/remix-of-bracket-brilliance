import { describe, expect, it } from "vitest";
import type { RawPlayerStat } from "@/components/pga/PgaHubShared";
import { buildCurrentPgaModelRows } from "@/lib/pga/historyModel";

function player(player: string, strength: number): RawPlayerStat {
  return {
    player,
    sgTotal: strength,
    sgOTT: strength,
    sgApp: strength,
    sgAtG: strength,
    sgPutt: strength,
    trendRank: 10 - strength,
    drivingAccuracy: 60 + strength,
    bogeyAvoidance: 0.2 - strength / 100,
    birdieBogeyRatio: 1 + strength / 10,
  };
}

describe("current PGA model builder", () => {
  it("preserves tour ordering and assigns a contiguous official-field rank", () => {
    const rows = buildCurrentPgaModelRows({
      players: [player("Tour Leader", 3), player("Field Leader", 2), player("Field Second", 1)],
      playerHistoryMap: new Map(),
      majorHistoryMap: new Map(),
      activeWeights: {
        sgTotal: .3,
        sgOTT: .1,
        sgApp: .2,
        sgAtG: .1,
        sgPutt: .1,
        trendRank: .05,
        drivingAccuracy: .05,
        bogeyAvoidance: .05,
        birdieBogeyRatio: .05,
      },
      event: { slug: "test-event", name: "Test Event", category: "standard", yardage: 7_100 },
      fieldKeys: new Set(["fieldleader", "fieldsecond"]),
    });

    expect(rows.map((row) => [row.player, row.modelRank, row.fieldRank])).toEqual([
      ["Tour Leader", 1, null],
      ["Field Leader", 2, 1],
      ["Field Second", 3, 2],
    ]);
  });
});
