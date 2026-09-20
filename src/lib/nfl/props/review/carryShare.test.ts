import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCarryShareSamples, carryShareForRow, formatCarryShare, parsePlayerWeekCarries, type PlayerWeekCarryRow } from "./carryShare";
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";

const completed = new Set(["g1", "g2"]);
function week(player_id: string, team: string, carries: number, game_id = "g1", overrides: Partial<PlayerWeekCarryRow> = {}): PlayerWeekCarryRow {
  return { player_id, team, carries: String(carries), game_id, position: "RB", season: "2026", season_type: "REG", ...overrides };
}
function share(rows: PlayerWeekCarryRow[], playerId = "gsis:a", team = "ne") {
  return carryShareForRow({ market: "rushing", playerId, team } as NflCurrentWeekProjectionRow, buildCarryShareSamples(rows, completed, 2026));
}

describe("Carry Share", () => {
  it("handles a one-RB backfield and two/three-RB splits", () => {
    expect(share([week("a", "NE", 12)])).toMatchObject({ playerCarries: 12, teamRbCarries: 12, share: 1 });
    expect(share([week("a", "NE", 8), week("b", "NE", 10)])?.share).toBeCloseTo(8 / 18);
    expect(share([week("a", "NE", 8), week("b", "NE", 10), week("c", "NE", 2)])?.share).toBeCloseTo(8 / 20);
  });

  it("aggregates carries before dividing over completed regular-season 2026 games", () => {
    const rows = [
      week("a", "NE", 8), week("b", "NE", 2),
      week("a", "NE", 2, "g2"), week("b", "NE", 8, "g2"),
      week("a", "NE", 100, "future"),
      week("a", "NE", 100, "g1", { season: "2025" }),
      week("a", "NE", 100, "g1", { season_type: "POST" }),
    ];
    expect(share(rows)).toMatchObject({ playerCarries: 10, teamRbCarries: 20, share: 0.5 });
  });

  it("excludes QB, WR and TE carries and uses only the current prop team", () => {
    const rows = [week("a", "NE", 4), week("b", "NE", 6), week("q", "NE", 10, "g1", { position: "QB" }),
      week("w", "NE", 3, "g1", { position: "WR" }), week("t", "NE", 2, "g1", { position: "TE" }),
      week("a", "NYJ", 20), week("c", "NYJ", 10)];
    expect(share(rows)).toMatchObject({ playerCarries: 4, teamRbCarries: 10, share: 0.4 });
    expect(share(rows, "gsis:a", "nyj")).toMatchObject({ playerCarries: 20, teamRbCarries: 30, share: 20 / 30 });
  });

  it("uses canonical IDs; a missing player sample is an em dash", () => {
    const rows = [week("a", "NE", 5), week("b", "NE", 5)];
    expect(share(rows, "gsis:missing")).toBeNull();
    expect(formatCarryShare(share(rows, "gsis:missing"))).toBe("—");
    expect(formatCarryShare(share(rows))).toBe("50%");
  });

  it("matches the committed 2026 cache spot checks against final games", () => {
    const csv = readFileSync("data/nfl/nflverse/player-week-stats/stats_player_week_2026.csv", "utf8");
    const results = JSON.parse(readFileSync("public/data/nfl/2026/results.json", "utf8")) as { results: { gameId: string; final: boolean; seasonType: string }[] };
    const ids = new Set(results.results.filter((r) => r.final && r.seasonType === "REG").map((r) => r.gameId));
    const samples = buildCarryShareSamples(parsePlayerWeekCarries(csv), ids, 2026);
    const cases: [string, string, number, number][] = [
      ["00-0036139", "pit", 8, 18], ["00-0036973", "no", 9, 20],
      ["00-0040583", "hou", 9, 29], ["00-0040784", "cle", 12, 13],
      ["00-0035261", "ten", 7, 10], ["00-0033280", "sf", 10, 24],
      ["00-0037228", "pit", 10, 18], ["00-0039361", "tb", 8, 13],
      ["00-0039040", "mia", 11, 12],
    ];
    for (const [id, team, carries, total] of cases) {
      expect(samples.get(`${team}:gsis:${id}`)).toMatchObject({ playerCarries: carries, teamRbCarries: total });
    }
    expect(samples.get("no:gsis:00-0033906")).toBeUndefined(); // Alvin Kamara
  });
});
