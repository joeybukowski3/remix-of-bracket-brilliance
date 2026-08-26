import { describe, expect, it } from "vitest";
import { buildScheduleFpaContext, type FpaLookup, type RemainingScheduleGame } from "@/lib/fantasy/rosResearch/scheduleFpaContext";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

function fpaRow(rank: number, pointsAllowed: number) {
  return { rank, pointsAllowed };
}

function fullFpaRow(rank: number, pointsAllowed: number): Record<FantasyPosition, { rank: number; pointsAllowed: number }> {
  return { QB: fpaRow(rank, pointsAllowed), RB: fpaRow(rank, pointsAllowed), WR: fpaRow(rank, pointsAllowed), TE: fpaRow(rank, pointsAllowed) };
}

describe("buildScheduleFpaContext", () => {
  it("aggregates FPA across every remaining opponent and reports full coverage when every opponent has data", () => {
    const schedule = new Map<string, RemainingScheduleGame[]>([
      ["buf", [{ week: 1, opponent: "mia" }, { week: 2, opponent: "nyj" }]],
    ]);
    const fpa: FpaLookup = new Map([
      ["mia", fullFpaRow(1, 30)],
      ["nyj", fullFpaRow(1, 10)],
    ]);
    const result = buildScheduleFpaContext(schedule, fpa, 2025);
    const qb = result.teams.find((row) => row.team === "buf" && row.position === "QB")!;
    expect(qb.remainingGames).toBe(2);
    expect(qb.opponentsWithFpaData).toBe(2);
    expect(qb.averagePointsAllowed).toBe(20);
    expect(result.counts.overallFraction).toBe(1);
  });

  it("excludes a missing-opponent game from the average rather than fabricating a value -- missing data handling / coverage", () => {
    const schedule = new Map<string, RemainingScheduleGame[]>([
      ["buf", [{ week: 1, opponent: "mia" }, { week: 2, opponent: "xyz" }]],
    ]);
    const fpa: FpaLookup = new Map([["mia", fullFpaRow(1, 30)]]);
    const result = buildScheduleFpaContext(schedule, fpa, 2025);
    const qb = result.teams.find((row) => row.team === "buf" && row.position === "QB")!;
    expect(qb.remainingGames).toBe(2);
    expect(qb.opponentsWithFpaData).toBe(1);
    expect(qb.averagePointsAllowed).toBe(30);
    expect(qb.games.find((game) => game.opponent === "xyz")?.pointsAllowed).toBeNull();
    expect(result.counts.overallFraction).toBe(0.5);
  });

  it("keeps FPA direction consistent with the source: a higher average points-allowed is the more favourable remaining slate", () => {
    const schedule = new Map<string, RemainingScheduleGame[]>([
      ["easy", [{ week: 1, opponent: "leaky" }]],
      ["hard", [{ week: 1, opponent: "stingy" }]],
    ]);
    const fpa: FpaLookup = new Map([
      ["leaky", fullFpaRow(1, 35)],
      ["stingy", fullFpaRow(32, 8)],
    ]);
    const result = buildScheduleFpaContext(schedule, fpa, 2025);
    const easy = result.teams.find((row) => row.team === "easy" && row.position === "RB")!.averagePointsAllowed!;
    const hard = result.teams.find((row) => row.team === "hard" && row.position === "RB")!.averagePointsAllowed!;
    expect(easy).toBeGreaterThan(hard);
  });

  it("never fabricates an average when zero opponents have data", () => {
    const schedule = new Map<string, RemainingScheduleGame[]>([["buf", [{ week: 1, opponent: "xyz" }]]]);
    const result = buildScheduleFpaContext(schedule, new Map(), 2025);
    const qb = result.teams.find((row) => row.team === "buf" && row.position === "QB")!;
    expect(qb.averagePointsAllowed).toBeNull();
  });
});
