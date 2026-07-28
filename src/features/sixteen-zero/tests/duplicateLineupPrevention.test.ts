import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { LINEUP_SLOTS } from "../engine/lineupOptimizer";
import { simulateSeason } from "../engine/seasonSimulation";
import type { SimulationPlayer } from "../types";

const names = OPPONENT_NAMES.map((entry) => entry.name);

/** Forces every player at `position` on this roster onto the same bye week, so a temporary replacement is required. */
function withSameBye(roster: readonly SimulationPlayer[], position: "K" | "DST", week: number) {
  return roster.map((player) =>
    player.position === position ? { ...player, byeWeek: week } : player,
  );
}

function forceReplacementNeed(roster: readonly SimulationPlayer[], week: number) {
  return withSameBye(withSameBye(roster, "K", week), "DST", week);
}

function draftFixture(seed: string) {
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 1, seed);
  const draftedPlayerIds = new Set(draft.selections.map((selection) => selection.playerId));
  return { draft, draftedPlayerIds };
}

/**
 * Builds a season input where the user roster AND every CPU roster are
 * forced to need a temporary K/DST replacement in the same week, so
 * whichever CPU opponent is actually scheduled that week will independently
 * draw from the same shared free-agent pool as the user.
 */
function buildOverlapProneInput(seed: string, week: number) {
  const { draft, draftedPlayerIds } = draftFixture(seed);
  const userRoster = forceReplacementNeed(draft.rosters.get(1)!, week);
  const allRosters = Object.fromEntries(
    Array.from(draft.rosters.entries()).map(([slot, roster]) => [
      slot,
      slot === 1 ? userRoster : forceReplacementNeed(roster, week),
    ]),
  );
  return {
    roster: userRoster,
    userSlot: 1,
    allRosters,
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds,
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: names,
    seed,
  };
}

describe("16-0 no duplicate players across matchup lineups", () => {
  const week = 6;
  const result = simulateSeason(buildOverlapProneInput("dup-prevention-seed", week));
  const game = result.schedule[week - 1];
  const boxScore = game.boxScore!;

  it("has both teams needing the same replacement position but receiving different temporary players", () => {
    const userReplacement = boxScore.userLineup.find(
      (entry) => entry.isTemporaryReplacement && entry.position === "K",
    );
    const opponentReplacement = boxScore.opponentLineup.find(
      (entry) => entry.isTemporaryReplacement && entry.position === "K",
    );
    expect(userReplacement).toBeDefined();
    expect(opponentReplacement).toBeDefined();
    expect(userReplacement!.playerId).not.toBe(opponentReplacement!.playerId);

    const userDstReplacement = boxScore.userLineup.find(
      (entry) => entry.isTemporaryReplacement && entry.position === "DST",
    );
    const opponentDstReplacement = boxScore.opponentLineup.find(
      (entry) => entry.isTemporaryReplacement && entry.position === "DST",
    );
    expect(userDstReplacement).toBeDefined();
    expect(opponentDstReplacement).toBeDefined();
    expect(userDstReplacement!.playerId).not.toBe(opponentDstReplacement!.playerId);
  });

  it("still fields exactly nine unique starters on each side", () => {
    expect(boxScore.userLineup).toHaveLength(9);
    expect(new Set(boxScore.userLineup.map((entry) => entry.playerId)).size).toBe(9);
    expect(boxScore.opponentLineup).toHaveLength(9);
    expect(new Set(boxScore.opponentLineup.map((entry) => entry.playerId)).size).toBe(9);
  });

  it("shares no player ID between the two starting lineups", () => {
    const userIds = new Set(boxScore.userLineup.map((entry) => entry.playerId));
    for (const entry of boxScore.opponentLineup) {
      expect(userIds.has(entry.playerId)).toBe(false);
    }
  });

  it("still reconciles saved player scores to each team's stored total", () => {
    const userSum =
      Math.round(boxScore.userLineup.reduce((total, entry) => total + entry.points, 0) * 10) / 10;
    const opponentSum =
      Math.round(boxScore.opponentLineup.reduce((total, entry) => total + entry.points, 0) * 10) / 10;
    expect(userSum).toBeCloseTo(game.userScore!, 5);
    expect(opponentSum).toBeCloseTo(game.opponentScore!, 5);
  });

  it("produces an identical result for the same seed and inputs", () => {
    const repeated = simulateSeason(buildOverlapProneInput("dup-prevention-seed", week));
    expect(repeated.schedule).toEqual(result.schedule);
  });

  it("does not affect weeks where no replacement collision is possible", () => {
    for (const otherGame of result.schedule.filter((entry) => !entry.isBye && entry.fantasyWeek !== week)) {
      const otherBox = otherGame.boxScore!;
      const userIds = new Set(otherBox.userLineup.map((entry) => entry.playerId));
      for (const slot of LINEUP_SLOTS) {
        const opponentEntry = otherBox.opponentLineup.find((entry) => entry.slot === slot);
        expect(userIds.has(opponentEntry!.playerId)).toBe(false);
      }
    }
  });
});
