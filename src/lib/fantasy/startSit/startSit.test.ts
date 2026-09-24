import { describe, expect, it, vi } from "vitest";
import { eligibleForSlot, filterAndSortPool, lineupDifference, optimizeLineup } from "./lineup";
import { findOwnedRoster, loadSleeperTeams, mapSleeperPlayers, normalizeSleeperRoster, type PlayerMatch, type SleeperRoster } from "./sleeper";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";

const player = (id: string, position: "QB" | "RB" | "WR" | "TE", points: number): PlayerMatch => ({ sleeperId: id, sleeper: { player_id: id, full_name: id, position, team: "BUF", gsis_id: id }, jkb: { playerId: `gsis:${id}`, playerName: id, position, team: "BUF", projectedFantasyPoints: points, positionRank: 1 } as WeeklyFantasyProjectionProductionRow, method: "gsis" });
describe("Sleeper normalization and identity", () => {
  it("finds the user's roster and normalizes duplicate/empty players and starter slots", () => {
    const rosters: SleeperRoster[] = [{ roster_id: 1, owner_id: "other", players: [], starters: [] }, { roster_id: 2, owner_id: "me", players: ["a", "a", ""], starters: ["a"] }];
    expect(findOwnedRoster(rosters, "me")?.roster_id).toBe(2);
    expect(findOwnedRoster(rosters, "missing")).toBeNull();
    expect(normalizeSleeperRoster(rosters[1], ["QB", "RB"])).toMatchObject({ players: ["a"], starters: ["a", "0"] });
    expect(normalizeSleeperRoster({ ...rosters[1], players: [], starters: ["a", "0"], reserve: ["b"], taxi: ["c"] }, ["QB", "RB"])).toMatchObject({ players: ["a", "b", "c"], starters: ["a", "0"] });
  });
  it("uses gsis first and guarded name/team fallback, leaving missing players auditable", () => {
    const projections = [player("001", "QB", 20).jkb!, { ...player("002", "WR", 12).jkb!, playerName: "Brian Thomas Jr." }];
    const mapped = mapSleeperPlayers(["a", "b", "c"], { a: { player_id: "a", gsis_id: "001", position: "QB", team: "BUF" }, b: { player_id: "b", full_name: "Brian Thomas", position: "WR", team: "BUF" }, c: { player_id: "c", full_name: "Other", position: "RB", team: "BUF" } }, projections);
    expect(mapped.map((row) => row.method)).toEqual(["gsis", "name-team", "unmatched"]);
    const aliasedTeam = mapSleeperPlayers(["jag"], { jag: { player_id: "jag", full_name: "Brian Thomas", position: "WR", team: "JAC" } }, [{ ...projections[1], team: "JAX" }]);
    expect(aliasedTeam[0]).toMatchObject({ method: "name-team", jkb: { playerName: "Brian Thomas Jr." } });
  });
  it("reports invalid usernames and no leagues", async () => {
    const missing = vi.fn().mockResolvedValue({ status: 404, ok: false });
    await expect(loadSleeperTeams("bad", 2026, missing)).rejects.toThrow("not found");
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: "u", username: "me" }) }).mockResolvedValueOnce({ ok: true, json: async () => [] });
    expect((await loadSleeperTeams("me", 2026, fetcher)).teams).toEqual([]);
  });
});

describe("Start/Sit lineup", () => {
  it("handles FLEX, superflex and specialty eligibility", () => {
    expect(eligibleForSlot("FLEX", "RB")).toBe(true);
    expect(eligibleForSlot("FLEX", "QB")).toBe(false);
    expect(eligibleForSlot("SUPER_FLEX", "QB")).toBe(true);
    expect(eligibleForSlot("REC_FLEX", "RB")).toBe(false);
  });
  it("maximizes projected points without reusing a player", () => {
    const pool = [player("rb1", "RB", 8), player("rb2", "RB", 15), player("wr1", "WR", 13), player("wr2", "WR", 10)];
    const optimal = optimizeLineup(["RB", "WR", "FLEX"], pool, ["rb1", "wr2", "wr1"]);
    expect(new Set(optimal).size).toBe(3);
    expect(optimal).toContain("rb2");
    expect(optimal).toContain("wr1");
    expect(optimal).toContain("wr2");
    expect(lineupDifference(["rb1", "wr2", "wr1"], optimal, ["RB", "WR", "FLEX"])).toBe(1);
  });
  it("keeps unprojected slots and filters/sorts one roster pool", () => {
    const pool = [player("wr", "WR", 12), player("rb", "RB", 18), player("te", "TE", 7)];
    expect(optimizeLineup(["K", "FLEX"], pool, ["k", "te"])[0]).toBe("k");
    expect(filterAndSortPool(pool, "FLEX").map((row) => row.sleeperId)).toEqual(["rb", "wr", "te"]);
    expect(filterAndSortPool(pool, "WR").map((row) => row.sleeperId)).toEqual(["wr"]);
  });
  it("keeps eligible unprojected starters when projected players cannot fill every slot", () => {
    const unprojected: PlayerMatch = { sleeperId: "rb2", sleeper: { player_id: "rb2", full_name: "Unprojected RB", position: "RB", team: "BUF" }, jkb: null, method: "unmatched" };
    expect(optimizeLineup(["RB", "RB"], [player("rb1", "RB", 18), unprojected], ["rb1", "rb2"])).toEqual(["rb1", "rb2"]);
  });
  it("does not promote reserve or taxi players into the optimal lineup", () => {
    const pool = [player("active", "RB", 12), player("reserve", "RB", 20), player("taxi", "RB", 22)];
    expect(optimizeLineup(["RB"], pool, ["active"], new Set(["reserve", "taxi"]))).toEqual(["active"]);
  });
});
