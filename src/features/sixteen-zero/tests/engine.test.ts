import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import {
  chooseAutoPick,
  simulateAutomaticDraft,
} from "../engine/cpuDraft";
import { createSnakeDraftOrder, getUserDraftPicks } from "../engine/draftOrder";
import {
  getExpectedPlayerScore,
  optimizeLineup,
  optimizeProjectedStartingRoster,
} from "../engine/lineupOptimizer";
import { getMatchupMultiplier } from "../engine/matchupAdjustment";
import {
  buildPlayerTierMap,
  simulatePlayerScore,
} from "../engine/playerScoreSimulation";
import { determinePlayoffQualification } from "../engine/playoffQualification";
import {
  canAddPlayer,
  countRosterPositions,
  getLegalDraftCandidates,
  isLegalCompletedRoster,
  isRoundFifteenFoundationComplete,
} from "../engine/rosterRules";
import { simulateSeason } from "../engine/seasonSimulation";
import { SeededRandom } from "../engine/seededRandom";
import type { SimulationPlayer } from "../types";

describe("16-0 canonical data", () => {
  it("ships a valid active player universe and curated opponent pool", () => {
    expect(SIMULATION_PLAYERS.length).toBeGreaterThanOrEqual(275);
    expect(new Set(SIMULATION_PLAYERS.map((player) => player.id)).size).toBe(
      SIMULATION_PLAYERS.length,
    );
    expect(SIMULATION_PLAYERS.every((player) => player.active)).toBe(true);
    expect(SIMULATION_PLAYERS.every((player) => Number.isFinite(player.blendedPPG))).toBe(true);
    expect(SIMULATION_PLAYERS.filter((player) => player.position === "K").length).toBeGreaterThanOrEqual(24);
    expect(SIMULATION_PLAYERS.filter((player) => player.position === "DST").length).toBeGreaterThanOrEqual(24);

    expect(OPPONENT_NAMES.length).toBeGreaterThanOrEqual(120);
    expect(new Set(OPPONENT_NAMES.map((entry) => entry.name)).size).toBe(OPPONENT_NAMES.length);
  });
});

