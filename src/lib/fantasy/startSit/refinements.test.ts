import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareLineupSwaps } from "./lineupComparison";
import { searchFantasyPlayers } from "./playerSearch";
import type { PlayerMatch } from "./sleeper";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import type { WeeklyFantasyResearchArtifact } from "@/lib/fantasy/weekly/researchArtifact";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";
import { prepareWeeklyResearchPresentation, weeklyMatchupDifferenceHeatTone } from "@/lib/fantasy/weekly/researchPresentation";

const row = (id: string, position: "QB" | "RB" | "WR" | "TE", points: number) => ({ playerId: `gsis:${id}`, playerName: id, position, team: "BUF", projectedFantasyPoints: points, positionRank: 1 }) as WeeklyFantasyProjectionProductionRow;
const match = (id: string, position: "QB" | "RB" | "WR" | "TE", points: number): PlayerMatch => ({ sleeperId: id, sleeper: { player_id: id, position }, jkb: row(id, position, points), method: "gsis" });
const map = (...players: PlayerMatch[]) => new Map(players.map((player) => [player.sleeperId, player]));

describe("lineup swap indicators", () => {
  it("uses a strict 10% gain over the lower projection", () => {
    const exact = compareLineupSwaps(["RB"], ["a"], ["b"], map(match("a", "RB", 10), match("b", "RB", 11)));
    expect(exact[0]).toMatchObject({ improvementRatio: 0.1, meaningfulUpgrade: false });
    const beyond = compareLineupSwaps(["RB"], ["a"], ["b"], map(match("a", "RB", 10), match("b", "RB", 11.1)));
    expect(beyond[0].meaningfulUpgrade).toBe(true);
  });
  it("ignores players shifted between RB and FLEX and never marks a lower-projected arrival as an upgrade", () => {
    const players = map(match("javonte", "RB", 17), match("hampton", "RB", 20), match("swift", "RB", 12.9), match("jefferson", "WR", 18));
    const swaps = compareLineupSwaps(["RB", "RB", "FLEX"], ["javonte", "hampton", "jefferson"], ["hampton", "swift", "jefferson"], players);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toMatchObject({ currentId: "javonte", optimalId: "swift", meaningfulUpgrade: false });
    expect(swaps.find((swap) => swap.currentId === "hampton")).toBeUndefined();
  });
  it("marks a true roster upgrade even when retained players change slot", () => {
    const players = map(match("old", "RB", 12), match("retained", "RB", 20), match("new", "RB", 15));
    expect(compareLineupSwaps(["RB", "FLEX"], ["old", "retained"], ["retained", "new"], players)[0]).toMatchObject({ currentId: "old", optimalId: "new", meaningfulUpgrade: true });
  });
});

describe("general JKB comparison", () => {
  it("searches the full projection pool by name/position/team and excludes selections", () => {
    const players = [row("Josh Allen", "QB", 24), row("Lamar Jackson", "QB", 23), row("Jahmyr Gibbs", "RB", 21)];
    expect(searchFantasyPlayers(players, "josh", new Set()).map((player) => player.playerName)).toEqual(["Josh Allen"]);
    expect(searchFantasyPlayers(players, "qb", new Set(["gsis:Josh Allen"])).map((player) => player.playerName)).toEqual(["Lamar Jackson"]);
    expect(searchFantasyPlayers(players, "", new Set()).map((player) => player.playerName)).toEqual(["Josh Allen", "Lamar Jackson", "Jahmyr Gibbs"]);
  });
  it("joins published week-three EPA and success edges with the existing favorable orientation", () => {
    const projection = JSON.parse(readFileSync("public/data/fantasy/projections/2026/week-03.json", "utf8"));
    const research = JSON.parse(readFileSync("public/data/fantasy/weekly-research/2026/week-03.json", "utf8")) as WeeklyFantasyResearchArtifact;
    const allen = projection.rows.QB.find((player: WeeklyFantasyProjectionProductionRow) => player.playerName === "Josh Allen") as WeeklyFantasyProjectionProductionRow;
    const joined = joinWeeklyFantasyResearchRows(projection.rows.QB, research).rows;
    const prepared = prepareWeeklyResearchPresentation(joined).find((item) => item.row.playerId === allen.playerId)!;
    expect(prepared.row.matchupEdges.epa.rankDifference).toBe(9);
    expect(prepared.row.matchupEdges.success.rankDifference).toBe(5);
    expect(prepared.matchupEdges.epa.tone).toBe(weeklyMatchupDifferenceHeatTone(9));
    expect(prepared.matchupEdges.success.tone).toBe(weeklyMatchupDifferenceHeatTone(5));
    expect(prepared.matchup.components.epa.rank).toBe(prepared.matchupEdges.epa.displayRank);
    expect(prepared.matchup.components.success.rank).toBe(prepared.matchupEdges.success.displayRank);
  });
});
