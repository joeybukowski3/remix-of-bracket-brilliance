import { describe, expect, it } from "vitest";
import { computeOpponentAdjustedPerformance } from "./opponentAdjustment";
import type { CfbTeamGamePerformance } from "./types";

function game(
  gameId: string,
  teamA: string,
  teamAYpp: number,
  teamB: string,
  teamBYpp: number,
): CfbTeamGamePerformance[] {
  return [
    {
      gameId,
      teamId: teamA,
      teamClassification: "fbs",
      opponentTeamId: teamB,
      opponentClassification: "fbs",
      points: 21,
      pointsAllowed: 17,
      plays: 60,
      totalYards: teamAYpp * 60,
      yardsPerPlay: teamAYpp,
      yardsPerPlayAllowed: teamBYpp,
      turnovers: 1,
    },
    {
      gameId,
      teamId: teamB,
      teamClassification: "fbs",
      opponentTeamId: teamA,
      opponentClassification: "fbs",
      points: 17,
      pointsAllowed: 21,
      plays: 60,
      totalYards: teamBYpp * 60,
      yardsPerPlay: teamBYpp,
      yardsPerPlayAllowed: teamAYpp,
      turnovers: 1,
    },
  ];
}

function byTeam(rows: ReturnType<typeof computeOpponentAdjustedPerformance>["adjusted"]) {
  return new Map(rows.map((row) => [row.teamId, row]));
}

describe("CFB opponent adjustment", () => {
  it("values identical offense more against the stronger defense", () => {
    const teams = ["tested-strong", "tested-weak", "strong-defense", "weak-defense", "high", "low"];
    const rows = [
      ...game("1", "tested-strong", 5, "strong-defense", 4),
      ...game("2", "tested-weak", 5, "weak-defense", 4),
      ...game("3", "strong-defense", 4, "low", 3),
      ...game("4", "weak-defense", 4, "high", 7),
      ...game("5", "high", 7, "low", 3),
    ];
    const adjusted = byTeam(computeOpponentAdjustedPerformance(teams, rows).adjusted);
    expect(adjusted.get("tested-strong")?.opponentAdjustedOffensiveEfficiency).toBeGreaterThan(
      adjusted.get("tested-weak")?.opponentAdjustedOffensiveEfficiency as number,
    );
  });

  it("values identical defense more against the stronger offense", () => {
    const teams = ["tested-strong", "tested-weak", "strong-offense", "weak-offense", "high", "low"];
    const rows = [
      ...game("1", "strong-offense", 5, "tested-strong", 4),
      ...game("2", "weak-offense", 5, "tested-weak", 4),
      ...game("3", "strong-offense", 7, "low", 3),
      ...game("4", "weak-offense", 3, "high", 7),
      ...game("5", "high", 7, "low", 3),
    ];
    const adjusted = byTeam(computeOpponentAdjustedPerformance(teams, rows).adjusted);
    expect(adjusted.get("tested-strong")?.opponentAdjustedDefensiveEfficiency).toBeLessThan(
      adjusted.get("tested-weak")?.opponentAdjustedDefensiveEfficiency as number,
    );
  });

  it("moves adjusted output in the expected direction when schedule strength changes", () => {
    const teams = ["tested", "strong", "weak", "high", "low"];
    const base = [
      ...game("2", "strong", 4, "low", 3),
      ...game("3", "weak", 4, "high", 7),
      ...game("4", "high", 7, "low", 3),
    ];
    const strongSchedule = byTeam(
      computeOpponentAdjustedPerformance(teams, [...base, ...game("1", "tested", 5, "strong", 4)]).adjusted,
    );
    const weakSchedule = byTeam(
      computeOpponentAdjustedPerformance(teams, [...base, ...game("1", "tested", 5, "weak", 4)]).adjusted,
    );
    expect(strongSchedule.get("tested")?.opponentAdjustedOffensiveEfficiency).toBeGreaterThan(
      weakSchedule.get("tested")?.opponentAdjustedOffensiveEfficiency as number,
    );
  });

  it("is deterministic, finite, and does not turn FCS/missing opponents into zero strength", () => {
    const fcsRow: CfbTeamGamePerformance = {
      ...game("1", "a", 5, "b", 4)[0],
      opponentTeamId: null,
      opponentClassification: "fcs",
    };
    const first = computeOpponentAdjustedPerformance(["a"], [fcsRow]);
    const second = computeOpponentAdjustedPerformance(["a"], [fcsRow]);
    expect(second).toEqual(first);
    expect(first.eligibleGameCount).toBe(0);
    expect(first.adjusted[0].opponentAdjustedOffensiveEfficiency).toBeNull();
    expect(first.adjusted[0].opponentAdjustedDefensiveEfficiency).toBeNull();
    expect(JSON.stringify(first)).not.toMatch(/NaN|Infinity/);
  });

  it("excludes a mapped future-FBS team while it was classified as FCS", () => {
    const fcsTeamRow: CfbTeamGamePerformance = {
      ...game("1", "future-fbs", 5, "fbs-team", 4)[0],
      teamClassification: "fcs",
    };
    const result = computeOpponentAdjustedPerformance(["future-fbs"], [fcsTeamRow]);
    expect(result.eligibleGameCount).toBe(0);
    expect(result.adjusted[0].opponentAdjustedOffensiveEfficiency).toBeNull();
  });
});