describe("16-0 draft order and roster legality", () => {
  it("creates all 204 snake picks and 17 picks for every slot", () => {
    const order = createSnakeDraftOrder();
    expect(order).toHaveLength(204);
    expect(order.slice(0, 12).map((pick) => pick.slot)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(order.slice(12, 24).map((pick) => pick.slot)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    for (let slot = 1; slot <= 12; slot += 1) {
      expect(getUserDraftPicks(slot)).toHaveLength(17);
    }
  });

  it("reserves Rounds 16 and 17 for exactly one backup K and DST", () => {
    const draft = simulateAutomaticDraft(
      SIMULATION_PLAYERS,
      1,
      "reserved-round-reference",
    );
    const playersById = new Map(
      SIMULATION_PLAYERS.map((player) => [player.id, player]),
    );

    for (let slot = 1; slot <= 12; slot += 1) {
      const firstFifteen = draft.selections
        .filter((selection) => selection.slot === slot && selection.round <= 15)
        .map((selection) => playersById.get(selection.playerId)!);
      const reserved = draft.selections
        .filter((selection) => selection.slot === slot && selection.round >= 16)
        .map((selection) => playersById.get(selection.playerId)!);
      const firstFifteenCounts = countRosterPositions(firstFifteen);

      expect(firstFifteen).toHaveLength(15);
      expect(isRoundFifteenFoundationComplete(firstFifteen)).toBe(true);
      expect(firstFifteenCounts.K).toBe(1);
      expect(firstFifteenCounts.DST).toBe(1);
      expect(reserved).toHaveLength(2);
      expect(reserved.map((player) => player.position).sort()).toEqual([
        "DST",
        "K",
      ]);
    }

    expect(
      draft.selections
        .filter((selection) => selection.round >= 16)
        .every((selection) => {
          const position = playersById.get(selection.playerId)?.position;
          return position === "K" || position === "DST";
        }),
    ).toBe(true);
  });

  it("allows either reserved-round order and forces the other position last", () => {
    const draft = simulateAutomaticDraft(
      SIMULATION_PLAYERS,
      3,
      "reserved-order-reference",
    );
    const roster = draft.rosters.get(3)!.slice(0, 15);
    const rosterIds = new Set(roster.map((player) => player.id));
    const available = SIMULATION_PLAYERS.filter(
      (player) => !rosterIds.has(player.id),
    );
    const roundSixteenLegal = getLegalDraftCandidates(available, roster, 2);
    const kicker = roundSixteenLegal.find((player) => player.position === "K")!;
    const defense = roundSixteenLegal.find((player) => player.position === "DST")!;
    expect(kicker).toBeTruthy();
    expect(defense).toBeTruthy();

    const afterKicker = [...roster, kicker];
    const afterDefense = [...roster, defense];
    expect(
      getLegalDraftCandidates(
        available.filter((player) => player.id !== kicker.id),
        afterKicker,
        1,
      ).every((player) => player.position === "DST"),
    ).toBe(true);
    expect(
      getLegalDraftCandidates(
        available.filter((player) => player.id !== defense.id),
        afterDefense,
        1,
      ).every((player) => player.position === "K"),
    ).toBe(true);

    const secondKicker = SIMULATION_PLAYERS.find(
      (player) =>
        player.position === "K" &&
        !roster.some((entry) => entry.id === player.id),
    )!;
    const secondDefense = SIMULATION_PLAYERS.find(
      (player) =>
        player.position === "DST" &&
        !roster.some((entry) => entry.id === player.id),
    )!;
    const offensivePlayer = roster.find(
      (player) => player.position !== "K" && player.position !== "DST",
    )!;
    const preRoundFifteen = roster.filter(
      (player) => player.id !== offensivePlayer.id,
    );
    expect(canAddPlayer(preRoundFifteen, secondKicker, 3)).toBe(false);
    expect(canAddPlayer(preRoundFifteen, secondDefense, 3)).toBe(false);
  });

  it("produces deterministic, legal CPU drafts from all 12 slots", () => {
    const first = simulateAutomaticDraft(SIMULATION_PLAYERS, 8, "repeatable-seed");
    const repeated = simulateAutomaticDraft(SIMULATION_PLAYERS, 8, "repeatable-seed");
    expect(repeated.selections).toEqual(first.selections);

    const varied = simulateAutomaticDraft(SIMULATION_PLAYERS, 8, "different-seed");
    expect(varied.selections.map((pick) => pick.playerId)).not.toEqual(
      first.selections.map((pick) => pick.playerId),
    );

    for (let slot = 1; slot <= 12; slot += 1) {
      const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, slot, `slot-${slot}`);
      expect(draft.selections).toHaveLength(204);
      expect(new Set(draft.selections.map((pick) => pick.playerId)).size).toBe(204);
      for (const roster of draft.rosters.values()) {
        expect(isLegalCompletedRoster(roster)).toBe(true);
        const counts = countRosterPositions(roster);
        expect(roster).toHaveLength(17);
        expect(counts.K).toBe(2);
        expect(counts.DST).toBe(2);
      }
      const playersById = new Map(
        SIMULATION_PLAYERS.map((player) => [player.id, player]),
      );
      expect(
        draft.selections
          .filter((selection) => selection.round >= 16)
          .every((selection) => {
            const position = playersById.get(selection.playerId)?.position;
            return position === "K" || position === "DST";
          }),
      ).toBe(true);
    }
  }, 30_000);

  it("auto-pick preserves legal completion", () => {
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 4, "auto-legality");
    const roster = draft.rosters.get(4)!;
    const available = SIMULATION_PLAYERS.filter(
      (player) => !draft.selections.some((selection) => selection.playerId === player.id),
    );
    expect(chooseAutoPick(available, roster.slice(0, 16), 1)).toBeTruthy();
    const counts = countRosterPositions(roster);
    expect(counts.K).toBe(2);
    expect(counts.DST).toBe(2);
    const specialRounds = draft.selections
      .filter((selection) => selection.slot === 4 && selection.round >= 16)
      .map(
        (selection) =>
          SIMULATION_PLAYERS.find((player) => player.id === selection.playerId)!
            .position,
      );
    expect(specialRounds.sort()).toEqual(["DST", "K"]);
    expect(
      draft.selections.filter(
        (selection) => selection.slot === 4 && selection.source === "auto",
      ),
    ).toHaveLength(17);
  });
});

