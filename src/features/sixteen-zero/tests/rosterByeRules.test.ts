import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import {
  getEmptyLineupSlots,
  getExpectedPlayerScore,
  optimizeLineup,
} from "../engine/lineupOptimizer";
import {
  buildPlayerTierMap,
  simulateLineupScore,
} from "../engine/playerScoreSimulation";
import { countRosterPositions, isLegalCompletedRoster } from "../engine/rosterRules";
import { SeededRandom } from "../engine/seededRandom";
import { simulateSeason } from "../engine/seasonSimulation";
import type { SimulationPlayer, WeeklyLineup } from "../types";

const names = OPPONENT_NAMES.map((entry) => entry.name);
const tiers = buildPlayerTierMap(SIMULATION_PLAYERS);

function referenceFixture(seed = "bye-reference") {
  const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 1, seed);
  const draftedPlayerIds = new Set(
    draft.selections.map((selection) => selection.playerId),
  );
  return {
    draft,
    roster: draft.rosters.get(1)!,
    userSlot: 1,
    allRosters: Object.fromEntries(draft.rosters),
    draftedPlayerIds,
    temporaryReplacementPool: SIMULATION_PLAYERS.filter(
      (player) => !draftedPlayerIds.has(player.id),
    ),
  };
}

function withSameBye(
  roster: readonly SimulationPlayer[],
  position: "K" | "DST",
  week: number,
) {
  return roster.map((player) =>
    player.position === position ? { ...player, byeWeek: week } : player,
  );
}

function lineupIds(lineup: WeeklyLineup) {
  return Object.fromEntries(
    Object.entries(lineup).map(([slot, player]) => [slot, player?.id ?? null]),
  );
}

describe("16-0 two-K/two-DST lineup optimization", () => {
  it("starts only the highest expected eligible drafted K and DST", () => {
    const fixture = referenceFixture();
    const week = 1;
    const lineup = optimizeLineup(fixture.roster, week, {}, {
      temporaryReplacementPool: fixture.temporaryReplacementPool,
    });
    const eligibleKickers = fixture.roster
      .filter((player) => player.position === "K" && player.byeWeek !== week)
      .sort(
        (first, second) =>
          getExpectedPlayerScore(second, week, {}) -
          getExpectedPlayerScore(first, week, {}),
      );
    const eligibleDefenses = fixture.roster
      .filter((player) => player.position === "DST" && player.byeWeek !== week)
      .sort(
        (first, second) =>
          getExpectedPlayerScore(second, week, {}) -
          getExpectedPlayerScore(first, week, {}),
      );

    expect(countRosterPositions(fixture.roster).K).toBe(2);
    expect(countRosterPositions(fixture.roster).DST).toBe(2);
    expect(lineup.K?.id).toBe(eligibleKickers[0]?.id);
    expect(lineup.DST?.id).toBe(eligibleDefenses[0]?.id);
    expect(Object.values(lineup).filter((player) => player?.position === "K")).toHaveLength(1);
    expect(Object.values(lineup).filter((player) => player?.position === "DST")).toHaveLength(1);
  });

  it("uses drafted backups before temporary replacements", () => {
    const fixture = referenceFixture("backup-special-teams");
    const week = 6;
    const kickers = fixture.roster
      .filter((player) => player.position === "K")
      .sort((first, second) => second.blendedPPG - first.blendedPPG);
    const defenses = fixture.roster
      .filter((player) => player.position === "DST")
      .sort((first, second) => second.blendedPPG - first.blendedPPG);
    const revised = fixture.roster.map((player) => {
      if (player.id === kickers[0].id || player.id === defenses[0].id) {
        return { ...player, byeWeek: week };
      }
      if (player.id === kickers[1].id || player.id === defenses[1].id) {
        return { ...player, byeWeek: week + 1 };
      }
      return player;
    });
    const lineup = optimizeLineup(revised, week, {}, {
      temporaryReplacementPool: fixture.temporaryReplacementPool,
    });
    expect(lineup.K?.id).toBe(kickers[1].id);
    expect(lineup.DST?.id).toBe(defenses[1].id);
  });

  it("uses unique, undrafted, scored temporary replacements for same-bye K and DST pairs", () => {
    const fixture = referenceFixture("same-bye-special");
    const week = 7;
    const roster = withSameBye(
      withSameBye(fixture.roster, "K", week),
      "DST",
      week,
    );
    expect(isLegalCompletedRoster(roster)).toBe(true);
    const lineup = optimizeLineup(roster, week, DEFENSE_POSITION_RANKS, {
      temporaryReplacementPool: fixture.temporaryReplacementPool,
    });

    expect(lineup.K).not.toBeNull();
    expect(lineup.DST).not.toBeNull();
    expect(lineup.K?.position).toBe("K");
    expect(lineup.DST?.position).toBe("DST");
    expect(lineup.K?.byeWeek).not.toBe(week);
    expect(lineup.DST?.byeWeek).not.toBe(week);
    expect(fixture.draftedPlayerIds.has(lineup.K!.id)).toBe(false);
    expect(fixture.draftedPlayerIds.has(lineup.DST!.id)).toBe(false);
    expect(getEmptyLineupSlots(lineup)).toEqual([]);

    const selected = Object.values(lineup);
    expect(new Set(selected.map((player) => player!.id)).size).toBe(9);
    const score = simulateLineupScore(
      lineup,
      week,
      DEFENSE_POSITION_RANKS,
      tiers,
      new SeededRandom("temporary-special-score"),
    );
    expect(score.slotScores.K).not.toBe(0);
    expect(score.slotScores.DST).toBeDefined();
    expect(score.playerScores).toHaveLength(9);
  });

  it("fills offensive bye gaps without duplicating players or violating FLEX", () => {
    const fixture = referenceFixture("offensive-bye-overlap");
    const week = 8;
    const roster = fixture.roster.map((player) =>
      player.position === "RB" || player.position === "WR" || player.position === "TE"
        ? { ...player, byeWeek: week }
        : player,
    );
    const lineup = optimizeLineup(roster, week, DEFENSE_POSITION_RANKS, {
      temporaryReplacementPool: fixture.temporaryReplacementPool,
    });
    expect(getEmptyLineupSlots(lineup)).toEqual([]);
    expect(["RB", "WR", "TE"]).toContain(lineup.FLEX?.position);
    const selected = Object.values(lineup).filter(
      (player): player is SimulationPlayer => player !== null,
    );
    expect(new Set(selected.map((player) => player.id)).size).toBe(selected.length);
  });
});

