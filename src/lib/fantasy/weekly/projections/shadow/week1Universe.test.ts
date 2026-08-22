import { describe, expect, it } from "vitest";
import { buildWeek1ShadowUniverse } from "./week1Universe";

describe("buildWeek1ShadowUniverse", () => {
  const players = [{ gsis_id: "00-1", pfr_id: "AAAA00", display_name: "Test Passer", position: "QB", team_abbr: "BUF", status: "ACT" }];
  const roster = [{ gsis_id: "00-1", pfr_id: "AAAA00", full_name: "Test Passer", position: "QB", team: "BUF", status: "ACT", week: "1", game_type: "REG" }];
  const games = [{ gameId: "g1", season: 2026, week: 1, seasonType: "REG", homeAbbr: "buf", awayAbbr: "hou", neutralSite: false }];
  const par = [{ Player: "Test Passer", Team: "BUF", Position: "QB", "2026 Projected PPG": 21.4, "Source ID": "AAAA00", "Consensus Position Rank": 1 }];

  it("resolves a matched player with team/opponent/homeAway from the schedule", () => {
    const result = buildWeek1ShadowUniverse({ season: 2026, week: 1, par, players, roster, games });
    expect(result.unresolved).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({ playerId: "gsis:00-1", team: "buf", opponent: "hou", homeAway: "home", rosProjectedPpg: 21.4 });
  });

  it("reports a player with no Week 1 schedule game as unresolved rather than dropping silently", () => {
    const noGameRoster = [{ ...roster[0], team: "SEA" }];
    const result = buildWeek1ShadowUniverse({ season: 2026, week: 1, par, players, roster: noGameRoster, games });
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].reason).toMatch(/no Week 1 2026 schedule game/);
  });

  it("reports an identity that cannot be resolved against roster/players as unresolved", () => {
    const result = buildWeek1ShadowUniverse({ season: 2026, week: 1, par, players: [], roster: [], games });
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
  });

  it("ignores unsupported positions", () => {
    const kicker = [{ ...par[0], Position: "K" }];
    const result = buildWeek1ShadowUniverse({ season: 2026, week: 1, par: kicker, players, roster, games });
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});