describe("16-0 lineup and scoring", () => {
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 6, "lineup-seed");
  const roster = draft.rosters.get(6)!;

  it("selects a unique projected starting roster and excludes bye players weekly", () => {
    const starting = optimizeProjectedStartingRoster(roster);
    expect(new Set(Object.values(starting).map((player) => player.id)).size).toBe(9);

    const weekly = optimizeLineup(roster, 6, DEFENSE_POSITION_RANKS);
    expect(
      Object.values(weekly)
        .filter(Boolean)
        .every((player) => player!.byeWeek !== 6),
    ).toBe(true);
    expect(new Set(Object.values(weekly).filter(Boolean).map((player) => player!.id)).size).toBe(
      Object.values(weekly).filter(Boolean).length,
    );
  });

  it("replaces a bye-week QB with an eligible bench QB", () => {
    const quarterbacks = SIMULATION_PLAYERS.filter((player) => player.position === "QB");
    const starter = quarterbacks[0];
    const backup = quarterbacks.find((player) => player.byeWeek !== starter.byeWeek)!;
    const weekly = optimizeLineup(
      [starter, backup, ...roster.filter((player) => player.position !== "QB")],
      starter.byeWeek!,
      DEFENSE_POSITION_RANKS,
    );
    expect(weekly.QB?.id).toBe(backup.id);
    expect(weekly.QB?.byeWeek).not.toBe(starter.byeWeek);
  });

  it("maps easy, neutral, hard, and missing defense ranks correctly", () => {
    expect(getMatchupMultiplier(1)).toBe(1.07);
    expect(getMatchupMultiplier(12)).toBe(1.02);
    expect(getMatchupMultiplier(20)).toBe(1);
    expect(getMatchupMultiplier(32)).toBe(0.93);
    expect(getMatchupMultiplier(null)).toBe(1);
  });

  it("uses expected value and converges near the adjusted player mean", () => {
    const player = SIMULATION_PLAYERS[0];
    const expected = getExpectedPlayerScore(player, 1, DEFENSE_POSITION_RANKS);
    const tiers = buildPlayerTierMap(SIMULATION_PLAYERS);
    const samples = Array.from({ length: 20_000 }, (_, index) =>
      simulatePlayerScore(
        expected,
        player,
        tiers.get(player.id)!,
        new SeededRandom(`score-${index}`),
      ),
    );
    const mean = samples.reduce((total, score) => total + score, 0) / samples.length;
    expect(mean).toBeGreaterThan(expected * 0.92);
    expect(mean).toBeLessThan(expected * 1.08);
    expect(Math.max(...samples)).toBeGreaterThan(expected * 1.8);
  });
});

const sampleCpuStrengths = Array.from({ length: 11 }, (_, index) => ({
  slot: index + 1,
  strength: 105 + index * 2,
}));

describe("16-0 season simulation", () => {
  it("always gives a 14-0 user a top-two seed and bye", () => {
    for (let index = 0; index < 100; index += 1) {
      const qualification = determinePlayoffQualification({
        userWins: 14,
        userLosses: 0,
        userAverageScore: 120,
        cpuStrengths: sampleCpuStrengths,
        random: new SeededRandom(`qualification-${index}`),
      });
      expect(qualification.qualified).toBe(true);
      expect(qualification.hasBye).toBe(true);
      expect(qualification.seed).toBeLessThanOrEqual(2);
    }
  });

  it("simulates 14 regular-season rows and internally consistent final records", () => {
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 9, "season-draft");
    const result = simulateSeason({
      roster: draft.rosters.get(9)!,
      userSlot: 9,
      allRosters: Object.fromEntries(draft.rosters),
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: new Set(
        draft.selections.map((selection) => selection.playerId),
      ),
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
      seed: "season-outcomes",
    });
    expect(result.schedule.filter((game) => game.fantasyWeek <= 14)).toHaveLength(14);
    expect(result.regularWins + result.regularLosses).toBe(14);
    expect(result.finalWins).toBe(result.regularWins + result.playoffWins);
    expect(result.finalLosses).toBe(result.regularLosses + result.playoffLosses);
    expect(Number.isFinite(result.averageWeeklyScore)).toBe(true);
    expect(new Set(result.schedule.map((game) => game.opponentName)).size).toBe(result.schedule.length);
  });
});
