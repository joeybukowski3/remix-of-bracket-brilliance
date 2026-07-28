import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { simulateSeason, type SeasonSimulationOverrides } from "../engine/seasonSimulation";

const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 5, "branch-roster");
const roster = draft.rosters.get(5)!;
const names = OPPONENT_NAMES.map((entry) => entry.name);

function run(overrides: SeasonSimulationOverrides, seed = "branch-season") {
  return simulateSeason({
    roster,
    userSlot: 5,
    allRosters: Object.fromEntries(draft.rosters),
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: new Set(
      draft.selections.map((selection) => selection.playerId),
    ),
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: names,
    seed,
    overrides,
  });
}

const seedThree = {
  qualified: true,
  seed: 3 as const,
  hasBye: false,
};

describe("16-0 explicit season result branches", () => {
  it("covers missed playoffs", () => {
    const result = run({
      regularOpponentScores: Array(14).fill(500),
      qualification: { qualified: false, seed: null, hasBye: false },
    });
    expect(result.playoffResult).toBe("Missed Playoffs");
    expect(result.schedule).toHaveLength(14);
    expect(result.finalWins).toBe(result.regularWins);
  });

  it("covers Week 15 elimination", () => {
    const result = run({
      qualification: seedThree,
      playoffOpponentScores: { 15: 500 },
    });
    expect(result.playoffResult).toBe("Eliminated in First Round");
    expect(result.schedule[result.schedule.length - 1]?.fantasyWeek).toBe(15);
    expect(result.playoffLosses).toBe(1);
  });

  it("covers Week 16 elimination", () => {
    const result = run({
      qualification: seedThree,
      playoffOpponentScores: { 15: 0, 16: 500 },
    });
    expect(result.playoffResult).toBe("Eliminated in Semifinal");
    expect(result.schedule[result.schedule.length - 1]?.fantasyWeek).toBe(16);
    expect(result.playoffWins).toBe(1);
    expect(result.playoffLosses).toBe(1);
  });

  it("covers championship loss", () => {
    const result = run({
      qualification: seedThree,
      playoffOpponentScores: { 15: 0, 16: 0, 17: 500 },
    });
    expect(result.playoffResult).toBe("Lost Championship");
    expect(result.schedule[result.schedule.length - 1]?.fantasyWeek).toBe(17);
    expect(result.playoffWins).toBe(2);
    expect(result.playoffLosses).toBe(1);
  });

  it("covers a league champion from a non-bye seed", () => {
    const result = run({
      qualification: seedThree,
      playoffOpponentScores: { 15: 0, 16: 0, 17: 0 },
    });
    expect(result.playoffResult).toBe("League Champion");
    expect(result.playoffWins).toBe(3);
    expect(result.finalWins).toBe(result.regularWins + 3);
  });

  it("gives an actual 14-0 regular season a Week 15 bye", () => {
    const result = run({
      regularOpponentScores: Array(14).fill(0),
      playoffOpponentScores: { 16: 500 },
    }, "fourteen-zero");
    expect(result.regularWins).toBe(14);
    expect(result.qualification.hasBye).toBe(true);
    expect(result.qualification.seed).toBeLessThanOrEqual(2);
    expect(result.schedule[14]).toMatchObject({
      fantasyWeek: 15,
      opponentName: "First-Round Bye",
      result: null,
      isBye: true,
    });
    expect(result.playoffResult).toBe("Eliminated in Semifinal");
    expect(result.finalWins).toBe(14);
    expect(result.finalLosses).toBe(1);
  });

  it("covers a perfect 16-0 season and displayed-score average", () => {
    const result = run({
      regularOpponentScores: Array(14).fill(0),
      playoffOpponentScores: { 16: 0, 17: 0 },
    }, "perfect-season");
    const displayedAverage =
      Math.round(
        (result.schedule
          .filter((game) => game.fantasyWeek <= 14)
          .reduce((total, game) => total + (game.userScore ?? 0), 0) /
          14) *
          10,
      ) / 10;
    expect(result.regularWins).toBe(14);
    expect(result.playoffWins).toBe(2);
    expect(result.finalWins).toBe(16);
    expect(result.finalLosses).toBe(0);
    expect(result.playoffResult).toBe("League Champion");
    expect(result.averageWeeklyScore).toBe(displayedAverage);
  });

  it("rejects a bye override claimed with fewer than 10 user wins", () => {
    expect(() =>
      run({
        regularOpponentScores: [
          0, 0, 0, 0, 0, 500, 500, 500, 500, 500, 500, 500, 500, 500,
        ],
        qualification: { qualified: true, seed: 1, hasBye: true },
      }, "invalid-bye-override"),
    ).toThrow(/hasBye requires at least 10 regular-season wins/);
  });

  it("is identical for the same seed, roster, and overrides", () => {
    const overrides = {
      qualification: seedThree,
      playoffOpponentScores: { 15: 0, 16: 0, 17: 0 },
    };
    expect(run(overrides, "repeat-season")).toEqual(run(overrides, "repeat-season"));
  });
});
