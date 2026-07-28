import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { LINEUP_SLOTS } from "../engine/lineupOptimizer";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { simulateSeason } from "../engine/seasonSimulation";
import type { ScheduleGame } from "../types";

const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 5, "boxscore-roster");
const roster = draft.rosters.get(5)!;
const names = OPPONENT_NAMES.map((entry) => entry.name);

function runSeason(seed = "boxscore-season") {
  return simulateSeason({
    roster,
    userSlot: 5,
    allRosters: Object.fromEntries(draft.rosters),
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: new Set(draft.selections.map((selection) => selection.playerId)),
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: names,
    seed,
  });
}

function playedGames(schedule: ScheduleGame[]) {
  return schedule.filter((game) => !game.isBye);
}

describe("16-0 weekly matchup box-score snapshots", () => {
  const result = runSeason();

  it("attaches a box score to every played matchup", () => {
    for (const game of playedGames(result.schedule)) {
      expect(game.boxScore).toBeDefined();
    }
  });

  it("does not attach a box score to a first-round bye", () => {
    const byeGame = result.schedule.find((game) => game.isBye);
    if (byeGame) {
      expect(byeGame.boxScore).toBeUndefined();
    }
  });

  it("saves exactly nine unique starters for the user lineup each week", () => {
    for (const game of playedGames(result.schedule)) {
      const entries = game.boxScore!.userLineup;
      expect(entries).toHaveLength(9);
      expect(new Set(entries.map((entry) => entry.playerId)).size).toBe(9);
      expect(entries.map((entry) => entry.slot).sort()).toEqual([...LINEUP_SLOTS].sort());
    }
  });

  it("saves exactly nine unique starters for the CPU lineup each week", () => {
    for (const game of playedGames(result.schedule)) {
      const entries = game.boxScore!.opponentLineup;
      expect(entries).toHaveLength(9);
      expect(new Set(entries.map((entry) => entry.playerId)).size).toBe(9);
    }
  });

  it("sums the saved user player scores to the stored user team score", () => {
    for (const game of playedGames(result.schedule)) {
      const sum = game.boxScore!.userLineup.reduce((total, entry) => total + entry.points, 0);
      expect(Math.round(sum * 10) / 10).toBeCloseTo(game.userScore!, 5);
    }
  });

  it("sums the saved CPU player scores to the stored opponent team score", () => {
    for (const game of playedGames(result.schedule)) {
      const sum = game.boxScore!.opponentLineup.reduce((total, entry) => total + entry.points, 0);
      expect(Math.round(sum * 10) / 10).toBeCloseTo(game.opponentScore!, 5);
    }
  });

  it("records the CPU roster slot actually faced that week", () => {
    for (const game of playedGames(result.schedule)) {
      const slot = game.boxScore!.opponentRosterSlot;
      expect(slot).toBeGreaterThanOrEqual(1);
      expect(slot).toBeLessThanOrEqual(12);
      expect(slot).not.toBe(5);
    }
  });

  it("displays the NFL opponent exactly as recorded in weeklyOpponents for that week", () => {
    const playersById = new Map(SIMULATION_PLAYERS.map((player) => [player.id, player]));
    for (const game of playedGames(result.schedule)) {
      for (const entry of [...game.boxScore!.userLineup, ...game.boxScore!.opponentLineup]) {
        if (entry.isTemporaryReplacement) continue;
        const player = playersById.get(entry.playerId)!;
        const raw = player.weeklyOpponents[game.nflWeek] ?? null;
        if (raw === null) {
          expect(entry.nflOpponent).toBeNull();
        } else {
          expect(entry.nflOpponent).toBe(raw.replace(/^@/, "").trim().toUpperCase());
          expect(entry.isHome).toBe(!raw.trim().startsWith("@"));
        }
      }
    }
  });

  it("flags temporary replacements correctly against the drafted rosters", () => {
    const userRosterIds = new Set(roster.map((player) => player.id));
    const cpuRosterIds = new Map(
      Array.from(draft.rosters.entries()).map(([slot, cpuRoster]) => [
        slot,
        new Set(cpuRoster.map((player) => player.id)),
      ]),
    );
    for (const game of playedGames(result.schedule)) {
      for (const entry of game.boxScore!.userLineup) {
        expect(entry.isTemporaryReplacement).toBe(!userRosterIds.has(entry.playerId));
      }
      const cpuIds = cpuRosterIds.get(game.boxScore!.opponentRosterSlot)!;
      for (const entry of game.boxScore!.opponentLineup) {
        expect(entry.isTemporaryReplacement).toBe(!cpuIds.has(entry.playerId));
      }
    }
  });

  it("produces an identical box score for the same seed (no extra randomness consumed)", () => {
    const first = runSeason("boxscore-repeat");
    const second = runSeason("boxscore-repeat");
    expect(first.schedule).toEqual(second.schedule);
  });

  it("omits the box score when a test-only score override is applied", () => {
    const overridden = simulateSeason({
      roster,
      userSlot: 5,
      allRosters: Object.fromEntries(draft.rosters),
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: new Set(draft.selections.map((selection) => selection.playerId)),
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed: "boxscore-override",
      overrides: { regularOpponentScores: Array(14).fill(0) },
    });
    for (const game of overridden.schedule.filter((game) => game.fantasyWeek <= 14)) {
      expect(game.boxScore).toBeUndefined();
    }
  });
});