describe("16-0 temporary coverage outcome behavior", () => {
  it("keeps opponent draws independent of same-bye replacements and can still win", () => {
    const fixture = referenceFixture("outcome-independence");
    const week = 6;
    const replacementRoster = withSameBye(
      withSameBye(fixture.roster, "K", week),
      "DST",
      week,
    );
    const baseline = simulateSeason({
      roster: fixture.roster,
      userSlot: fixture.userSlot,
      allRosters: fixture.allRosters,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: fixture.draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed: "independent-opponents",
    });
    const depleted = simulateSeason({
      roster: replacementRoster,
      userSlot: fixture.userSlot,
      allRosters: fixture.allRosters,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: fixture.draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed: "independent-opponents",
    });
    expect(
      depleted.schedule
        .filter((game) => game.fantasyWeek <= 14)
        .map((game) => game.opponentScore),
    ).toEqual(
      baseline.schedule
        .filter((game) => game.fantasyWeek <= 14)
        .map((game) => game.opponentScore),
    );

    const lowOpponent = simulateSeason({
      roster: replacementRoster,
      userSlot: fixture.userSlot,
      allRosters: fixture.allRosters,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: fixture.draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed: "replacement-can-win",
      overrides: {
        regularOpponentScores: Array.from(
          { length: 14 },
          (_, index) => (index + 1 === week ? 0 : 500),
        ),
        qualification: { qualified: false, seed: null, hasBye: false },
      },
    });
    const game = lowOpponent.schedule[week - 1];
    expect(game.userScore).toBeGreaterThan(0);
    expect(game.opponentScore).toBe(0);
    expect(game.result).toBe("W");
  });

  it("reproduces draft picks, replacement lineups, scores, record, and playoffs exactly", () => {
    const first = referenceFixture("complete-determinism-v3");
    const repeated = referenceFixture("complete-determinism-v3");
    expect(repeated.draft.selections).toEqual(first.draft.selections);
    expect(
      repeated.roster.filter((player) => player.position === "K" || player.position === "DST"),
    ).toEqual(
      first.roster.filter((player) => player.position === "K" || player.position === "DST"),
    );

    const firstLineups = Array.from({ length: 17 }, (_, index) =>
      optimizeLineup(first.roster, index + 1, DEFENSE_POSITION_RANKS, {
        temporaryReplacementPool: first.temporaryReplacementPool,
      }),
    );
    const repeatedLineups = Array.from({ length: 17 }, (_, index) =>
      optimizeLineup(repeated.roster, index + 1, DEFENSE_POSITION_RANKS, {
        temporaryReplacementPool: repeated.temporaryReplacementPool,
      }),
    );
    expect(repeatedLineups.map(lineupIds)).toEqual(firstLineups.map(lineupIds));
    expect(repeatedLineups.every((lineup) => getEmptyLineupSlots(lineup).length === 0)).toBe(true);

    const firstSeason = simulateSeason({
      roster: first.roster,
      userSlot: first.userSlot,
      allRosters: first.allRosters,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: first.draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed: "complete-determinism-v3",
    });
    const repeatedSeason = simulateSeason({
      roster: repeated.roster,
      userSlot: repeated.userSlot,
      allRosters: repeated.allRosters,
      playerUniverse: SIMULATION_PLAYERS,
      draftedPlayerIds: repeated.draftedPlayerIds,
      defenseRanks: DEFENSE_POSITION_RANKS,
      opponentNames: names,
      seed: "complete-determinism-v3",
    });
    expect(repeatedSeason).toEqual(firstSeason);

    const varied = referenceFixture("complete-determinism-varied");
    expect(varied.draft.selections.map((pick) => pick.playerId)).not.toEqual(
      first.draft.selections.map((pick) => pick.playerId),
    );
  });
});
